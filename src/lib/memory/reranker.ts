/**
 * Rerank strategy interface for memory retrieval.
 * Phase 2: Interface + no-op implementation.
 * Phase 3+: Implement actual reranking strategies if eval shows need.
 */

import type { SearchResult } from "./types";

// ─── Interface ───────────────────────────────────────────────────────

export interface IRerankStrategy {
  /**
   * Rerank candidates after BM25 scoring, before diversity cap.
   * Must return a subset/reordering of the input candidates.
   */
  rerank(query: string, candidates: SearchResult[]): SearchResult[];
}

// ─── No-Op Implementation ────────────────────────────────────────────

/**
 * Pass-through reranker. Returns candidates unchanged.
 * Default strategy until eval indicates a smarter reranker is needed.
 */
export class NoOpReranker implements IRerankStrategy {
  rerank(_query: string, candidates: SearchResult[]): SearchResult[] {
    return candidates;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

let _currentReranker: IRerankStrategy = new NoOpReranker();

/**
 * Get the current rerank strategy.
 */
export function getReranker(): IRerankStrategy {
  return _currentReranker;
}

/**
 * Set a custom rerank strategy.
 */
export function setReranker(reranker: IRerankStrategy): void {
  _currentReranker = reranker;
}
