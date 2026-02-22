import { describe, it, expect } from "vitest";
import { checkPromotionSignals, runPromotionPipeline, SIGNAL_WEIGHTS } from "../promotionEngine";
import type { MemoryEntry, SessionMemory, SessionFinding, PromotionConfig } from "../types";
import { PROMOTION_PRESETS } from "../types";

function makeFinding(overrides: Partial<SessionFinding> = {}): SessionFinding {
  return {
    id: crypto.randomUUID(),
    fingerprint: "fp-" + Math.random().toString(36).slice(2, 10),
    content: "Test finding with enough content to pass hard filter minimum length",
    category: "discovery",
    importance: 0.5,
    confidence: 0.6,
    promotedToProjectMemory: false,
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionMemory> = {}): SessionMemory {
  return {
    version: 1,
    sessionId: "s1",
    agentId: "claude-code",
    findings: [],
    summary: "",
    createdAt: Date.now(),
    finalizedAt: Date.now(),
    ...overrides,
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

describe("SIGNAL_WEIGHTS", () => {
  it("has correct weights for key signals", () => {
    expect(SIGNAL_WEIGHTS["multi-session"]).toBe(2);
    expect(SIGNAL_WEIGHTS["error-resolution"]).toBe(2);
    expect(SIGNAL_WEIGHTS["multi-agent"]).toBe(1);
    expect(SIGNAL_WEIGHTS["high-importance"]).toBe(1);
    expect(SIGNAL_WEIGHTS["user-intent"]).toBe(5);
    expect(SIGNAL_WEIGHTS["explicit-pin"]).toBe(5);
  });
});

describe("checkPromotionSignals (weighted)", () => {
  it("single high-importance (1 point) does NOT promote with balanced config", () => {
    const finding = makeFinding({ importance: 0.8 });
    const check = checkPromotionSignals(finding, [], []);
    expect(check.signals).toContain("high-importance");
    expect(check.totalPoints).toBe(1);
    expect(check.shouldPromote).toBe(false);
  });

  it("error + high-importance (3 points) DOES promote", () => {
    const finding = makeFinding({ importance: 0.8, category: "error" });
    const check = checkPromotionSignals(finding, [], []);
    expect(check.signals).toContain("high-importance");
    expect(check.signals).toContain("error-resolution");
    expect(check.totalPoints).toBe(3); // 1 + 2
    expect(check.shouldPromote).toBe(true);
  });

  it("multi-session + high-importance (3 points) promotes", () => {
    const fp = "shared-fp";
    const finding = makeFinding({ fingerprint: fp, importance: 0.8 });
    const sessions = [
      makeSession({ sessionId: "s1", findings: [makeFinding({ fingerprint: fp })] }),
      makeSession({ sessionId: "s2", findings: [makeFinding({ fingerprint: fp })] }),
    ];

    const check = checkPromotionSignals(finding, [], sessions);
    expect(check.signals).toContain("multi-session");
    expect(check.signals).toContain("high-importance");
    expect(check.totalPoints).toBe(3); // 2 + 1
    expect(check.shouldPromote).toBe(true);
  });

  it("error-resolution + multi-agent (3 points) promotes", () => {
    const fp = "shared-fp";
    const finding = makeFinding({ fingerprint: fp, category: "error", importance: 0.3 });
    const sessions = [
      makeSession({ sessionId: "s1", agentId: "claude-code", findings: [makeFinding({ fingerprint: fp })] }),
      makeSession({ sessionId: "s2", agentId: "gemini", findings: [makeFinding({ fingerprint: fp })] }),
    ];

    const check = checkPromotionSignals(finding, [], sessions);
    expect(check.signals).toContain("error-resolution");
    expect(check.signals).toContain("multi-agent");
    expect(check.totalPoints).toBeGreaterThanOrEqual(3); // 2 + 1 + possible multi-session
    expect(check.shouldPromote).toBe(true);
  });

  it("skips already-existing entries in project memory", () => {
    const fp = "existing-fp";
    const finding = makeFinding({ fingerprint: fp, importance: 0.8, category: "error" });
    const existingEntries = [makeEntry({ fingerprint: fp })];

    const check = checkPromotionSignals(finding, existingEntries, []);
    expect(check.shouldPromote).toBe(false);
    expect(check.totalPoints).toBeGreaterThan(0); // signals fire but promote blocked
  });

  it("uses custom config threshold", () => {
    const aggressiveConfig: PromotionConfig = PROMOTION_PRESETS.aggressive;
    const finding = makeFinding({ importance: 0.8 }); // 1 point (high-importance)

    // Aggressive needs only 2 points — still not enough with 1
    const check = checkPromotionSignals(finding, [], [], aggressiveConfig);
    expect(check.shouldPromote).toBe(false);

    // Error + high = 3 points, aggressive needs 2
    const finding2 = makeFinding({ importance: 0.8, category: "error" });
    const check2 = checkPromotionSignals(finding2, [], [], aggressiveConfig);
    expect(check2.shouldPromote).toBe(true);
  });

  it("conservative config requires 4 points", () => {
    const conservativeConfig: PromotionConfig = PROMOTION_PRESETS.conservative;
    // error + high-importance = 3 points, not enough for conservative (4)
    const finding = makeFinding({ importance: 0.8, category: "error" });
    const check = checkPromotionSignals(finding, [], [], conservativeConfig);
    expect(check.totalPoints).toBe(3);
    expect(check.shouldPromote).toBe(false);
  });
});

describe("runPromotionPipeline", () => {
  it("separates promoted and skipped findings", () => {
    const session = makeSession({
      findings: [
        makeFinding({ importance: 0.8, category: "error" }), // 3 points → promote
        makeFinding({ importance: 0.3, category: "discovery" }), // 0 points → skip
      ],
    });

    const result = runPromotionPipeline(session, [], [session]);
    expect(result.promoted.length).toBe(1);
    expect(result.skipped.length).toBe(1);
    expect(result.totalChecked).toBe(2);
  });

  it("skips already-promoted findings", () => {
    const session = makeSession({
      findings: [
        makeFinding({ promotedToProjectMemory: true, importance: 0.8, category: "error" }),
      ],
    });

    const result = runPromotionPipeline(session, [], [session]);
    expect(result.promoted.length).toBe(0);
    expect(result.skipped.length).toBe(1);
  });

  it("applies hard filters — short content skipped", () => {
    const session = makeSession({
      findings: [
        makeFinding({ content: "ok", importance: 0.8, category: "error" }), // too short
      ],
    });

    const result = runPromotionPipeline(session, [], [session]);
    expect(result.promoted.length).toBe(0);
    expect(result.skipped.length).toBe(1);
  });

  it("applies hard filters — low importance skipped", () => {
    const session = makeSession({
      findings: [
        makeFinding({ importance: 0.1, category: "error" }), // below 0.25 threshold
      ],
    });

    const result = runPromotionPipeline(session, [], [session]);
    expect(result.promoted.length).toBe(0);
    expect(result.skipped.length).toBe(1);
  });

  it("respects custom config in pipeline", () => {
    const aggressiveConfig: PromotionConfig = PROMOTION_PRESETS.aggressive;
    const session = makeSession({
      findings: [
        makeFinding({ importance: 0.8, category: "error", content: "A".repeat(25) }), // 3 pts, aggressive needs 2
      ],
    });

    const result = runPromotionPipeline(session, [], [session], aggressiveConfig);
    expect(result.promoted.length).toBe(1);
  });
});
