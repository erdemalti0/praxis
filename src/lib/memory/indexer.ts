/**
 * BM25 search index for memory entries using minisearch.
 * Provides fuzzy, prefix, and boosted field search.
 */

import MiniSearch from "minisearch";
import type { MemoryEntry, SearchOptions } from "./types";
import { expandQuery } from "./aliases";

// ─── Constants ────────────────────────────────────────────────────────

const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  maxCandidateScan: 500,
  maxRetrievalMs: 200,
  topK: 15,
};

// ─── Indexable Document ───────────────────────────────────────────────

interface IndexDocument {
  id: string;
  content: string;
  tags: string;
  filePaths: string;
  category: string;
}

function entryToDocument(entry: MemoryEntry): IndexDocument {
  return {
    id: entry.id,
    content: entry.content,
    tags: (entry.tags ?? []).join(" "),
    filePaths: (entry.filePaths ?? []).join(" "),
    category: entry.category,
  };
}

// ─── Memory Indexer ───────────────────────────────────────────────────

export class MemoryIndexer {
  private index: MiniSearch<IndexDocument>;
  private entryCount = 0;
  private lastRebuiltAt = 0;

  constructor() {
    this.index = this.createIndex();
  }

  /**
   * Full reindex from all entries.
   */
  rebuild(entries: MemoryEntry[]): void {
    this.index = this.createIndex();
    const docs = entries.map(entryToDocument);
    this.index.addAll(docs);
    this.entryCount = entries.length;
    this.lastRebuiltAt = Date.now();
  }

  /**
   * Add a single entry to the index.
   */
  add(entry: MemoryEntry): void {
    try {
      this.index.add(entryToDocument(entry));
      this.entryCount++;
    } catch {
      // Entry might already exist — rebuild to be safe
      // This is rare and acceptable for Phase 1
    }
  }

  /**
   * Remove a single entry from the index.
   */
  remove(entry: MemoryEntry): void {
    try {
      this.index.remove(entryToDocument(entry));
      this.entryCount--;
    } catch {
      // Entry might not exist — ignore
    }
  }

  /**
   * Search the index with alias expansion and timeout.
   * Returns raw BM25 results (pre-scoring).
   */
  search(
    query: string,
    aliases: Record<string, string[]>,
    options: Partial<SearchOptions> = {},
  ): Array<{ id: string; bm25Score: number; matchedFields: string[] }> {
    const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options };
    const expandedQuery = expandQuery(query, aliases);

    const startTime = Date.now();
    const results = this.index.search(expandedQuery, {
      boost: { content: 2, tags: 1.5, filePaths: 1.2, category: 1 },
      fuzzy: 0.2,
      prefix: true,
    });

    // Respect timeout — return what we have so far
    const elapsed = Date.now() - startTime;
    const maxResults = elapsed > opts.maxRetrievalMs
      ? Math.min(results.length, opts.topK)
      : Math.min(opts.maxCandidateScan, results.length);

    return results.slice(0, maxResults).map((r) => ({
      id: r.id,
      bm25Score: r.score,
      matchedFields: Object.keys(r.match),
    }));
  }

  /**
   * Get index health info for /memory status.
   */
  getHealth(): { indexed: number; lastRebuiltAt: number } {
    return {
      indexed: this.entryCount,
      lastRebuiltAt: this.lastRebuiltAt,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────

  private createIndex(): MiniSearch<IndexDocument> {
    return new MiniSearch<IndexDocument>({
      fields: ["content", "tags", "filePaths", "category"],
      storeFields: ["id"],
      searchOptions: {
        boost: { content: 2, tags: 1.5, filePaths: 1.2, category: 1 },
        fuzzy: 0.2,
        prefix: true,
      },
    });
  }
}
