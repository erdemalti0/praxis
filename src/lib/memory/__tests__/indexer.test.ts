import { describe, it, expect, beforeEach } from "vitest";
import { MemoryIndexer } from "../indexer";
import type { MemoryEntry } from "../types";

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    fingerprint: "abc123",
    content: "Test content",
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

describe("MemoryIndexer", () => {
  let indexer: MemoryIndexer;

  beforeEach(() => {
    indexer = new MemoryIndexer();
  });

  it("finds entries by content", () => {
    const entries = [
      makeEntry({ id: "1", content: "JWT tokens stored in httpOnly cookies" }),
      makeEntry({ id: "2", content: "Database uses PostgreSQL 15" }),
      makeEntry({ id: "3", content: "API rate limiting set to 100 req/min" }),
    ];

    indexer.rebuild(entries);
    const results = indexer.search("JWT authentication tokens", {});
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("1");
  });

  it("finds entries by file paths", () => {
    const entries = [
      makeEntry({ id: "1", content: "Auth middleware wrapper", filePaths: ["src/lib/auth.ts"] }),
      makeEntry({ id: "2", content: "Database config", filePaths: ["src/config/db.ts"] }),
    ];

    indexer.rebuild(entries);
    const results = indexer.search("auth.ts", {});
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("1");
  });

  it("handles fuzzy matching (typos)", () => {
    const entries = [
      makeEntry({ id: "1", content: "authentication middleware pattern" }),
    ];

    indexer.rebuild(entries);
    // "authentification" is a common typo for "authentication"
    const results = indexer.search("authentification", {});
    expect(results.length).toBeGreaterThan(0);
  });

  it("finds entries by tags", () => {
    const entries = [
      makeEntry({ id: "1", content: "Use wrapper for auth", tags: ["security", "auth"] }),
      makeEntry({ id: "2", content: "Database migration script", tags: ["database"] }),
    ];

    indexer.rebuild(entries);
    const results = indexer.search("security", {});
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("1");
  });

  it("returns empty for no matches", () => {
    const entries = [makeEntry({ content: "PostgreSQL database" })];
    indexer.rebuild(entries);
    const results = indexer.search("xyznonexistent", {});
    expect(results.length).toBe(0);
  });

  it("reports health correctly", () => {
    const entries = [makeEntry(), makeEntry(), makeEntry()];
    indexer.rebuild(entries);
    const health = indexer.getHealth();
    expect(health.indexed).toBe(3);
    expect(health.lastRebuiltAt).toBeGreaterThan(0);
  });

  it("handles add and remove operations", () => {
    const entry = makeEntry({ id: "single", content: "unique test entry" });
    indexer.rebuild([]);
    indexer.add(entry);

    let results = indexer.search("unique test", {});
    expect(results.length).toBe(1);

    indexer.remove(entry);
    results = indexer.search("unique test", {});
    expect(results.length).toBe(0);
  });

  it("expands aliases during search", () => {
    const entries = [
      makeEntry({ id: "1", content: "authentication middleware requires JWT validation" }),
    ];

    indexer.rebuild(entries);
    const aliases = { auth: ["authentication", "login", "jwt"] };
    const results = indexer.search("auth", aliases);
    expect(results.length).toBeGreaterThan(0);
  });
});
