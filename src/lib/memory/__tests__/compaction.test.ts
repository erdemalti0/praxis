import { describe, it, expect } from "vitest";
import { decayImportance, compactMemory, shouldCompact, CATEGORY_TTL_DAYS } from "../compaction";
import type { MemoryEntry, MemoryStore } from "../types";

function createTestStore(): MemoryStore {
  return {
    version: 1,
    entries: [],
    aliases: {},
    conflicts: [],
    metadata: {
      createdAt: Date.now(),
      lastCompactedAt: 0,
      totalPromotions: 0,
      totalEvictions: 0,
      totalAccesses: 0,
      autoMemoryEnabled: true,
      configPreset: "balanced",
      featureFlags: {
        conflictMetadata: false,
        duplicateSuppression: false,
        messagePointers: false,
        injectionTelemetry: false,
        softCategoryBonus: false,
      },
    },
  };
}

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    fingerprint: "fp-" + Math.random().toString(36).slice(2, 10),
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

describe("decayImportance", () => {
  it("does not decay pinned entries", () => {
    const entry = makeEntry({
      status: "pinned",
      importance: 0.9,
      lastAccessedAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    });
    const decayed = decayImportance(entry, Date.now());
    expect(decayed).toBe(0.9);
  });

  it("decays importance based on time since access", () => {
    const now = Date.now();
    const entry = makeEntry({
      importance: 1.0,
      lastAccessedAt: now - 14 * 24 * 60 * 60 * 1000, // 14 days ago
      accessCount: 0,
    });
    const decayed = decayImportance(entry, now);
    expect(decayed).toBeLessThan(1.0);
    expect(decayed).toBeGreaterThan(0);
  });

  it("decays candidates faster than confirmed", () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const confirmed = makeEntry({
      importance: 1.0,
      status: "confirmed",
      lastAccessedAt: sevenDaysAgo,
      accessCount: 0,
    });
    const candidate = makeEntry({
      importance: 1.0,
      status: "candidate",
      lastAccessedAt: sevenDaysAgo,
      accessCount: 0,
    });

    const confirmedDecayed = decayImportance(confirmed, now);
    const candidateDecayed = decayImportance(candidate, now);

    expect(candidateDecayed).toBeLessThan(confirmedDecayed);
  });

  it("frequently accessed entries resist decay", () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const lowAccess = makeEntry({
      importance: 1.0,
      lastAccessedAt: sevenDaysAgo,
      accessCount: 0,
    });
    const highAccess = makeEntry({
      importance: 1.0,
      lastAccessedAt: sevenDaysAgo,
      accessCount: 20,
    });

    expect(decayImportance(highAccess, now)).toBeGreaterThan(decayImportance(lowAccess, now));
  });
});

describe("compactMemory", () => {
  it("does not evict when under soft limit", () => {
    const store: MemoryStore = {
      ...createTestStore(),
      entries: Array.from({ length: 10 }, () => makeEntry()),
    };

    const compacted = compactMemory(store);
    expect(compacted.entries.length).toBe(10);
    expect(compacted.metadata.lastCompactedAt).toBeGreaterThan(0);
  });

  it("never evicts pinned entries", () => {
    const entries = [
      ...Array.from({ length: 3100 }, () =>
        makeEntry({
          importance: 0.01,
          lastAccessedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
        }),
      ),
      makeEntry({ status: "pinned", importance: 0.01 }),
    ];

    const store: MemoryStore = { ...createTestStore(), entries };
    const compacted = compactMemory(store);

    const pinnedCount = compacted.entries.filter((e) => e.status === "pinned").length;
    expect(pinnedCount).toBe(1);
  });
});

describe("TTL by category", () => {
  it("evicts discovery entries older than 21 days with low access", () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const store: MemoryStore = {
      ...createTestStore(),
      entries: [
        makeEntry({
          category: "discovery",
          createdAt: thirtyDaysAgo,
          accessCount: 0,
        }),
        makeEntry({
          category: "discovery",
          createdAt: now, // fresh — should survive
          accessCount: 0,
        }),
      ],
    };

    const compacted = compactMemory(store);
    expect(compacted.entries.length).toBe(1);
  });

  it("preserves entries accessed 3+ times despite TTL expiry", () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const store: MemoryStore = {
      ...createTestStore(),
      entries: [
        makeEntry({
          category: "discovery",
          createdAt: thirtyDaysAgo,
          accessCount: 5, // frequently accessed → survives TTL
        }),
      ],
    };

    const compacted = compactMemory(store);
    expect(compacted.entries.length).toBe(1);
  });

  it("preserves pinned entries despite TTL expiry", () => {
    const now = Date.now();
    const yearAgo = now - 400 * 24 * 60 * 60 * 1000;

    const store: MemoryStore = {
      ...createTestStore(),
      entries: [
        makeEntry({
          category: "discovery",
          status: "pinned",
          createdAt: yearAgo,
          accessCount: 0,
        }),
      ],
    };

    const compacted = compactMemory(store);
    expect(compacted.entries.length).toBe(1);
  });

  it("architecture entries survive longer than discovery (180 vs 21 days)", () => {
    const now = Date.now();
    const fiftyDaysAgo = now - 50 * 24 * 60 * 60 * 1000;

    const store: MemoryStore = {
      ...createTestStore(),
      entries: [
        makeEntry({ category: "discovery", createdAt: fiftyDaysAgo, accessCount: 0 }), // 21 TTL → evict
        makeEntry({ category: "architecture", createdAt: fiftyDaysAgo, accessCount: 0 }), // 180 TTL → keep
      ],
    };

    const compacted = compactMemory(store);
    expect(compacted.entries.length).toBe(1);
    expect(compacted.entries[0].category).toBe("architecture");
  });

  it("has correct TTL values for all categories", () => {
    expect(CATEGORY_TTL_DAYS.discovery).toBe(21);
    expect(CATEGORY_TTL_DAYS.decision).toBe(90);
    expect(CATEGORY_TTL_DAYS.error).toBe(90);
    expect(CATEGORY_TTL_DAYS.architecture).toBe(180);
    expect(CATEGORY_TTL_DAYS.pattern).toBe(180);
    expect(CATEGORY_TTL_DAYS.preference).toBe(365);
    expect(CATEGORY_TTL_DAYS.task_progress).toBe(14);
  });
});

describe("shouldCompact", () => {
  it("triggers on every 50 accesses", () => {
    expect(shouldCompact(50, Date.now())).toBe(true);
    expect(shouldCompact(100, Date.now())).toBe(true);
    expect(shouldCompact(25, Date.now())).toBe(false);
  });

  it("triggers after 24 hours", () => {
    const old = Date.now() - 25 * 60 * 60 * 1000;
    expect(shouldCompact(1, old)).toBe(true);
  });
});
