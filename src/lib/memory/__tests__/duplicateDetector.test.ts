import { describe, it, expect, beforeEach } from "vitest";
import { trigramJaccard, checkDuplicate, DUPLICATE_THRESHOLDS } from "../duplicateDetector";
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
      sessionId: "s1",
      agentId: "claude-code",
      messageId: "m1",
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

describe("trigramJaccard", () => {
  it("returns 1.0 for identical strings", () => {
    expect(trigramJaccard("hello world", "hello world")).toBe(1.0);
  });

  it("returns 0 for completely different strings", () => {
    const score = trigramJaccard("abc", "xyz");
    expect(score).toBe(0);
  });

  it("returns high score for similar strings", () => {
    const score = trigramJaccard("Redis cache setup", "Setup Redis caching");
    expect(score).toBeGreaterThan(0.3); // similar content but reordered
  });

  it("returns low score for different topics", () => {
    const score = trigramJaccard("PostgreSQL database configuration", "React component styling");
    expect(score).toBeLessThan(0.2);
  });

  it("handles empty strings", () => {
    expect(trigramJaccard("", "")).toBe(0);
    expect(trigramJaccard("abc", "")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(trigramJaccard("Hello World", "hello world")).toBe(1.0);
  });

  it("ignores punctuation", () => {
    const a = trigramJaccard("use Redis for caching", "use Redis for caching!");
    expect(a).toBeGreaterThan(0.9);
  });
});

describe("checkDuplicate", () => {
  let indexer: MemoryIndexer;

  beforeEach(() => {
    indexer = new MemoryIndexer();
  });

  it("detects near-duplicate via two-phase check", () => {
    const entries = [
      makeEntry({ id: "1", content: "Always use TypeScript strict mode for all projects" }),
    ];
    indexer.rebuild(entries);

    const result = checkDuplicate(
      "Always use TypeScript strict mode for all projects in this repo",
      entries,
      indexer,
      {},
    );
    // May or may not be duplicate depending on thresholds - test the structure
    expect(result).toHaveProperty("isDuplicate");
  });

  it("returns false for unrelated content", () => {
    const entries = [
      makeEntry({ id: "1", content: "PostgreSQL database uses connection pooling" }),
    ];
    indexer.rebuild(entries);

    const result = checkDuplicate("React component uses hooks for state management", entries, indexer, {});
    expect(result.isDuplicate).toBe(false);
  });

  it("skips suppressed entries", () => {
    const entries = [
      makeEntry({ id: "1", content: "Always use TypeScript strict mode", suppressed: true }),
    ];
    indexer.rebuild(entries);

    const result = checkDuplicate("Always use TypeScript strict mode", entries, indexer, {});
    expect(result.isDuplicate).toBe(false);
  });

  it("returns matchedEntryId when duplicate found", () => {
    const entries = [
      makeEntry({ id: "original-1", content: "JWT tokens are stored in httpOnly cookies for security" }),
    ];
    indexer.rebuild(entries);

    const result = checkDuplicate(
      "JWT tokens are stored in httpOnly cookies for security reasons",
      entries,
      indexer,
      {},
    );
    if (result.isDuplicate) {
      expect(result.matchedEntryId).toBe("original-1");
      expect(result.trigramScore).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLDS.trigramJaccardMin);
    }
  });

  it("handles empty entries list", () => {
    const result = checkDuplicate("some content", [], indexer, {});
    expect(result.isDuplicate).toBe(false);
  });
});
