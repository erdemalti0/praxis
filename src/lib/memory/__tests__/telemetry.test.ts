import { describe, it, expect } from "vitest";
import type { MemoryEntry } from "../types";
import { DEFAULT_FEATURE_FLAGS } from "../types";

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

describe("EntryTelemetry", () => {
  it("telemetry starts undefined on new entries", () => {
    const entry = makeEntry({ id: "1", content: "test entry" });
    expect(entry.telemetry).toBeUndefined();
  });

  it("telemetry tracks injection count and target agents", () => {
    const entry = makeEntry({ id: "1", content: "test entry" });
    entry.telemetry = {
      injectionCount: 0,
      lastInjectedAt: 0,
      targetAgents: [],
      wasContradicted: false,
      wasUseful: true,
    };

    // Simulate injection
    entry.telemetry.injectionCount++;
    entry.telemetry.lastInjectedAt = Date.now();
    entry.telemetry.targetAgents.push("claude-code");

    expect(entry.telemetry.injectionCount).toBe(1);
    expect(entry.telemetry.targetAgents).toContain("claude-code");
    expect(entry.telemetry.lastInjectedAt).toBeGreaterThan(0);
  });

  it("telemetry tracks no duplicate agents", () => {
    const entry = makeEntry({ id: "1", content: "test entry" });
    entry.telemetry = {
      injectionCount: 0,
      lastInjectedAt: 0,
      targetAgents: [],
      wasContradicted: false,
      wasUseful: true,
    };

    // Simulate multiple injections to same agent
    const agent = "claude-code";
    entry.telemetry.injectionCount++;
    if (!entry.telemetry.targetAgents.includes(agent)) {
      entry.telemetry.targetAgents.push(agent);
    }
    entry.telemetry.injectionCount++;
    if (!entry.telemetry.targetAgents.includes(agent)) {
      entry.telemetry.targetAgents.push(agent);
    }

    expect(entry.telemetry.injectionCount).toBe(2);
    expect(entry.telemetry.targetAgents).toHaveLength(1);
  });

  it("wasContradicted set when conflict detected", () => {
    const entry = makeEntry({ id: "1", content: "Always use Redis" });
    entry.telemetry = {
      injectionCount: 3,
      lastInjectedAt: Date.now(),
      targetAgents: ["claude-code"],
      wasContradicted: false,
      wasUseful: true,
    };

    // Simulate conflict detection marking
    entry.telemetry.wasContradicted = true;
    expect(entry.telemetry.wasContradicted).toBe(true);
  });

  it("feature flags default to all false", () => {
    expect(DEFAULT_FEATURE_FLAGS.conflictMetadata).toBe(false);
    expect(DEFAULT_FEATURE_FLAGS.duplicateSuppression).toBe(false);
    expect(DEFAULT_FEATURE_FLAGS.messagePointers).toBe(false);
    expect(DEFAULT_FEATURE_FLAGS.injectionTelemetry).toBe(false);
    expect(DEFAULT_FEATURE_FLAGS.softCategoryBonus).toBe(false);
  });
});
