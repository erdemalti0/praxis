/**
 * Retrieval pipeline for memory system.
 * BM25 search → post-scoring → filtering → top-N selection.
 */

import type {
  MemoryEntry,
  MemoryCategory,
  SearchOptions,
  SearchResult,
  ConflictPair,
  MemoryFeatureFlags,
} from "./types";
import type { MemoryIndexer } from "./indexer";
import { SLOMonitor } from "./sloMonitor";
import { getReranker } from "./reranker";

// ─── Constants ────────────────────────────────────────────────────────

export const CATEGORY_WEIGHTS: Record<MemoryCategory, number> = {
  warning: 1.4,
  decision: 1.3,
  architecture: 1.2,
  error: 1.2,
  pattern: 1.0,
  file_change: 1.0,
  task_progress: 0.9,
  discovery: 0.9,
  preference: 0.8,
};

export const RETRIEVAL_LIMITS = {
  maxCandidateScan: 500,
  maxRetrievalMs: 200,
  topK: 15,
  injectionTopN: 5,
  maxPinned: 5,
  maxPerSource: 2,       // diversity cap per source session
} as const;

// ─── Category Bonus Config ───────────────────────────────────────────

interface CategoryBonusConfig {
  errorQueryKeywords: string[];
  decisionQueryKeywords: string[];
  architectureQueryKeywords: string[];
  bonusMultiplier: number;
}

const DEFAULT_CATEGORY_BONUS: CategoryBonusConfig = {
  errorQueryKeywords: ["error", "bug", "fix", "crash", "fail", "broken", "issue"],
  decisionQueryKeywords: ["decided", "chose", "use", "approach", "strategy", "why"],
  architectureQueryKeywords: ["architecture", "structure", "design", "pattern", "system"],
  bonusMultiplier: 1.5,
};

function detectQueryCategoryBonus(
  query: string,
  config: CategoryBonusConfig,
): Partial<Record<MemoryCategory, number>> {
  const lower = query.toLowerCase();
  const bonuses: Partial<Record<MemoryCategory, number>> = {};

  if (config.errorQueryKeywords.some((kw) => lower.includes(kw))) {
    bonuses.error = config.bonusMultiplier;
    bonuses.warning = config.bonusMultiplier * 0.8;
  }
  if (config.decisionQueryKeywords.some((kw) => lower.includes(kw))) {
    bonuses.decision = config.bonusMultiplier;
  }
  if (config.architectureQueryKeywords.some((kw) => lower.includes(kw))) {
    bonuses.architecture = config.bonusMultiplier;
    bonuses.pattern = config.bonusMultiplier * 0.8;
  }

  return bonuses;
}

// ─── Scoring Helpers ──────────────────────────────────────────────────

function recencyMultiplier(createdAt: number, now: number): number {
  const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);
  if (ageDays < 1) return 1.0;
  if (ageDays < 7) return 0.9;
  if (ageDays < 14) return 0.7;
  if (ageDays < 30) return 0.5;
  return 0.3;
}

function accessBoost(accessCount: number): number {
  // log2(count + 1) * 0.1, capped at 0.5 bonus
  return Math.min(0.5, Math.log2(accessCount + 1) * 0.1);
}

function filePathAffinity(entryPaths: string[] | undefined, queryPaths: string[] | undefined): number {
  if (!entryPaths?.length || !queryPaths?.length) return 1.0;

  let overlap = 0;
  for (const ep of entryPaths) {
    for (const qp of queryPaths) {
      // Match on filename or full path
      if (ep === qp || ep.endsWith(`/${qp.split("/").pop()}`) || qp.endsWith(`/${ep.split("/").pop()}`)) {
        overlap++;
      }
    }
  }

  return 1.0 + overlap * 0.3;
}

function statusBoost(status: string): number {
  switch (status) {
    case "pinned": return 2.0;
    case "confirmed": return 1.0;
    case "candidate": return 0.7;
    default: return 1.0;
  }
}

// ─── Retrieval Pipeline ───────────────────────────────────────────────

export interface RetrievalResult {
  pinnedEntries: MemoryEntry[];
  retrievalResults: SearchResult[];
  activeConflicts: Array<{ entryA: MemoryEntry; entryB: MemoryEntry }>;
}

export class RetrievalPipeline {
  private sloMonitor = new SLOMonitor();

  /**
   * Get SLO monitor stats for diagnostics.
   */
  getSLOStats() {
    return this.sloMonitor.getStats();
  }

  /**
   * Full retrieval pipeline:
   * 1. Separate pinned entries (always-inject)
   * 2. BM25 search
   * 3. Post-scoring (category × recency × access × file affinity × status)
   * 4. Confidence threshold
   * 5. Diversity cap
   * 6. Top-N selection
   */
  retrieve(
    query: string,
    entries: MemoryEntry[],
    indexer: MemoryIndexer,
    aliases: Record<string, string[]>,
    options?: {
      filePaths?: string[];
      categories?: MemoryCategory[];
      maxTokens?: number;
      conflicts?: ConflictPair[];
      featureFlags?: MemoryFeatureFlags;
    },
  ): RetrievalResult {
    const startTime = performance.now();
    const now = Date.now();
    const queryPaths = options?.filePaths;

    // Filter out suppressed entries (Phase 5: duplicate suppression)
    const activeEntries = entries.filter((e) => !e.suppressed);

    // SLO degradation: reduce search scope if latency is high
    const degradeConfig = this.sloMonitor.shouldDegrade()
      ? this.sloMonitor.getDegradeConfig()
      : {};

    // 1. Separate pinned entries (always-inject tier)
    const pinnedEntries = activeEntries
      .filter((e) => e.status === "pinned")
      .slice(0, RETRIEVAL_LIMITS.maxPinned);

    // 2. BM25 search (excludes pinned — they're already in)
    const pinnedIds = new Set(pinnedEntries.map((e) => e.id));
    const searchOpts: Partial<SearchOptions> = {
      maxCandidateScan: degradeConfig.maxCandidateScan ?? RETRIEVAL_LIMITS.maxCandidateScan,
      maxRetrievalMs: degradeConfig.maxRetrievalMs ?? RETRIEVAL_LIMITS.maxRetrievalMs,
      topK: degradeConfig.topK ?? RETRIEVAL_LIMITS.topK,
    };

    const bm25Results = indexer.search(query, aliases, searchOpts);

    // Build entry lookup for scoring
    const entryMap = new Map(activeEntries.map((e) => [e.id, e]));

    // 3. Post-BM25 scoring
    const activeConflictIds = new Set<string>();
    if (options?.conflicts) {
      for (const conflict of options.conflicts) {
        if (!conflict.resolvedAt) {
          activeConflictIds.add(conflict.entryA);
          activeConflictIds.add(conflict.entryB);
        }
      }
    }

    // Soft category bonus (Phase 5)
    const categoryBonuses = options?.featureFlags?.softCategoryBonus
      ? detectQueryCategoryBonus(query, DEFAULT_CATEGORY_BONUS)
      : {};

    const scored: SearchResult[] = [];
    for (const result of bm25Results) {
      if (pinnedIds.has(result.id)) continue; // Skip pinned (already in always-inject)

      const entry = entryMap.get(result.id);
      if (!entry) continue;

      // Category filter
      if (options?.categories && !options.categories.includes(entry.category)) continue;

      const categoryBonus = categoryBonuses[entry.category] ?? 1.0;
      const score =
        result.bm25Score *
        CATEGORY_WEIGHTS[entry.category] *
        categoryBonus *
        recencyMultiplier(entry.createdAt, now) *
        (1 + accessBoost(entry.accessCount)) *
        filePathAffinity(entry.filePaths, queryPaths) *
        statusBoost(entry.status);

      // 15% confidence reduction for entries in active (unresolved) conflicts
      let finalScore = score;
      if (activeConflictIds.has(entry.id)) {
        finalScore *= 0.85;
      }

      scored.push({
        entry,
        score: finalScore,
        matchedFields: result.matchedFields,
      });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // 3b. Rerank hook (no-op by default, extensible)
    const reranked = getReranker().rerank(query, scored);

    // 4. Confidence threshold — drop bottom 30% if below median * 0.5
    const topK = reranked.slice(0, RETRIEVAL_LIMITS.topK);
    let filtered = topK;

    if (topK.length >= 3) {
      const median = topK[Math.floor(topK.length / 2)].score;
      const threshold = median * 0.5;
      filtered = topK.filter((r) => r.score >= threshold);
    }

    // 5. Diversity cap — max entries per source session
    const sourceCounts = new Map<string, number>();
    const diverse: SearchResult[] = [];

    for (const result of filtered) {
      const sourceKey = result.entry.source.sessionId;
      const count = sourceCounts.get(sourceKey) ?? 0;
      if (count >= RETRIEVAL_LIMITS.maxPerSource) continue;
      sourceCounts.set(sourceKey, count + 1);
      diverse.push(result);
    }

    // 6. Top-N for injection
    const final = diverse.slice(0, RETRIEVAL_LIMITS.injectionTopN);

    // 7. Detect active conflicts among retrieved entries
    const activeConflicts = this.findActiveConflicts(
      [...pinnedEntries, ...final.map((r) => r.entry)],
      entryMap,
      options?.conflicts ?? [],
    );

    // 8. Record SLO latency
    this.sloMonitor.record(performance.now() - startTime);

    // 9. Token-aware packing
    if (options?.maxTokens) {
      return {
        pinnedEntries,
        retrievalResults: this.packWithinBudget(final, options.maxTokens),
        activeConflicts,
      };
    }

    return { pinnedEntries, retrievalResults: final, activeConflicts };
  }

  /**
   * Find active conflicts among retrieved entries.
   */
  private findActiveConflicts(
    retrievedEntries: MemoryEntry[],
    entryMap: Map<string, MemoryEntry>,
    allConflicts: ConflictPair[],
  ): Array<{ entryA: MemoryEntry; entryB: MemoryEntry }> {
    if (allConflicts.length === 0) return [];

    const retrievedIds = new Set(retrievedEntries.map((e) => e.id));
    const result: Array<{ entryA: MemoryEntry; entryB: MemoryEntry }> = [];

    for (const conflict of allConflicts) {
      if (conflict.resolvedAt) continue;
      // Only include if both entries are in the retrieved set
      if (retrievedIds.has(conflict.entryA) && retrievedIds.has(conflict.entryB)) {
        const a = entryMap.get(conflict.entryA);
        const b = entryMap.get(conflict.entryB);
        if (a && b) result.push({ entryA: a, entryB: b });
      }
    }

    return result.slice(0, 2); // max 2 conflict markers
  }

  /**
   * Greedily pack entries within token budget.
   */
  private packWithinBudget(results: SearchResult[], maxTokens: number): SearchResult[] {
    const packed: SearchResult[] = [];
    let usedTokens = 0;

    for (const result of results) {
      const entryTokens = this.estimateTokens(result.entry);
      if (usedTokens + entryTokens > maxTokens) break;
      packed.push(result);
      usedTokens += entryTokens;
    }

    return packed;
  }

  /**
   * Estimate tokens for an entry (rough: 1 token per 4 chars + overhead).
   */
  private estimateTokens(entry: MemoryEntry): number {
    const contentTokens = Math.ceil(entry.content.length / 4);
    const overhead = 15; // category label, formatting
    return contentTokens + overhead;
  }
}
