import { create } from "zustand";
import type { ChatAgentId } from "../types/agentPanel";
import type { ContextEntry } from "../types/contextBridge";

const MAX_ENTRIES = 100;
const DEFAULT_MAX_INJECTION_TOKENS = 4000;
/** Entries younger than this are never evicted */
const MIN_AGE_FOR_EVICTION_MS = 5 * 60_000;

// ---------- 3a: Composite scoring helpers ----------

const CATEGORY_WEIGHTS: Record<string, number> = {
  error: 1.3,
  decision: 1.4,
  architecture: 1.3,
  file_change: 1.0,
  task_progress: 0.9,
  discovery: 0.8,
  general: 0.7,
};

function recencyMultiplier(timestamp: number): number {
  const ageMinutes = (Date.now() - timestamp) / 60_000;
  if (ageMinutes < 5) return 1.0;
  if (ageMinutes < 60) return 1.0 - ((ageMinutes - 5) / 55) * 0.5; // 1.0 → 0.5
  return 0.3;
}

function filePathAffinity(entry: ContextEntry, targetRecentPaths: string[]): number {
  if (!entry.filePaths?.length || !targetRecentPaths.length) return 1.0;
  const overlap = entry.filePaths.filter((p) => targetRecentPaths.includes(p));
  return 1.0 + overlap.length * 0.2;
}

function sequentialBoost(entry: ContextEntry, recentMessageIds: string[]): number {
  const idx = recentMessageIds.indexOf(entry.sourceMessageId);
  if (idx === -1) return 1.0;
  return 1.0 + (recentMessageIds.length - idx) * 0.05;
}

// ---------- Store ----------

interface ContextBridgeState {
  entries: ContextEntry[];
  isExtracting: boolean;
  lastError: string | null;
  enabled: boolean;
  maxInjectionTokens: number;
  /** Recently touched file paths per agent (for file-path affinity scoring) */
  recentFilePaths: Record<ChatAgentId, string[]>;
  /** Pinned entry IDs that resist eviction */
  pinnedIds: Set<string>;

  addEntries: (entries: ContextEntry[]) => void;
  removeEntry: (id: string) => void;
  clearEntriesForAgent: (agentId: ChatAgentId) => void;
  clearAll: () => void;
  setExtracting: (val: boolean) => void;
  setLastError: (err: string | null) => void;
  setEnabled: (val: boolean) => void;
  getEntriesForInjection: (targetAgent: ChatAgentId) => ContextEntry[];
  pinEntry: (id: string) => void;
  unpinEntry: (id: string) => void;
}

export const useContextBridgeStore = create<ContextBridgeState>((set, get) => ({
  entries: [],
  isExtracting: false,
  lastError: null,
  enabled: true,
  maxInjectionTokens: DEFAULT_MAX_INJECTION_TOKENS,
  recentFilePaths: { "claude-code": [], opencode: [], gemini: [], codex: [] },
  pinnedIds: new Set<string>(),

  addEntries: (newEntries) =>
    set((s) => {
      const merged = [...s.entries, ...newEntries];

      // Update recentFilePaths from incoming entries
      const updatedPaths = { ...s.recentFilePaths };
      for (const entry of newEntries) {
        if (entry.filePaths?.length) {
          const existing = updatedPaths[entry.sourceAgent] || [];
          const combined = [...new Set([...entry.filePaths, ...existing])].slice(0, 50);
          updatedPaths[entry.sourceAgent] = combined;
        }
      }

      // 3c: Importance-weighted eviction if over cap
      let trimmed: ContextEntry[];
      if (merged.length > MAX_ENTRIES) {
        const now = Date.now();
        const pinnedIds = s.pinnedIds;

        // Score each entry for eviction priority (higher = keep)
        const scored = merged.map((e) => ({
          entry: e,
          evictionScore:
            e.relevance *
            recencyMultiplier(e.timestamp) *
            (CATEGORY_WEIGHTS[e.category] ?? 1.0) *
            (pinnedIds.has(e.id) ? 10.0 : 1.0),
          isTooYoung: now - e.timestamp < MIN_AGE_FOR_EVICTION_MS,
        }));

        // Separate protected (too young) from evictable
        const tooYoung = scored.filter((s) => s.isTooYoung);
        const evictable = scored.filter((s) => !s.isTooYoung);

        // Sort evictable by score descending, keep top entries to fill remaining budget
        evictable.sort((a, b) => b.evictionScore - a.evictionScore);
        const keepCount = Math.max(0, MAX_ENTRIES - tooYoung.length);
        const kept = evictable.slice(0, keepCount);

        trimmed = [...tooYoung.map((s) => s.entry), ...kept.map((s) => s.entry)];
        // Maintain chronological order
        trimmed.sort((a, b) => a.timestamp - b.timestamp);
      } else {
        trimmed = merged;
      }

      return { entries: trimmed, recentFilePaths: updatedPaths };
    }),

  removeEntry: (id) =>
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

  clearEntriesForAgent: (agentId) =>
    set((s) => ({ entries: s.entries.filter((e) => e.sourceAgent !== agentId) })),

  clearAll: () => set({ entries: [], pinnedIds: new Set() }),

  setExtracting: (val) => set({ isExtracting: val }),
  setLastError: (err) => set({ lastError: err }),
  setEnabled: (val) => set({ enabled: val }),

  pinEntry: (id) =>
    set((s) => {
      const next = new Set(s.pinnedIds);
      next.add(id);
      return { pinnedIds: next };
    }),

  unpinEntry: (id) =>
    set((s) => {
      const next = new Set(s.pinnedIds);
      next.delete(id);
      return { pinnedIds: next };
    }),

  getEntriesForInjection: (targetAgent) => {
    const state = get();
    if (!state.enabled) return [];

    // Gather recent message IDs from the entries (last 20 unique)
    const recentMessageIds = [...new Set(state.entries.map((e) => e.sourceMessageId))].slice(-20);
    const targetPaths = state.recentFilePaths[targetAgent] || [];

    const candidates = state.entries
      .filter((e) => e.sourceAgent !== targetAgent)
      .map((e) => ({
        ...e,
        _score:
          e.relevance *
          recencyMultiplier(e.timestamp) *
          (CATEGORY_WEIGHTS[e.category] ?? 1.0) *
          filePathAffinity(e, targetPaths) *
          sequentialBoost(e, recentMessageIds),
      }))
      .sort((a, b) => b._score - a._score);

    // Greedy pack within token budget
    let budget = state.maxInjectionTokens;
    const selected: ContextEntry[] = [];
    for (const entry of candidates) {
      const tokens = Math.ceil(entry.content.length / 4);
      if (budget - tokens < 0) continue;
      selected.push(entry);
      budget -= tokens;
    }
    return selected;
  },
}));
