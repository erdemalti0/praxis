/**
 * Unified PromptBudgetAllocator.
 * Manages token budgets for context bridge, memory injection, and session summaries
 * as a single pool to prevent competing injectors from crowding out conversation.
 */

import type { BudgetAllocation, BudgetConfig } from "./types";

// ─── Default Config ───────────────────────────────────────────────────

const DEFAULT_CONFIG: BudgetConfig = {
  contextRatio: 0.08,                // 8% of remaining context

  memoryAlwaysInjectFloor: 200,
  memoryAlwaysInjectCeiling: 400,
  memoryRetrievalFloor: 300,
  memoryRetrievalCeiling: 1500,
  sessionSummaryFloor: 200,
  sessionSummaryCeiling: 600,
  contextBridgeFloor: 500,
  contextBridgeCeiling: 3000,

  totalCeiling: 5000,
};

// ─── Utility ──────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Allocator ────────────────────────────────────────────────────────

export class PromptBudgetAllocator {
  private config: BudgetConfig;

  constructor(config?: Partial<BudgetConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Allocate token budget across all injection sources.
   *
   * Priority order:
   * 1. Always-inject memory (safety-critical, highest priority)
   * 2. Context bridge (cross-agent context)
   * 3. Memory retrieval (relevant past knowledge)
   * 4. Session summaries (continuity, lowest priority)
   */
  allocate(remainingContextTokens: number): BudgetAllocation {
    const totalBudget = Math.min(
      Math.floor(remainingContextTokens * this.config.contextRatio),
      this.config.totalCeiling,
    );

    // 1. Always-inject memory — highest priority (safety entries)
    const alwaysInject = clamp(
      Math.floor(totalBudget * 0.08),
      this.config.memoryAlwaysInjectFloor,
      this.config.memoryAlwaysInjectCeiling,
    );

    const remaining1 = totalBudget - alwaysInject;

    // 2. Context bridge — cross-agent context
    const contextBridge = clamp(
      Math.floor(remaining1 * 0.50),
      this.config.contextBridgeFloor,
      this.config.contextBridgeCeiling,
    );

    const remaining2 = remaining1 - contextBridge;

    // 3. Memory retrieval — relevant past knowledge
    const memoryRetrieval = clamp(
      Math.floor(remaining2 * 0.65),
      this.config.memoryRetrievalFloor,
      this.config.memoryRetrievalCeiling,
    );

    // 4. Session summaries — continuity (gets remaining budget)
    const sessionSummary = clamp(
      remaining2 - memoryRetrieval,
      this.config.sessionSummaryFloor,
      this.config.sessionSummaryCeiling,
    );

    const total = alwaysInject + contextBridge + memoryRetrieval + sessionSummary;

    return {
      memoryAlwaysInject: alwaysInject,
      contextBridge,
      memoryRetrieval,
      sessionSummary,
      total,
    };
  }

  /**
   * Update config (e.g., from /memory budget command).
   */
  updateConfig(updates: Partial<BudgetConfig>): void {
    Object.assign(this.config, updates);
  }

  getConfig(): Readonly<BudgetConfig> {
    return { ...this.config };
  }
}
