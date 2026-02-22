/**
 * Memory system entry point.
 * Singleton initialization and public API.
 */

import { useMemoryStore } from "@/stores/memoryStore";
import { PromptBudgetAllocator } from "./budgetAllocator";
import { buildMemoryPrefix } from "./memoryInjector";
import type { ChatAgentId } from "@/types/agentPanel";
import type { BudgetAllocation, SearchResult, MemoryEntry, MemoryStatus } from "./types";

// ─── Singleton ────────────────────────────────────────────────────────

let _initialized = false;
let _budgetAllocator: PromptBudgetAllocator | null = null;

/**
 * Initialize the memory system for a project.
 * Call this when the project path is known (session start / restore).
 */
export function initMemorySystem(homeDir: string, projectPath: string): void {
  if (_initialized) return;

  const store = useMemoryStore.getState();
  store.load(homeDir, projectPath);

  _budgetAllocator = new PromptBudgetAllocator();
  _initialized = true;

  console.log("[memory] System initialized");
}

/**
 * Check if memory system is ready.
 */
export function isMemoryReady(): boolean {
  return _initialized && useMemoryStore.getState().isLoaded;
}

/**
 * Get the budget allocator instance.
 */
export function getBudgetAllocator(): PromptBudgetAllocator | null {
  return _budgetAllocator;
}

/**
 * Retrieve memory entries relevant to a query.
 * Returns pinned (always-inject) and scored retrieval results.
 */
export function retrieveMemory(
  query: string,
  agentId: ChatAgentId,
  options?: { filePaths?: string[]; maxTokens?: number },
): {
  pinnedEntries: MemoryEntry[];
  retrievalResults: SearchResult[];
  activeConflicts: Array<{ entryA: MemoryEntry; entryB: MemoryEntry }>;
} {
  if (!_initialized) return { pinnedEntries: [], retrievalResults: [], activeConflicts: [] };

  const store = useMemoryStore.getState();
  if (!store.isLoaded || store.store.entries.length === 0) {
    return { pinnedEntries: [], retrievalResults: [], activeConflicts: [] };
  }

  const result = store._retrieval.retrieve(
    query,
    store.store.entries,
    store._indexer,
    store.store.aliases,
    {
      filePaths: options?.filePaths,
      maxTokens: options?.maxTokens,
      conflicts: store.store.conflicts,
      featureFlags: store.store.metadata.featureFlags,
    },
  );

  // Record injection for tracking + telemetry
  store.recordInjection(result.retrievalResults, agentId);

  return result;
}

/**
 * Build the full memory injection prefix for an agent's prompt.
 * This is the main integration point called from AgentChatPanel.
 */
export function getMemoryInjectionPrefix(
  query: string,
  agentId: ChatAgentId,
  tokenBudget: number,
  filePaths?: string[],
): string {
  if (!_initialized) return "";

  const { pinnedEntries, retrievalResults, activeConflicts } = retrieveMemory(query, agentId, {
    filePaths,
    maxTokens: tokenBudget,
  });

  if (pinnedEntries.length === 0 && retrievalResults.length === 0) return "";

  return buildMemoryPrefix(pinnedEntries, retrievalResults, agentId, activeConflicts);
}

/**
 * Allocate token budget for memory and context bridge.
 */
export function allocateBudget(remainingContextTokens: number): BudgetAllocation | null {
  if (!_budgetAllocator) return null;
  return _budgetAllocator.allocate(remainingContextTokens);
}

/**
 * Get memory system status for /memory command.
 */
export function getMemoryStatus(): MemoryStatus | null {
  if (!_initialized) return null;
  return useMemoryStore.getState().getStatus();
}

/**
 * Reset memory system (for testing or project switch).
 */
export function resetMemorySystem(): void {
  _initialized = false;
  _budgetAllocator = null;
}

// Re-export commonly used types
export type { MemoryEntry, SearchResult, BudgetAllocation, MemoryStatus } from "./types";
export { PromptBudgetAllocator } from "./budgetAllocator";
