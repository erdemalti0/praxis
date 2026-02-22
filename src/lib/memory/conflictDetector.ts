/**
 * Conflict detection for memory entries.
 * Uses keyword-based heuristics to detect contradictory entries
 * that share file paths or categories.
 */

import type { MemoryEntry, ConflictPair } from "./types";

// ─── Opposition Patterns ─────────────────────────────────────────────

const OPPOSITION_PAIRS: [string, string][] = [
  ["use", "don't use"],
  ["always", "never"],
  ["enable", "disable"],
  ["add", "remove"],
  ["should", "shouldn't"],
  ["must", "must not"],
  ["allow", "disallow"],
  ["prefer", "avoid"],
  ["include", "exclude"],
];

const SEVERITY_MAP: Record<string, "low" | "medium" | "high"> = {
  "always/never": "high",
  "must/must not": "high",
  "should/shouldn't": "medium",
  "use/don't use": "medium",
  "enable/disable": "medium",
  "prefer/avoid": "low",
  "include/exclude": "low",
  "add/remove": "low",
  "allow/disallow": "medium",
};

// ─── Helpers ─────────────────────────────────────────────────────────

function intersection(a: string[] | undefined, b: string[] | undefined): string[] {
  if (!a?.length || !b?.length) return [];
  const setB = new Set(b);
  return a.filter((item) => setB.has(item));
}

// ─── Detector ────────────────────────────────────────────────────────

/**
 * Check if a new entry conflicts with an existing entry.
 * Returns a ConflictPair if opposition keywords are detected
 * between entries sharing file paths or category.
 */
export function detectConflict(
  newEntry: MemoryEntry,
  existing: MemoryEntry,
  options?: { enrichMetadata?: boolean },
): ConflictPair | null {
  // Skip self-comparison
  if (newEntry.id === existing.id) return null;

  // Must share filePaths or category
  const sharedPaths = intersection(newEntry.filePaths, existing.filePaths);
  const sameCategory = newEntry.category === existing.category;

  if (sharedPaths.length === 0 && !sameCategory) return null;

  const newLower = newEntry.content.toLowerCase();
  const existLower = existing.content.toLowerCase();

  for (const [a, b] of OPPOSITION_PAIRS) {
    if (
      (newLower.includes(a) && existLower.includes(b)) ||
      (newLower.includes(b) && existLower.includes(a))
    ) {
      const pair: ConflictPair = {
        entryA: existing.id,
        entryB: newEntry.id,
        conflictType: "contradictory",
        detectedAt: Date.now(),
      };

      if (options?.enrichMetadata) {
        const pairKey = `${a}/${b}`;
        pair.conflictSetId = crypto.randomUUID();
        pair.severity = SEVERITY_MAP[pairKey] ?? "medium";
        pair.detectedReason = pairKey;
        pair.sourceAgentA = existing.source.agentId;
        pair.sourceAgentB = newEntry.source.agentId;
      }

      return pair;
    }
  }

  return null;
}

/**
 * Check a new entry against all existing entries for conflicts.
 * Returns array of detected conflict pairs.
 */
export function detectConflicts(
  newEntry: MemoryEntry,
  existingEntries: MemoryEntry[],
  options?: { enrichMetadata?: boolean },
): ConflictPair[] {
  const conflicts: ConflictPair[] = [];

  for (const existing of existingEntries) {
    const conflict = detectConflict(newEntry, existing, options);
    if (conflict) {
      conflicts.push(conflict);
    }
  }

  return conflicts;
}

/**
 * Get active (unresolved) conflicts involving a specific entry ID.
 */
export function getActiveConflicts(
  entryId: string,
  allConflicts: ConflictPair[],
): ConflictPair[] {
  return allConflicts.filter(
    (c) =>
      !c.resolvedAt &&
      (c.entryA === entryId || c.entryB === entryId),
  );
}

/**
 * Resolve a conflict pair (mark as resolved).
 */
export function resolveConflict(
  conflicts: ConflictPair[],
  entryA: string,
  entryB: string,
): ConflictPair[] {
  return conflicts.map((c) => {
    if (
      (c.entryA === entryA && c.entryB === entryB) ||
      (c.entryA === entryB && c.entryB === entryA)
    ) {
      return { ...c, resolvedAt: Date.now() };
    }
    return c;
  });
}
