/**
 * Near-duplicate detection for memory entries.
 * Two-phase: trigram Jaccard similarity → BM25 self-search confirmation.
 * Suppresses duplicates softly (no hard delete).
 */

import type { MemoryEntry } from "./types";
import type { MemoryIndexer } from "./indexer";

// ─── Constants ────────────────────────────────────────────────────────

export const DUPLICATE_THRESHOLDS = {
  trigramJaccardMin: 0.6,
  bm25NormalizedMin: 0.80,
} as const;

// ─── Trigram Jaccard ─────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function extractTrigrams(text: string): string[] {
  const trigrams: string[] = [];
  for (let i = 0; i <= text.length - 3; i++) {
    trigrams.push(text.slice(i, i + 3));
  }
  return trigrams;
}

export function trigramJaccard(a: string, b: string): number {
  const trigramsA = extractTrigrams(normalize(a));
  const trigramsB = extractTrigrams(normalize(b));
  if (trigramsA.length === 0 && trigramsB.length === 0) return 0;

  const setB = new Set(trigramsB);
  let intersectionCount = 0;
  const counted = new Set<string>();
  for (const t of trigramsA) {
    if (setB.has(t) && !counted.has(t)) {
      intersectionCount++;
      counted.add(t);
    }
  }
  const union = new Set([...trigramsA, ...trigramsB]);
  return union.size === 0 ? 0 : intersectionCount / union.size;
}

// ─── BM25 Self-Search ────────────────────────────────────────────────

export function bm25SelfSearchScore(
  content: string,
  indexer: MemoryIndexer,
  aliases: Record<string, string[]>,
): Array<{ id: string; score: number }> {
  const results = indexer.search(content, aliases, { topK: 5, maxCandidateScan: 50 });
  const maxScore = results.length > 0 ? results[0].bm25Score : 1;
  return results.map((r) => ({
    id: r.id,
    score: maxScore > 0 ? r.bm25Score / maxScore : 0,
  }));
}

// ─── Two-Phase Duplicate Check ───────────────────────────────────────

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchedEntryId?: string;
  trigramScore?: number;
  bm25Score?: number;
}

export function checkDuplicate(
  newContent: string,
  existingEntries: MemoryEntry[],
  indexer: MemoryIndexer,
  aliases: Record<string, string[]>,
): DuplicateCheckResult {
  // Phase 1: Cheap trigram check against all non-suppressed entries
  for (const entry of existingEntries) {
    if (entry.suppressed) continue;
    const tScore = trigramJaccard(newContent, entry.content);
    if (tScore >= DUPLICATE_THRESHOLDS.trigramJaccardMin) {
      // Phase 2: BM25 confirmation
      const bm25Results = bm25SelfSearchScore(newContent, indexer, aliases);
      const match = bm25Results.find((r) => r.id === entry.id);
      if (match && match.score >= DUPLICATE_THRESHOLDS.bm25NormalizedMin) {
        return { isDuplicate: true, matchedEntryId: entry.id, trigramScore: tScore, bm25Score: match.score };
      }
    }
  }
  return { isDuplicate: false };
}
