/**
 * Memory system type definitions.
 * Persistent cross-session knowledge for multi-agent CLI orchestration.
 */

import type { ChatAgentId } from "@/types/agentPanel";

// ─── Memory Categories ────────────────────────────────────────────────

export type MemoryCategory =
  | "discovery"
  | "decision"
  | "file_change"
  | "error"
  | "architecture"
  | "task_progress"
  | "pattern"
  | "warning"
  | "preference";

// ─── Promotion Signals ────────────────────────────────────────────────

export type PromotionSignal =
  | "user-intent"       // /remember command
  | "multi-session"     // appeared in 2+ sessions
  | "multi-agent"       // referenced by 2+ different agents
  | "high-importance"   // importance >= 0.7
  | "error-resolution"  // linked to a resolved error
  | "explicit-pin";     // /pin command

// ─── Memory Entry ─────────────────────────────────────────────────────

export type MemoryEntryStatus = "candidate" | "confirmed" | "pinned";

export interface MemorySource {
  sessionId: string;
  agentId: ChatAgentId;
  messageId: string;
  promotedAt: number;
  promotionSignals: PromotionSignal[];
}

export interface MemoryEntry {
  id: string;
  fingerprint: string;            // SHA-256 (first 16 hex chars) of normalized content
  content: string;                // max 500 characters
  category: MemoryCategory;
  importance: number;             // 0.0–1.0, decays over time
  status: MemoryEntryStatus;
  confidence: number;             // extraction confidence score 0.0–1.0
  source: MemorySource;
  filePaths?: string[];
  tags?: string[];
  accessCount: number;
  lastAccessedAt: number;
  createdAt: number;
  updatedAt: number;
  // Duplicate suppression (Phase 5)
  suppressed?: boolean;
  suppressedBy?: string;
  suppressedAt?: number;
  // Injection telemetry (Phase 5)
  telemetry?: EntryTelemetry;
}

// ─── Memory Store (persisted to project.json) ─────────────────────────

export type ConfigPreset = "conservative" | "balanced" | "aggressive";

export interface PromotionConfig {
  minPoints: number;
  minImportance: number;
  minContentLength: number;
}

export const PROMOTION_PRESETS: Record<ConfigPreset, PromotionConfig> = {
  conservative: { minPoints: 4, minImportance: 0.4, minContentLength: 50 },
  balanced:     { minPoints: 3, minImportance: 0.25, minContentLength: 30 },
  aggressive:   { minPoints: 2, minImportance: 0.15, minContentLength: 20 },
};

export interface MemoryStoreMetadata {
  createdAt: number;
  lastCompactedAt: number;
  totalPromotions: number;
  totalEvictions: number;
  totalAccesses: number;
  autoMemoryEnabled: boolean;
  configPreset: ConfigPreset;
  featureFlags: MemoryFeatureFlags;
}

export interface MemoryStore {
  version: 1;
  entries: MemoryEntry[];
  aliases: Record<string, string[]>;
  conflicts: ConflictPair[];
  metadata: MemoryStoreMetadata;
}

// ─── Session Memory ───────────────────────────────────────────────────

export interface SessionFinding {
  id: string;
  fingerprint: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  confidence: number;
  filePaths?: string[];
  tags?: string[];
  promotedToProjectMemory: boolean;
  promotedEntryId?: string;
}

export interface SessionMemory {
  version: 1;
  sessionId: string;
  parentSessionId?: string;
  agentId: ChatAgentId;
  findings: SessionFinding[];
  summary: string;
  createdAt: number;
  finalizedAt: number;
}

export interface SessionMemorySummary {
  sessionId: string;
  agentId: ChatAgentId;
  findingCount: number;
  summary: string;
  createdAt: number;
}

// ─── Search ───────────────────────────────────────────────────────────

export interface SearchOptions {
  maxCandidateScan: number;       // default: 500
  maxRetrievalMs: number;         // default: 200
  topK: number;                   // default: 15
  filePaths?: string[];           // boost entries matching these
  categories?: MemoryCategory[];
}

export interface SearchResult {
  entry: MemoryEntry;
  score: number;
  matchedFields: string[];
}

// ─── Integrity ────────────────────────────────────────────────────────

export interface IntegrityReport {
  valid: boolean;
  entryCount: number;
  errors: string[];
  recoveredFromBackup: boolean;
}

// ─── Budget Allocation ────────────────────────────────────────────────

export interface BudgetAllocation {
  contextBridge: number;
  memoryAlwaysInject: number;
  memoryRetrieval: number;
  sessionSummary: number;
  total: number;
}

export interface BudgetConfig {
  contextRatio: number;                   // default: 0.08

  memoryAlwaysInjectFloor: number;        // 200
  memoryAlwaysInjectCeiling: number;      // 400
  memoryRetrievalFloor: number;           // 300
  memoryRetrievalCeiling: number;         // 1500
  sessionSummaryFloor: number;            // 200
  sessionSummaryCeiling: number;          // 600
  contextBridgeFloor: number;             // 500
  contextBridgeCeiling: number;           // 3000

  totalCeiling: number;                   // 5000
}

// ─── Memory Status ────────────────────────────────────────────────────

export interface MemoryStatus {
  entryCount: number;
  byStatus: Record<MemoryEntryStatus, number>;
  byCategory: Partial<Record<MemoryCategory, number>>;
  estimatedTokens: number;
  lastInjected: Array<{ id: string; content: string; score: number }>;
  indexHealth: {
    indexed: number;
    lastRebuiltAt: number;
  };
}

// ─── Feature Flags ───────────────────────────────────────────────────

export interface MemoryFeatureFlags {
  conflictMetadata: boolean;
  duplicateSuppression: boolean;
  messagePointers: boolean;
  injectionTelemetry: boolean;
  softCategoryBonus: boolean;
}

export const DEFAULT_FEATURE_FLAGS: MemoryFeatureFlags = {
  conflictMetadata: false,
  duplicateSuppression: false,
  messagePointers: false,
  injectionTelemetry: false,
  softCategoryBonus: false,
};

// ─── Injection Telemetry ─────────────────────────────────────────────

export interface EntryTelemetry {
  injectionCount: number;
  lastInjectedAt: number;
  targetAgents: string[];
  wasContradicted: boolean;
  wasUseful: boolean;
}

// ─── Message Pointer ─────────────────────────────────────────────────

export interface MessagePointer {
  messageId: string;
  contentHash: string;
  categoryHint: MemoryCategory | null;
  timestamp: number;
}

// ─── Conflict ─────────────────────────────────────────────────────────

export interface ConflictPair {
  entryA: string;
  entryB: string;
  conflictType: "contradictory" | "superseded" | "ambiguous";
  detectedAt: number;
  resolvedAt?: number;
  conflictSetId?: string;
  severity?: "low" | "medium" | "high";
  detectedReason?: string;
  sourceAgentA?: string;
  sourceAgentB?: string;
}
