import { describe, it, expect } from "vitest";
import { detectConflict, detectConflicts, getActiveConflicts, resolveConflict } from "../conflictDetector";
import type { MemoryEntry, ConflictPair } from "../types";

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

describe("conflictDetector", () => {
  it("detects opposition keywords (always/never) in same category", () => {
    const a = makeEntry({ id: "1", content: "Always use TypeScript strict mode", category: "decision" });
    const b = makeEntry({ id: "2", content: "Never use TypeScript strict mode for tests", category: "decision" });

    const conflict = detectConflict(b, a);
    expect(conflict).not.toBeNull();
    expect(conflict!.conflictType).toBe("contradictory");
  });

  it("detects opposition keywords (use/don't use) with shared file paths", () => {
    const a = makeEntry({
      id: "1",
      content: "Use Redis for caching",
      category: "architecture",
      filePaths: ["src/cache.ts"],
    });
    const b = makeEntry({
      id: "2",
      content: "Don't use Redis, use in-memory cache",
      category: "discovery",
      filePaths: ["src/cache.ts"],
    });

    const conflict = detectConflict(b, a);
    expect(conflict).not.toBeNull();
  });

  it("returns null for non-conflicting entries", () => {
    const a = makeEntry({ id: "1", content: "Database uses PostgreSQL", category: "architecture" });
    const b = makeEntry({ id: "2", content: "API uses REST endpoints", category: "architecture" });

    const conflict = detectConflict(b, a);
    expect(conflict).toBeNull();
  });

  it("returns null when no shared category or file paths", () => {
    const a = makeEntry({ id: "1", content: "Always validate input", category: "warning" });
    const b = makeEntry({ id: "2", content: "Never skip tests", category: "pattern" });

    const conflict = detectConflict(b, a);
    expect(conflict).toBeNull();
  });

  it("skips self-comparison", () => {
    const a = makeEntry({ id: "1", content: "Always use strict mode" });
    const conflict = detectConflict(a, a);
    expect(conflict).toBeNull();
  });

  it("detectConflicts checks all existing entries", () => {
    const existing = [
      makeEntry({ id: "1", content: "Always use ESLint", category: "pattern" }),
      makeEntry({ id: "2", content: "Database uses PostgreSQL", category: "architecture" }),
    ];
    const newEntry = makeEntry({ id: "3", content: "Never use ESLint for formatting", category: "pattern" });

    const conflicts = detectConflicts(newEntry, existing);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].entryA).toBe("1");
    expect(conflicts[0].entryB).toBe("3");
  });

  it("getActiveConflicts filters by entry ID", () => {
    const conflicts: ConflictPair[] = [
      { entryA: "1", entryB: "2", conflictType: "contradictory", detectedAt: Date.now() },
      { entryA: "3", entryB: "4", conflictType: "contradictory", detectedAt: Date.now() },
      { entryA: "1", entryB: "5", conflictType: "superseded", detectedAt: Date.now(), resolvedAt: Date.now() },
    ];

    const active = getActiveConflicts("1", conflicts);
    expect(active.length).toBe(1); // only unresolved
  });

  it("resolveConflict marks conflict as resolved", () => {
    const conflicts: ConflictPair[] = [
      { entryA: "1", entryB: "2", conflictType: "contradictory", detectedAt: Date.now() },
    ];

    const resolved = resolveConflict(conflicts, "1", "2");
    expect(resolved[0].resolvedAt).toBeDefined();
    expect(resolved[0].resolvedAt).toBeGreaterThan(0);
  });

  // ─── Phase 5: Conflict Metadata ─────────────────────────────────────

  it("enriched conflict has conflictSetId when metadata enabled", () => {
    const a = makeEntry({ id: "1", content: "Always use ESLint", category: "pattern" });
    const b = makeEntry({ id: "2", content: "Never use ESLint for formatting", category: "pattern" });

    const conflict = detectConflict(b, a, { enrichMetadata: true });
    expect(conflict).not.toBeNull();
    expect(conflict!.conflictSetId).toBeDefined();
    expect(typeof conflict!.conflictSetId).toBe("string");
  });

  it("severity classification: always/never -> high", () => {
    const a = makeEntry({ id: "1", content: "Always validate inputs", category: "warning" });
    const b = makeEntry({ id: "2", content: "Never validate inputs on internal APIs", category: "warning" });

    const conflict = detectConflict(b, a, { enrichMetadata: true });
    expect(conflict).not.toBeNull();
    expect(conflict!.severity).toBe("high");
  });

  it("severity classification: prefer/avoid -> low", () => {
    const a = makeEntry({ id: "1", content: "Prefer functional components", category: "pattern" });
    const b = makeEntry({ id: "2", content: "Avoid functional components for complex state", category: "pattern" });

    const conflict = detectConflict(b, a, { enrichMetadata: true });
    expect(conflict).not.toBeNull();
    expect(conflict!.severity).toBe("low");
  });

  it("detectedReason contains the matched opposition pair", () => {
    const a = makeEntry({ id: "1", content: "Always use strict mode", category: "decision" });
    const b = makeEntry({ id: "2", content: "Never use strict mode in tests", category: "decision" });

    const conflict = detectConflict(b, a, { enrichMetadata: true });
    expect(conflict).not.toBeNull();
    expect(conflict!.detectedReason).toContain("always");
    expect(conflict!.detectedReason).toContain("never");
  });
});
