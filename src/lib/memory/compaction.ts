/**
 * Memory compaction: importance decay + eviction (GC).
 * Run on every memory load and periodically (every 50 messages).
 */

import type { MemoryStore, MemoryEntry, MemoryCategory } from "./types";

// ─── Constants ───────────────────────────────────────────────────────

const SOFT_LIMIT = 3000;
const KEEP_TARGET = 2700; // 10% buffer below soft limit
const RECENT_ACCESS_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_ACCESS_TO_SURVIVE_TTL = 3; // entries accessed 3+ times survive TTL

/** Category-based TTL in days. Entries older than TTL with low access are evicted. */
export const CATEGORY_TTL_DAYS: Record<MemoryCategory, number> = {
  discovery: 21,
  decision: 90,
  error: 90,
  file_change: 21,
  architecture: 180,
  task_progress: 14,
  pattern: 180,
  warning: 30,
  preference: 365,
};

// ─── Decay ───────────────────────────────────────────────────────────

/**
 * Calculate decayed importance for an entry.
 * Factors: time since access, status, access frequency resistance.
 */
export function decayImportance(entry: MemoryEntry, now: number): number {
  // Pinned entries never decay
  if (entry.status === "pinned") return entry.importance;

  const daysSinceAccess = (now - entry.lastAccessedAt) / (1000 * 60 * 60 * 24);

  // 5% decay per week of inactivity
  const accessDecay = Math.pow(0.95, daysSinceAccess / 7);

  // Candidates decay faster
  const statusMultiplier = entry.status === "candidate" ? 0.9 : 1.0;

  // Frequently accessed entries resist decay
  const accessResistance = Math.min(1.0, 0.5 + entry.accessCount * 0.05);

  return entry.importance * accessDecay * statusMultiplier * accessResistance;
}

// ─── Compaction ──────────────────────────────────────────────────────

/**
 * Compact memory: apply importance decay and evict if over soft limit.
 * Returns a new MemoryStore with updated entries and metadata.
 */
export function compactMemory(store: MemoryStore): MemoryStore {
  const now = Date.now();

  // 1. Apply importance decay to all entries
  const decayed = store.entries.map((entry) => ({
    ...entry,
    importance: decayImportance(entry, now),
  }));

  // 2. Apply TTL-based eviction
  const afterTTL = decayed.filter((entry) => {
    if (entry.status === "pinned") return true; // pinned never expire
    const ttlDays = CATEGORY_TTL_DAYS[entry.category] ?? 90;
    const ageDays = (now - entry.createdAt) / (1000 * 60 * 60 * 24);
    if (ageDays > ttlDays && entry.accessCount < MIN_ACCESS_TO_SURVIVE_TTL) {
      return false; // TTL expired and rarely accessed → evict
    }
    return true;
  });

  const ttlEvicted = decayed.length - afterTTL.length;
  if (ttlEvicted > 0) {
    console.log(`[memory] TTL evicted ${ttlEvicted} expired entries`);
  }

  // 3. Check if further eviction needed (soft limit)
  if (afterTTL.length <= SOFT_LIMIT) {
    return {
      ...store,
      entries: afterTTL,
      metadata: {
        ...store.metadata,
        lastCompactedAt: now,
        totalEvictions: store.metadata.totalEvictions + ttlEvicted,
      },
    };
  }

  // 4. Sort by importance ascending (weakest first)
  const sorted = [...afterTTL].sort((a, b) => a.importance - b.importance);

  // 5. Evict until we reach KEEP_TARGET
  const evictCount = sorted.length - KEEP_TARGET;
  let evicted = 0;
  const toKeep: MemoryEntry[] = [];

  for (const entry of sorted) {
    // Never evict pinned entries
    if (entry.status === "pinned") {
      toKeep.push(entry);
      continue;
    }

    // Don't evict recently accessed entries
    if (now - entry.lastAccessedAt < RECENT_ACCESS_MS) {
      toKeep.push(entry);
      continue;
    }

    // Evict if we still need to reduce
    if (evicted < evictCount) {
      evicted++;
      continue;
    }

    toKeep.push(entry);
  }

  console.log(`[memory] Compacted: evicted ${evicted} entries (${sorted.length} -> ${toKeep.length})`);

  return {
    ...store,
    entries: toKeep,
    metadata: {
      ...store.metadata,
      lastCompactedAt: now,
      totalEvictions: store.metadata.totalEvictions + evicted + ttlEvicted,
    },
  };
}

/**
 * Check if compaction should run (every 50 messages).
 */
export function shouldCompact(totalAccesses: number, lastCompactedAt: number): boolean {
  const accessesSinceCompact = totalAccesses % 50;
  if (accessesSinceCompact === 0 && totalAccesses > 0) return true;

  // Also compact if it's been more than 24 hours
  const hoursSinceCompact = (Date.now() - lastCompactedAt) / (1000 * 60 * 60);
  return hoursSinceCompact > 24;
}
