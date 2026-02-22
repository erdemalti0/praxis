/**
 * Zustand store for the memory system.
 * Manages project memory state, search, and persistence.
 */

import { create } from "zustand";
import { createDebouncedSaver } from "@/lib/persistence";
import { JsonMemoryStorage, createEmptyStore } from "@/lib/memory/storage";
import { MemoryIndexer } from "@/lib/memory/indexer";
import { RetrievalPipeline } from "@/lib/memory/retrieval";
import { mergeAliases, DEFAULT_ALIASES } from "@/lib/memory/aliases";
import { redact } from "@/lib/memory/redaction";
import { detectConflicts } from "@/lib/memory/conflictDetector";
import { finalizeSession, finalizeSessionSync } from "@/lib/memory/sessionFinalizer";
import { compactMemory } from "@/lib/memory/compaction";
import { runPromotionPipeline, findingToMemoryEntry } from "@/lib/memory/promotionEngine";
import { AuditLogger } from "@/lib/memory/auditLog";
import { MessageTracker } from "@/lib/memory/messageTracker";
import { checkDuplicate } from "@/lib/memory/duplicateDetector";
import { PROMOTION_PRESETS, DEFAULT_FEATURE_FLAGS } from "@/lib/memory/types";
import type { ChatMessage, ChatAgentId } from "@/types/agentPanel";
import type {
  MemoryStore,
  MemoryEntry,
  MemoryEntryStatus,
  MemoryCategory,
  MemorySource,
  SearchResult,
  SearchOptions,
  MemoryStatus,
} from "@/lib/memory/types";

// ─── Helpers ──────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function computeFingerprint(content: string): string {
  // Simple hash using Web Crypto API fallback — sync SHA-256 alternative
  // For Phase 1, use a fast non-crypto hash (djb2 variant)
  const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(16, "0");
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

// ─── Store ────────────────────────────────────────────────────────────

interface MemoryState {
  store: MemoryStore;
  isLoaded: boolean;
  lastError: string | null;
  projectPath: string | null;

  // Internal
  _storage: JsonMemoryStorage | null;
  _indexer: MemoryIndexer;
  _retrieval: RetrievalPipeline;
  _saver: ReturnType<typeof createDebouncedSaver>;
  _auditLogger: AuditLogger | null;
  _lastInjected: Array<{ id: string; content: string; score: number }>;
  _messageTracker: MessageTracker;

  // Actions
  load: (homeDir: string, projectPath: string) => void;
  save: () => void;
  addEntry: (params: {
    content: string;
    category: MemoryCategory;
    importance: number;
    status: MemoryEntryStatus;
    confidence: number;
    source: MemorySource;
    filePaths?: string[];
    tags?: string[];
  }) => { id: string; isDuplicate: boolean } | null;
  removeEntry: (id: string) => void;
  updateEntry: (id: string, updates: Partial<Pick<MemoryEntry, "importance" | "status" | "tags" | "accessCount" | "lastAccessedAt">>) => void;
  getEntry: (id: string) => MemoryEntry | undefined;
  search: (query: string, options?: Partial<SearchOptions>) => SearchResult[];
  getStatus: () => MemoryStatus;
  recordInjection: (results: SearchResult[], targetAgent?: string) => void;
  addMessagePointer: (messageId: string, content: string) => void;
  getMessagePointers: () => import("@/lib/memory/types").MessagePointer[];
  finalizeCurrentSession: (sessionId: string, messages: ChatMessage[], agentId: ChatAgentId) => Promise<void>;
  finalizeCurrentSessionSync: (sessionId: string, messages: ChatMessage[], agentId: ChatAgentId) => void;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  store: createEmptyStore(),
  isLoaded: false,
  lastError: null,
  projectPath: null,

  _storage: null,
  _indexer: new MemoryIndexer(),
  _retrieval: new RetrievalPipeline(),
  _saver: createDebouncedSaver(1000),
  _auditLogger: null,
  _lastInjected: [],
  _messageTracker: new MessageTracker(),

  load(homeDir: string, projectPath: string) {
    try {
      const storage = new JsonMemoryStorage(homeDir, projectPath);
      const store = storage.loadProjectMemory();

      // Initialize audit logger
      const memoryDir = storage.filePath.replace(/\/[^/]+$/, "");
      const auditLogger = new AuditLogger(memoryDir);

      // Merge default aliases with stored aliases
      store.aliases = mergeAliases(DEFAULT_ALIASES, store.aliases);

      // Ensure conflicts array exists (backward compatibility)
      if (!store.conflicts) store.conflicts = [];

      // Ensure new metadata fields exist (backward compatibility)
      if (store.metadata.autoMemoryEnabled === undefined) store.metadata.autoMemoryEnabled = true;
      if (!store.metadata.configPreset) store.metadata.configPreset = "balanced";
      if (!store.metadata.featureFlags) store.metadata.featureFlags = { ...DEFAULT_FEATURE_FLAGS };

      // Process quarantined candidates
      store.entries = processQuarantinedEntries(store.entries);

      // Run compaction (decay + eviction)
      const compacted = compactMemory(store);
      Object.assign(store, compacted);

      // Rebuild search index
      const indexer = get()._indexer;
      indexer.rebuild(store.entries);

      set({
        store,
        isLoaded: true,
        lastError: null,
        projectPath,
        _storage: storage,
        _auditLogger: auditLogger,
      });

      console.log(`[memory] Loaded ${store.entries.length} entries for project`);
    } catch (err) {
      console.error("[memory] Failed to load:", err);
      set({ lastError: String(err), isLoaded: false });
    }
  },

  save() {
    const state = get();
    if (!state._storage || !state.isLoaded) return;

    state._saver(state._storage.filePath, state.store as unknown as Record<string, unknown>);
  },

  addEntry(params) {
    const state = get();
    if (!state.isLoaded) return null;

    // Redact PII/secrets
    const { redacted, hadPII } = redact(params.content);
    if (hadPII) {
      console.log("[memory] PII redacted from entry");
    }

    // Enforce max content length
    const content = redacted.slice(0, 500);

    // Check for duplicate via fingerprint
    const fingerprint = computeFingerprint(content);
    const existing = state.store.entries.find((e) => e.fingerprint === fingerprint);

    if (existing) {
      // Boost existing entry instead of creating duplicate
      const updatedEntries = state.store.entries.map((e) =>
        e.id === existing.id
          ? {
              ...e,
              importance: Math.min(1.0, e.importance + 0.1),
              accessCount: e.accessCount + 1,
              updatedAt: Date.now(),
            }
          : e,
      );

      const updatedStore = {
        ...state.store,
        entries: updatedEntries,
        metadata: { ...state.store.metadata, totalAccesses: state.store.metadata.totalAccesses + 1 },
      };

      set({ store: updatedStore });
      get().save();
      return { id: existing.id, isDuplicate: true };
    }

    // Near-duplicate suppression (Phase 5)
    const featureFlags = state.store.metadata.featureFlags;
    if (featureFlags?.duplicateSuppression) {
      const dupCheck = checkDuplicate(content, state.store.entries, state._indexer, state.store.aliases);
      if (dupCheck.isDuplicate && dupCheck.matchedEntryId) {
        // Boost original entry's access count
        const boostedEntries = state.store.entries.map((e) =>
          e.id === dupCheck.matchedEntryId
            ? { ...e, accessCount: e.accessCount + 1, updatedAt: Date.now() }
            : e,
        );

        // Create the entry but mark as suppressed
        const now = Date.now();
        const suppressedEntry: MemoryEntry = {
          id: generateId(),
          fingerprint,
          content,
          category: params.category,
          importance: params.importance,
          status: params.status,
          confidence: params.confidence,
          source: params.source,
          filePaths: params.filePaths,
          tags: params.tags,
          accessCount: 0,
          lastAccessedAt: now,
          createdAt: now,
          updatedAt: now,
          suppressed: true,
          suppressedBy: dupCheck.matchedEntryId,
          suppressedAt: now,
        };

        const updatedStore = {
          ...state.store,
          entries: [...boostedEntries, suppressedEntry],
        };

        set({ store: updatedStore });
        get().save();
        return { id: suppressedEntry.id, isDuplicate: true };
      }
    }

    // Create new entry
    const now = Date.now();
    const entry: MemoryEntry = {
      id: generateId(),
      fingerprint,
      content,
      category: params.category,
      importance: params.importance,
      status: params.status,
      confidence: params.confidence,
      source: params.source,
      filePaths: params.filePaths,
      tags: params.tags,
      accessCount: 0,
      lastAccessedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    // Detect conflicts with existing entries
    const newConflicts = detectConflicts(entry, state.store.entries);
    if (newConflicts.length > 0) {
      console.log(`[memory] ${newConflicts.length} conflict(s) detected for new entry`);
    }

    // Mark conflicted entries as contradicted in telemetry
    if (newConflicts.length > 0 && state.store.metadata.featureFlags?.injectionTelemetry) {
      for (const conflict of newConflicts) {
        const conflictedEntry = state.store.entries.find((e) => e.id === conflict.entryA);
        if (conflictedEntry?.telemetry) {
          conflictedEntry.telemetry.wasContradicted = true;
        }
      }
    }

    const updatedEntries = [...state.store.entries, entry];
    const updatedStore = {
      ...state.store,
      entries: updatedEntries,
      conflicts: [...state.store.conflicts, ...newConflicts],
      metadata: {
        ...state.store.metadata,
        totalPromotions: state.store.metadata.totalPromotions + 1,
      },
    };

    // Update index
    state._indexer.add(entry);

    // Journal-first: log before mutation
    state._auditLogger?.log({
      action: "add",
      entryId: entry.id,
      details: content.slice(0, 100),
      source: params.source.promotionSignals.includes("user-intent") ? "user" : "auto",
    });

    set({ store: updatedStore });
    get().save();

    return { id: entry.id, isDuplicate: false };
  },

  removeEntry(id: string) {
    const state = get();
    if (!state.isLoaded) return;

    const entry = state.store.entries.find((e) => e.id === id);
    if (!entry) return;

    // Journal-first: log before mutation
    state._auditLogger?.log({
      action: "remove",
      entryId: id,
      details: entry.content.slice(0, 100),
      source: "user",
    });

    state._indexer.remove(entry);

    const updatedStore = {
      ...state.store,
      entries: state.store.entries.filter((e) => e.id !== id),
      metadata: {
        ...state.store.metadata,
        totalEvictions: state.store.metadata.totalEvictions + 1,
      },
    };

    set({ store: updatedStore });
    get().save();
  },

  updateEntry(id: string, updates) {
    const state = get();
    if (!state.isLoaded) return;

    const updatedEntries = state.store.entries.map((e) =>
      e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e,
    );

    set({ store: { ...state.store, entries: updatedEntries } });
    get().save();
  },

  getEntry(id: string) {
    return get().store.entries.find((e) => e.id === id);
  },

  search(query: string, options?: Partial<SearchOptions>) {
    const state = get();
    if (!state.isLoaded || state.store.entries.length === 0) return [];

    const { retrievalResults } = state._retrieval.retrieve(
      query,
      state.store.entries,
      state._indexer,
      state.store.aliases,
      {
        filePaths: options?.filePaths,
        categories: options?.categories,
      },
    );

    return retrievalResults;
  },

  getStatus(): MemoryStatus {
    const state = get();
    const entries = state.store.entries;

    const byStatus: Record<MemoryEntryStatus, number> = {
      pinned: 0,
      confirmed: 0,
      candidate: 0,
    };
    const byCategory: Partial<Record<MemoryCategory, number>> = {};

    let totalTokens = 0;

    for (const entry of entries) {
      byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
      totalTokens += estimateTokens(entry.content) + 15;
    }

    return {
      entryCount: entries.length,
      byStatus,
      byCategory,
      estimatedTokens: totalTokens,
      lastInjected: state._lastInjected,
      indexHealth: state._indexer.getHealth(),
    };
  },

  recordInjection(results: SearchResult[], targetAgent?: string) {
    const state = get();
    const now = Date.now();

    // Track last injected for /memory status
    const lastInjected = results.map((r) => ({
      id: r.entry.id,
      content: r.entry.content.slice(0, 80),
      score: r.score,
    }));

    // Increment access counts + telemetry
    const ids = new Set(results.map((r) => r.entry.id));
    const telemetryEnabled = state.store.metadata.featureFlags?.injectionTelemetry;
    const updatedEntries = state.store.entries.map((e) => {
      if (!ids.has(e.id)) return e;

      const updated = { ...e, accessCount: e.accessCount + 1, lastAccessedAt: now };

      // Update per-entry telemetry when enabled
      if (telemetryEnabled && targetAgent) {
        const telemetry = updated.telemetry ?? {
          injectionCount: 0,
          lastInjectedAt: 0,
          targetAgents: [],
          wasContradicted: false,
          wasUseful: true,
        };
        telemetry.injectionCount++;
        telemetry.lastInjectedAt = now;
        if (!telemetry.targetAgents.includes(targetAgent)) {
          telemetry.targetAgents.push(targetAgent);
        }
        updated.telemetry = telemetry;
      }

      return updated;
    });

    set({
      store: {
        ...state.store,
        entries: updatedEntries,
        metadata: {
          ...state.store.metadata,
          totalAccesses: state.store.metadata.totalAccesses + results.length,
        },
      },
      _lastInjected: lastInjected,
    });

    // Debounced save
    get().save();
  },

  addMessagePointer(messageId: string, content: string) {
    const state = get();
    if (!state.isLoaded || !state.store.metadata.featureFlags?.messagePointers) return;
    state._messageTracker.addPointer(messageId, content);
  },

  getMessagePointers() {
    return get()._messageTracker.getPointers();
  },

  async finalizeCurrentSession(sessionId: string, messages: ChatMessage[], agentId: ChatAgentId) {
    const state = get();
    if (!state.isLoaded || !state._storage) return;

    try {
      const sessionMemory = await finalizeSession(sessionId, messages, agentId);

      // Clear message pointers after finalization
      state._messageTracker.clear();

      // Save session memory
      state._storage.saveSessionMemory(sessionMemory);

      // Run promotion pipeline with active config preset
      const config = PROMOTION_PRESETS[state.store.metadata.configPreset || "balanced"];
      const promotionResult = runPromotionPipeline(
        sessionMemory,
        state.store.entries,
        [sessionMemory], // simplified: just current session for now
        config,
      );

      // Promote entries that qualify
      for (const check of promotionResult.promoted) {
        const entryParams = findingToMemoryEntry(check.finding, sessionMemory, check.signals);
        state.addEntry(entryParams);
      }

      // Audit log the finalization
      state._auditLogger?.log({
        action: "finalize",
        entryId: sessionId,
        details: `${sessionMemory.findings.length} findings, ${promotionResult.promoted.length} promoted`,
        source: "auto",
      });

      console.log(`[memory] Session finalized: ${sessionMemory.findings.length} findings, ${promotionResult.promoted.length} promoted`);
    } catch (err) {
      console.error("[memory] Session finalization failed:", err);
    }
  },

  finalizeCurrentSessionSync(sessionId: string, messages: ChatMessage[], agentId: ChatAgentId) {
    const state = get();
    if (!state.isLoaded || !state._storage) return;

    try {
      const sessionMemory = finalizeSessionSync(sessionId, messages, agentId);

      // Clear message pointers after finalization
      state._messageTracker.clear();

      state._storage.saveSessionMemory(sessionMemory);
      console.log(`[memory] Session finalized (sync): ${sessionMemory.findings.length} findings`);
    } catch (err) {
      console.error("[memory] Sync session finalization failed:", err);
    }
  },
}));

// ─── Quarantine Processing ───────────────────────────────────────────

const QUARANTINE_MS = 24 * 60 * 60 * 1000; // 24 hours

function processQuarantinedEntries(entries: MemoryEntry[]): MemoryEntry[] {
  const now = Date.now();

  return entries.map((entry) => {
    if (entry.status !== "candidate") return entry;

    const quarantineAge = now - entry.source.promotedAt;
    if (quarantineAge < QUARANTINE_MS) return entry; // still in quarantine

    // Quarantine expired — check outcome
    if (entry.accessCount > 0) {
      // Was accessed during quarantine → confirm
      return { ...entry, status: "confirmed" as const };
    }

    // Not accessed — accelerate decay (20% penalty)
    return {
      ...entry,
      importance: entry.importance * 0.8,
    };
  });
}
