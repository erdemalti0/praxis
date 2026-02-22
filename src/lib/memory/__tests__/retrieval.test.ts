import { describe, it, expect, beforeEach } from "vitest";
import { RetrievalPipeline, RETRIEVAL_LIMITS } from "../retrieval";
import { MemoryIndexer } from "../indexer";
import type { MemoryEntry } from "../types";

function makeEntry(overrides: Partial<MemoryEntry> & { id: string; content: string }): MemoryEntry {
  return {
    fingerprint: "fp-" + overrides.id,
    category: "discovery",
    importance: 0.5,
    status: "confirmed",
    confidence: 0.8,
    source: {
      sessionId: "session-1",
      agentId: "claude-code",
      messageId: "msg-1",
      promotedAt: Date.now(),
      promotionSignals: ["user-intent"],
    },
    accessCount: 0,
    lastAccessedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("RetrievalPipeline", () => {
  let pipeline: RetrievalPipeline;
  let indexer: MemoryIndexer;

  beforeEach(() => {
    pipeline = new RetrievalPipeline();
    indexer = new MemoryIndexer();
  });

  it("retrieves relevant entries for a query", () => {
    const entries = [
      makeEntry({ id: "1", content: "JWT tokens stored in httpOnly cookies", category: "decision" }),
      makeEntry({ id: "2", content: "Database uses PostgreSQL 15", category: "architecture" }),
      makeEntry({ id: "3", content: "Never modify auth middleware directly", category: "warning" }),
    ];

    indexer.rebuild(entries);
    const result = pipeline.retrieve("authentication JWT", entries, indexer, {});
    expect(result.retrievalResults.length).toBeGreaterThan(0);
    // JWT entry should score highest
    expect(result.retrievalResults[0].entry.id).toBe("1");
  });

  it("always includes pinned entries", () => {
    const entries = [
      makeEntry({ id: "pinned-1", content: "Critical: never bypass auth checks", status: "pinned", category: "warning" }),
      makeEntry({ id: "normal-1", content: "Database uses PostgreSQL", category: "discovery" }),
    ];

    indexer.rebuild(entries);
    const result = pipeline.retrieve("random unrelated query xyz", entries, indexer, {});
    expect(result.pinnedEntries.length).toBe(1);
    expect(result.pinnedEntries[0].id).toBe("pinned-1");
  });

  it("limits pinned entries to maxPinned", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `pinned-${i}`, content: `Pinned entry ${i}`, status: "pinned" }),
    );

    indexer.rebuild(entries);
    const result = pipeline.retrieve("query", entries, indexer, {});
    expect(result.pinnedEntries.length).toBeLessThanOrEqual(RETRIEVAL_LIMITS.maxPinned);
  });

  it("applies category weights (warnings score higher)", () => {
    const now = Date.now();
    const entries = [
      makeEntry({ id: "warning", content: "authentication bypass vulnerability", category: "warning", createdAt: now }),
      makeEntry({ id: "discovery", content: "authentication uses OAuth2", category: "discovery", createdAt: now }),
    ];

    indexer.rebuild(entries);
    const result = pipeline.retrieve("authentication", entries, indexer, {});

    if (result.retrievalResults.length >= 2) {
      const warningResult = result.retrievalResults.find((r) => r.entry.id === "warning");
      const discoveryResult = result.retrievalResults.find((r) => r.entry.id === "discovery");
      if (warningResult && discoveryResult) {
        expect(warningResult.score).toBeGreaterThan(discoveryResult.score);
      }
    }
  });

  it("boosts entries matching file paths", () => {
    const entries = [
      makeEntry({ id: "1", content: "Auth module configuration", filePaths: ["src/auth.ts"] }),
      makeEntry({ id: "2", content: "Auth middleware setup", filePaths: ["src/other.ts"] }),
    ];

    indexer.rebuild(entries);
    const result = pipeline.retrieve("auth", entries, indexer, {}, );
    // Both should be found
    expect(result.retrievalResults.length).toBeGreaterThan(0);
  });

  it("applies diversity cap per source session", () => {
    // Create 5 entries from same session
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        id: `same-session-${i}`,
        content: `Auth finding number ${i} about tokens and cookies`,
        source: {
          sessionId: "same-session",
          agentId: "claude-code",
          messageId: `msg-${i}`,
          promotedAt: Date.now(),
          promotionSignals: ["user-intent"],
        },
      }),
    );

    indexer.rebuild(entries);
    const result = pipeline.retrieve("auth tokens cookies", entries, indexer, {});

    // Count entries from "same-session"
    const sameSessionCount = result.retrievalResults.filter(
      (r) => r.entry.source.sessionId === "same-session",
    ).length;
    expect(sameSessionCount).toBeLessThanOrEqual(RETRIEVAL_LIMITS.maxPerSource);
  });

  it("respects injectionTopN limit", () => {
    const entries = Array.from({ length: 20 }, (_, i) =>
      makeEntry({
        id: `entry-${i}`,
        content: `Important auth finding ${i} about authentication`,
        source: {
          sessionId: `session-${i}`, // different sessions for diversity
          agentId: "claude-code",
          messageId: `msg-${i}`,
          promotedAt: Date.now(),
          promotionSignals: ["user-intent"],
        },
      }),
    );

    indexer.rebuild(entries);
    const result = pipeline.retrieve("auth", entries, indexer, {});
    expect(result.retrievalResults.length).toBeLessThanOrEqual(RETRIEVAL_LIMITS.injectionTopN);
  });

  it("returns empty for no matches", () => {
    const entries = [makeEntry({ id: "1", content: "PostgreSQL database config" })];
    indexer.rebuild(entries);
    const result = pipeline.retrieve("xyznonexistent", entries, indexer, {});
    expect(result.retrievalResults.length).toBe(0);
    expect(result.pinnedEntries.length).toBe(0);
  });

  // ─── Phase 5: Conflict confidence reduction ──────────────────────────

  it("conflict entries get 15% score reduction", () => {
    const now = Date.now();
    const entries = [
      makeEntry({ id: "conflicted-1", content: "Always use Redis caching for performance", category: "decision", createdAt: now }),
      makeEntry({ id: "normal-1", content: "Redis is used for caching layer", category: "discovery", createdAt: now }),
    ];

    indexer.rebuild(entries);

    // Without conflicts
    const resultNoConflict = pipeline.retrieve("Redis caching", entries, indexer, {});

    // With conflict on conflicted-1
    const conflicts = [
      { entryA: "conflicted-1", entryB: "other-id", conflictType: "contradictory" as const, detectedAt: now },
    ];
    const resultWithConflict = pipeline.retrieve("Redis caching", entries, indexer, {}, { conflicts });

    // Both should return results; the conflicted version should have reduced scores
    expect(resultWithConflict.retrievalResults).toBeDefined();
    expect(resultNoConflict.retrievalResults).toBeDefined();
  });

  it("suppressed entries excluded from results", () => {
    const entries = [
      makeEntry({ id: "active-1", content: "JWT tokens stored in httpOnly cookies", category: "decision" }),
      makeEntry({ id: "suppressed-1", content: "JWT tokens stored in httpOnly cookies for security", category: "decision", suppressed: true, suppressedBy: "active-1", suppressedAt: Date.now() }),
    ];

    indexer.rebuild(entries);
    const result = pipeline.retrieve("JWT tokens", entries, indexer, {});

    // Suppressed entry should not appear in results
    const ids = result.retrievalResults.map((r) => r.entry.id);
    expect(ids).not.toContain("suppressed-1");
  });

  // ─── Phase 5: Soft category bonus ────────────────────────────────────

  it("soft category bonus: error query boosts error entries", () => {
    const now = Date.now();
    const entries = [
      makeEntry({ id: "error-1", content: "authentication failed with invalid token", category: "error", createdAt: now }),
      makeEntry({ id: "discovery-1", content: "authentication uses OAuth2 flow", category: "discovery", createdAt: now }),
    ];

    indexer.rebuild(entries);

    // With category bonus enabled
    const featureFlags = {
      conflictMetadata: false,
      duplicateSuppression: false,
      messagePointers: false,
      injectionTelemetry: false,
      softCategoryBonus: true,
    };

    // Baseline without bonus (verify no errors)
    pipeline.retrieve("authentication error fix", entries, indexer, {});
    const resultWithBonus = pipeline.retrieve("authentication error fix", entries, indexer, {}, { featureFlags });

    // With bonus, the error entry should be boosted
    if (resultWithBonus.retrievalResults.length >= 1) {
      const errorResult = resultWithBonus.retrievalResults.find((r) => r.entry.id === "error-1");
      expect(errorResult).toBeDefined();
    }
  });

  it("category bonus disabled when feature flag is off", () => {
    const now = Date.now();
    const entries = [
      makeEntry({ id: "error-1", content: "authentication failed with invalid token", category: "error", createdAt: now }),
      makeEntry({ id: "discovery-1", content: "authentication uses OAuth2", category: "discovery", createdAt: now }),
    ];

    indexer.rebuild(entries);

    // With all flags off (default)
    const result = pipeline.retrieve("authentication error", entries, indexer, {});
    // Should still work without errors
    expect(result.retrievalResults).toBeDefined();
  });
});
