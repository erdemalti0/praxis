/**
 * Multi-signal auto-promotion engine.
 * Checks session findings for promotion signals and promotes
 * entries that meet the weighted threshold (≥3 points) as candidates.
 *
 * Signal weights:
 *   multi-session  ×2   error-resolution ×2
 *   multi-agent    ×1   high-importance  ×1
 *   user-intent    ×5   explicit-pin     ×5
 */

import type {
  MemoryEntry,
  SessionMemory,
  SessionFinding,
  PromotionSignal,
  PromotionConfig,
  MemoryCategory,
  MemoryEntryStatus,
  MemorySource,
} from "./types";
import { PROMOTION_PRESETS } from "./types";

// ─── Types ───────────────────────────────────────────────────────────

export interface PromotionCheck {
  finding: SessionFinding;
  signals: PromotionSignal[];
  totalPoints: number;
  shouldPromote: boolean;
}

export interface PromotionResult {
  promoted: PromotionCheck[];
  skipped: PromotionCheck[];
  totalChecked: number;
}

// ─── Constants ───────────────────────────────────────────────────────

export const SIGNAL_WEIGHTS: Record<PromotionSignal, number> = {
  "multi-session": 2,
  "error-resolution": 2,
  "multi-agent": 1,
  "high-importance": 1,
  "user-intent": 5,
  "explicit-pin": 5,
};

const DEFAULT_CONFIG: PromotionConfig = PROMOTION_PRESETS.balanced;
const HIGH_IMPORTANCE_THRESHOLD = 0.7;

// ─── Signal Checkers ─────────────────────────────────────────────────

/**
 * Check all promotion signals for a single finding.
 */
export function checkPromotionSignals(
  finding: SessionFinding,
  existingEntries: MemoryEntry[],
  allSessionMemories: SessionMemory[],
  config: PromotionConfig = DEFAULT_CONFIG,
): PromotionCheck {
  const signals: PromotionSignal[] = [];

  // Signal 1: multi-session — same fingerprint in 2+ sessions
  const sessionCount = allSessionMemories.filter((sm) =>
    sm.findings.some((f) => f.fingerprint === finding.fingerprint),
  ).length;
  if (sessionCount >= 2) signals.push("multi-session");

  // Signal 2: multi-agent — referenced by 2+ different agents
  const agentIds = new Set(
    allSessionMemories
      .filter((sm) => sm.findings.some((f) => f.fingerprint === finding.fingerprint))
      .map((sm) => sm.agentId),
  );
  if (agentIds.size >= 2) signals.push("multi-agent");

  // Signal 3: high-importance
  if (finding.importance >= HIGH_IMPORTANCE_THRESHOLD) signals.push("high-importance");

  // Signal 4: error-resolution — error findings get flagged conservatively
  if (finding.category === "error") {
    signals.push("error-resolution");
  }

  // Signal 5: already exists in project memory (boost, not create)
  const existsInProject = existingEntries.some(
    (e) => e.fingerprint === finding.fingerprint,
  );
  if (existsInProject) {
    const totalPoints = signals.reduce((sum, s) => sum + SIGNAL_WEIGHTS[s], 0);
    return { finding, signals, totalPoints, shouldPromote: false };
  }

  const totalPoints = signals.reduce((sum, s) => sum + SIGNAL_WEIGHTS[s], 0);
  return {
    finding,
    signals,
    totalPoints,
    shouldPromote: totalPoints >= config.minPoints,
  };
}

// ─── Promotion Pipeline ──────────────────────────────────────────────

/**
 * Run promotion checks for all findings in a session.
 * Applies hard filters first, then weighted signal scoring.
 */
export function runPromotionPipeline(
  sessionMemory: SessionMemory,
  existingEntries: MemoryEntry[],
  allSessionMemories: SessionMemory[],
  config: PromotionConfig = DEFAULT_CONFIG,
): PromotionResult {
  const promoted: PromotionCheck[] = [];
  const skipped: PromotionCheck[] = [];

  for (const finding of sessionMemory.findings) {
    // Skip already-promoted findings
    if (finding.promotedToProjectMemory) {
      skipped.push({ finding, signals: [], totalPoints: 0, shouldPromote: false });
      continue;
    }

    // Hard filters — drop noise before scoring
    if (
      finding.content.length < config.minContentLength ||
      finding.importance < config.minImportance
    ) {
      skipped.push({ finding, signals: [], totalPoints: 0, shouldPromote: false });
      continue;
    }

    const check = checkPromotionSignals(finding, existingEntries, allSessionMemories, config);

    if (check.shouldPromote) {
      promoted.push(check);
    } else {
      skipped.push(check);
    }
  }

  return {
    promoted,
    skipped,
    totalChecked: sessionMemory.findings.length,
  };
}

/**
 * Convert a promoted finding into a MemoryEntry for project memory.
 * Created as "candidate" status (goes through quarantine).
 */
export function findingToMemoryEntry(
  finding: SessionFinding,
  sessionMemory: SessionMemory,
  signals: PromotionSignal[],
): {
  content: string;
  category: MemoryCategory;
  importance: number;
  status: MemoryEntryStatus;
  confidence: number;
  source: MemorySource;
  filePaths?: string[];
  tags?: string[];
} {
  return {
    content: finding.content,
    category: finding.category,
    importance: finding.importance,
    status: "candidate", // quarantine period
    confidence: finding.confidence,
    source: {
      sessionId: sessionMemory.sessionId,
      agentId: sessionMemory.agentId,
      messageId: finding.id,
      promotedAt: Date.now(),
      promotionSignals: signals,
    },
    filePaths: finding.filePaths,
    tags: finding.tags,
  };
}
