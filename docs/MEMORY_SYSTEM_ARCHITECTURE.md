# Memory System Architecture — Complete Design Document

> Synthesis from multi-round multi-agent debates + principal engineer review.
> Last updated: 2026-02-21

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Two-Tier Architecture](#2-two-tier-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Schema Definitions](#4-schema-definitions)
5. [Storage Engine](#5-storage-engine)
6. [Retrieval Pipeline](#6-retrieval-pipeline)
7. [Injection Strategy](#7-injection-strategy)
8. [Unified PromptBudgetAllocator](#8-unified-promptbudgetallocator)
9. [Promotion Pipeline](#9-promotion-pipeline)
10. [Slash Commands](#10-slash-commands)
11. [Conflict Handling](#11-conflict-handling)
12. [Deduplication](#12-deduplication)
13. [PII / Secret Redaction](#13-pii--secret-redaction)
14. [Session Fork Semantics](#14-session-fork-semantics)
15. [Per-CLI Injection Formatting](#15-per-cli-injection-formatting)
16. [Compaction & TTL](#16-compaction--ttl)
17. [SLO Monitor](#17-slo-monitor)
18. [Audit Logger](#18-audit-logger)
19. [Implementation Status](#19-implementation-status)
20. [Decision Log](#20-decision-log)

---

## 1. Problem Statement

The current **Context Bridge** system provides short-lived, intra-session memory. When Agent A discovers something, it gets injected into Agent B's prompt within the same session. But **once the session ends, everything is lost**.

The Memory System solves this: **persistent cross-session knowledge** — decisions, patterns, warnings, and discoveries accumulated across a project's lifetime are retained and surfaced to all agents in future sessions.

### Goals

- Agents should learn from past sessions without user repeating themselves
- Critical warnings (e.g., "never modify auth middleware directly") should always be visible
- Knowledge should be shared across all CLIs (Claude Code, Gemini, Codex, OpenCode)
- Users should have explicit control over what is remembered and forgotten
- The system must not degrade prompt quality (token pollution) or performance (latency)

### Non-Goals

- Cross-device sync
- Multi-user collaboration memory
- Real-time streaming memory updates between concurrent agents

---

## 2. Two-Tier Architecture

### Project Memory (Long-lived, Shared)

- Persisted to disk, survives across all sessions
- Shared by all CLIs working on the same project
- Contains curated knowledge: architectural decisions, patterns, warnings, discoveries
- Scored by importance, accessed by retrieval pipeline
- Soft limit 3000 entries, eviction managed by importance decay + TTL + access frequency
- Compaction runs on load and every 50 accesses

### Session Memory (Per-session, Summarized)

- Scoped to a single session
- Checkpointed every 10 messages for crash recovery
- At session end, findings extracted and persisted
- Important findings auto-promoted to project memory via weighted promotion pipeline

### Relationship

```
Agent output (per-message)
    ↓ extraction (rule-based)
Session Findings (fingerprinted)
    ↓ promotion (manual /remember or weighted auto ≥3 points)
Project Memory (persistent, status: candidate → confirmed → pinned)
    ↓ retrieval (BM25 + metadata scoring) + injection
All future sessions
```

---

## 3. Directory Structure

```
~/.praxis/projects/{project-slug}/memory/
├── project.json              # Project memory store
├── project.json.bak          # Backup for integrity fallback
├── audit.json                # Append-only audit log
├── sessions/
│   ├── {sessionId}.memory.json     # Finalized session summaries
│   └── {sessionId}.checkpoints/    # Crash recovery checkpoints
└── index/                    # BM25 index cache (minisearch)
```

---

## 4. Schema Definitions

### 4.1 MemoryStore (project.json)

```typescript
interface MemoryStore {
  version: 1;
  entries: MemoryEntry[];
  aliases: Record<string, string[]>;
  conflicts: ConflictPair[];
  metadata: MemoryStoreMetadata;
}

interface MemoryStoreMetadata {
  createdAt: number;
  lastCompactedAt: number;
  totalPromotions: number;
  totalEvictions: number;
  totalAccesses: number;
  autoMemoryEnabled: boolean;      // default: true
  configPreset: ConfigPreset;      // "conservative" | "balanced" | "aggressive"
}

type ConfigPreset = "conservative" | "balanced" | "aggressive";

interface PromotionConfig {
  minPoints: number;
  minImportance: number;
  minContentLength: number;
}

// Presets
const PROMOTION_PRESETS: Record<ConfigPreset, PromotionConfig> = {
  conservative: { minPoints: 4, minImportance: 0.4, minContentLength: 50 },
  balanced:     { minPoints: 3, minImportance: 0.25, minContentLength: 30 },
  aggressive:   { minPoints: 2, minImportance: 0.15, minContentLength: 20 },
};
```

### 4.2 MemoryEntry

```typescript
interface MemoryEntry {
  id: string;                    // uuid
  fingerprint: string;           // djb2 double-hash of normalized content
  content: string;               // max 500 characters
  category: MemoryCategory;
  importance: number;            // 0.0-1.0, decays over time
  status: 'candidate' | 'confirmed' | 'pinned';
  confidence: number;            // extraction confidence score
  source: MemorySource;
  filePaths?: string[];
  tags?: string[];
  accessCount: number;
  lastAccessedAt: number;
  createdAt: number;
  updatedAt: number;
}

type MemoryCategory =
  | 'decision'       // architectural or design decisions
  | 'architecture'   // structural patterns, module boundaries
  | 'pattern'        // code patterns, conventions, idioms
  | 'warning'        // things to avoid, known pitfalls
  | 'discovery'      // findings about the codebase
  | 'error'          // recurring errors and their solutions
  | 'preference'     // user preferences for tooling/style
  | 'file_change'    // significant file modifications
  | 'task_progress'; // task-related progress notes

type PromotionSignal =
  | 'user-intent'       // /remember command (5 points)
  | 'multi-session'     // appeared in 2+ sessions (2 points)
  | 'multi-agent'       // referenced by 2+ different agents (1 point)
  | 'high-importance'   // importance >= 0.7 (1 point)
  | 'error-resolution'  // linked to a resolved error (2 points)
  | 'explicit-pin';     // /pin command (5 points)
```

### 4.3 SessionMemory

```typescript
interface SessionMemory {
  version: 1;
  sessionId: string;
  parentSessionId?: string;      // if forked
  agentId: ChatAgentId;
  findings: SessionFinding[];
  summary: string;
  createdAt: number;
  finalizedAt: number;
}

interface SessionFinding {
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
```

### 4.4 ConflictPair

```typescript
interface ConflictPair {
  entryA: string;
  entryB: string;
  conflictType: 'contradictory' | 'superseded' | 'ambiguous';
  detectedAt: number;
  resolvedAt?: number;
}
```

---

## 5. Storage Engine

### JsonMemoryStorage

JSON file-based implementation with backup fallback.

**Startup flow:**
1. Validate integrity (try parse primary, fallback to .bak)
2. Schema version check + migration
3. Backward compatibility (ensure `conflicts`, `autoMemoryEnabled`, `configPreset` exist)
4. Process quarantined candidates (24h → confirm if accessed, penalty if not)
5. Run compaction (importance decay + TTL eviction + soft limit enforcement)
6. Rebuild search index

**Write safety:** Reuses `persistence.ts` patterns (debounced save with `.bak` backup).

**Schema migration framework:** `MIGRATIONS` record maps version → migrator function. Runs sequentially until `CURRENT_VERSION`.

---

## 6. Retrieval Pipeline

### BM25 + Metadata Boost via minisearch

```typescript
// Index fields
fields: ['content', 'tags', 'filePaths', 'category']
boost: { content: 2, tags: 1.5, filePaths: 1.2, category: 1 }
fuzzy: 0.2, prefix: true
```

### Alias / Synonym Expansion

Manual alias map in project.json. Default aliases provided for common terms (auth, db, api, etc.).

### Full Retrieval Flow

```
User message arrives
    ↓
1. Extract active file paths from contextBridgeStore
2. Extract keywords from user message
3. Expand keywords via alias map
4. BM25 search (max 500 candidate scan, max 200ms timeout)
5. Post-BM25 scoring:
   score = bm25_score
         * category_weight
         * recency_multiplier
         * access_boost
         * file_affinity
         * status_boost
6. Reranker hook (NoOpReranker default, IRerankStrategy interface)
7. Sort by final score, take top-15
8. Confidence threshold (drop bottom 30%)
9. Diversity cap (max 2 per source session)
10. Take top-5 for injection
11. Pinned entries always injected (max 5)
12. Check for active conflicts on retrieved entries
    ↓
Return { pinnedEntries, retrievalResults, activeConflicts }
```

### SLO-Aware Degradation

When p95 latency > 300ms, retrieval auto-degrades:
- `topK`: 15 → 5
- `maxCandidateScan`: 500 → 100

### Hard Retrieval Cutoff

```typescript
const RETRIEVAL_LIMITS = {
  maxCandidateScan: 500,
  maxRetrievalMs: 200,
  topK: 15,
  injectionTopN: 5,
  maxPinned: 5,
  maxPerSource: 2,
};
```

---

## 7. Injection Strategy

### Hybrid Model: Always-Inject + Retrieval

```
Memory Injection
├── Always-Inject Tier (~200-400 tokens)
│   ├── Entries with status === 'pinned'
│   ├── Max 5 entries
│   └── Safety warnings, critical decisions
├── Retrieval Tier (~300-1500 tokens)
│   ├── BM25 results scored by relevance
│   └── Top-5 from retrieval pipeline
└── Session Summary Tier (~200-600 tokens)
    └── Summaries from recent sessions
```

Injection wrapped in try/catch — failures log error and continue without memory.

---

## 8. Unified PromptBudgetAllocator

```typescript
// Adaptive: total = remaining_context * 0.08, capped at 5000
// Priority: always-inject → context bridge → retrieval → session summary

interface BudgetAllocation {
  contextBridge: number;
  memoryAlwaysInject: number;
  memoryRetrieval: number;
  sessionSummary: number;
  total: number;
}
```

| Remaining Context | Total Budget | Always-Inject | Context Bridge | Retrieval | Summary |
|---|---|---|---|---|---|
| 100k | 5000 (ceiling) | 400 | 2300 | 1500 | 600 |
| 50k | 4000 | 320 | 1840 | 1196 | 600 |
| 20k | 1600 | 200 | 700 | 500 | 200 |
| 8k | 640 | 200 | 500 | 300 | 200 |

---

## 9. Promotion Pipeline

### Weighted Signal Scoring

Threshold: ≥3 points to auto-promote (configurable via preset).

| Signal | Points | Description |
|--------|--------|-------------|
| `user-intent` | 5 | `/remember` command — instant promote |
| `explicit-pin` | 5 | `/pin` command — instant promote |
| `multi-session` | 2 | Same fingerprint in 2+ sessions |
| `error-resolution` | 2 | Error category findings |
| `multi-agent` | 1 | Referenced by 2+ different agents |
| `high-importance` | 1 | importance ≥ 0.7 |

### Hard Filters (pre-scoring)

- Content length < `minContentLength` (default 30) → skip
- Importance < `minImportance` (default 0.25) → skip
- `/remember` bypasses all filters

### Candidate Quarantine

Auto-promoted entries start as `status: 'candidate'`. After 24 hours:
- **Accessed** → `confirmed`
- **Not accessed** → importance penalty (×0.8)
- **Pinned entries** never decay

### Session Finalization

Triggered automatically on:
- `handleEndSession()` — async finalization
- `beforeunload` — sync fast path

Skipped if `autoMemoryEnabled === false`.

---

## 10. Slash Commands

| Command | Description |
|---------|-------------|
| `/remember <text>` | Add entry to project memory (confirmed, bypasses filters) |
| `/forget <id\|keyword>` | Remove entry (by UUID or keyword search) |
| `/pin <id\|keyword>` | Toggle pin status (always-inject tier) |
| `/memory status` | Entry count, categories, index health, last injected |
| `/memory list [category]` | Browse entries with optional category filter |
| `/memory search <query>` | BM25 search with score display |
| `/memory budget <tokens>` | Override total token budget ceiling |
| `/memory alias add\|list\|remove` | Manage search aliases |
| `/memory auto on\|off` | Toggle auto-memory extraction |
| `/memory config [preset]` | Set promotion config (conservative/balanced/aggressive) |

---

## 11. Conflict Handling

### Keyword-Based Conflict Detection

Detects opposition pairs during entry addition:
- use / don't use
- always / never
- enable / disable
- add / remove
- should / shouldn't

Requirements: entries must share `filePaths` or `category`.

### Conflict Injection

Currently: if conflicting entries score into top-K, both are retrieved with `[⚠ CONFLICT]` marker.

### Conflict Resolution

`resolveConflict()` marks a ConflictPair with `resolvedAt` timestamp.

---

## 12. Deduplication

### Fingerprint-Based (Exact Match)

```typescript
// djb2 double-hash of normalized content
const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
// Two different seeds (0xdeadbeef, 0x41c6ce57) combined
```

### Merge Strategy

Duplicate detected → boost existing entry:
- `importance += 0.1` (capped at 1.0)
- `accessCount += 1`
- `updatedAt = Date.now()`
- Returns `{ id, isDuplicate: true }` for user feedback

---

## 13. PII / Secret Redaction

Pre-persist filter with:
- Pattern-based detection (API keys, GitHub tokens, AWS keys, emails, private keys, connection strings)
- Shannon entropy check (>4.0 bits/char for strings >20 chars)

---

## 14. Session Fork Semantics

### Copy-on-Fork

When a session is forked:
1. Child gets deep copy of parent's session memory
2. `parentSessionId` tracks lineage
3. Both can promote to project memory
4. Fingerprint dedup handles duplicate promotions

---

## 15. Per-CLI Injection Formatting

| CLI | Format |
|-----|--------|
| Claude Code | XML (`<project_memory>`) |
| Gemini | Markdown with headers |
| Codex / OpenCode | Plain text system message |

Conflict marker: `[⚠ CONFLICT] Entry #a1b2 says "X" but Entry #c3d4 says "Y". Verify which is current.`

---

## 16. Compaction & TTL

### Importance Decay

```
decayed = importance × accessDecay × statusMultiplier × accessResistance

accessDecay = 0.95^(daysSinceAccess / 7)   — 5% per week
statusMultiplier = candidate: 0.9, confirmed/pinned: 1.0
accessResistance = min(1.0, 0.5 + accessCount × 0.05)
```

Pinned entries never decay.

### Category-Based TTL

| Category | TTL (days) |
|----------|-----------|
| task_progress | 14 |
| discovery | 21 |
| file_change | 21 |
| warning | 30 |
| decision | 90 |
| error | 90 |
| pattern | 180 |
| architecture | 180 |
| preference | 365 |

Entries with `accessCount >= 3` survive TTL. Pinned entries never expire.

### Eviction

When entries > 3000 (soft limit):
1. Apply importance decay
2. Apply TTL eviction
3. If still > 3000, sort by importance, evict to 2700
4. Never evict pinned or recently accessed (24h) entries

---

## 17. SLO Monitor

Rolling window of last 100 retrieval latencies.

| Metric | Threshold | Action |
|--------|-----------|--------|
| p95 < 200ms | Healthy | Normal operation |
| p95 > 300ms | Degrade | Reduce topK to 5, maxCandidateScan to 100 |
| < 5 samples | Insufficient | No degradation |

---

## 18. Audit Logger

Append-only event log at `memory/audit.json`.

**Actions:** add, remove, update, promote, evict, pin, unpin, compact, finalize

**Journal-first:** Events logged before store mutation for durability.

**Limits:** Max 5000 events, trims to 4000 when exceeded.

---

## 19. Implementation Status

### Implemented (74 tests passing, TypeScript clean)

| Component | File | Tests |
|-----------|------|-------|
| Storage + integrity + migration | `storage.ts` | — |
| BM25 indexer | `indexer.ts` | 8 |
| Retrieval pipeline + SLO + reranker | `retrieval.ts` | 8 |
| Budget allocator | `budgetAllocator.ts` | 6 |
| Memory injector | `memoryInjector.ts` | — |
| PII redaction | `redaction.ts` | 9 |
| Conflict detection | `conflictDetector.ts` | 8 |
| SLO monitor | `sloMonitor.ts` | 9 |
| Reranker interface | `reranker.ts` | — |
| Session finalizer | `sessionFinalizer.ts` | — |
| Weighted promotion engine | `promotionEngine.ts` | 13 |
| Compaction + TTL | `compaction.ts` | 13 |
| Alias generator | `aliasGenerator.ts` | — |
| Session checkpointer | `checkpointer.ts` | — |
| Audit logger | `auditLog.ts` | — |
| Zustand store | `memoryStore.ts` | — |
| Slash commands | `commands.ts` | — |
| Session fork memory | `sessionBranching.ts` | — |
| AgentChatPanel integration | `AgentChatPanel.tsx` | — |

### Lifecycle Integration

- Memory init on session load ✅
- Memory injection per-prompt (try/catch) ✅
- Session finalization on handleEndSession ✅
- Session finalization on beforeunload (sync) ✅
- Auto-memory toggle ✅
- Audit logging on add/remove/finalize ✅

---

## 20. Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Two-tier memory (project + session) | Natural separation. Project = shared truth, Session = working memory |
| D2 | JSON + MemoryStorage interface | Start simple, swap to SQLite if needed |
| D3 | Soft limit 3000 entries | Token budget is the real limiter |
| D4 | BM25 via minisearch | Zero-dependency, pure JS, works in Electron |
| D5 | Unified PromptBudgetAllocator | Prevents context bridge and memory from competing |
| D6 | Copy-on-fork session memory | Matches existing session branching semantics |
| D7 | Fail-loud conflict injection | Silent suppression is harder unsolved problem |
| D8 | Candidate quarantine (24h) | Prevents memory poisoning from incorrect agent conclusions |
| D9 | Hybrid injection (always-inject + retrieval) | Safety-critical entries must never be missed |
| D10 | Weighted promotion (≥3 points) | Flat signal count too binary; weights reflect signal quality |
| D11 | TTL by category | Different knowledge types have different shelf lives |
| D12 | Journal-first audit logging | Durability guarantee — log intent before mutation |
| D13 | Hard filters before promotion | Prevent noise (<30 chars, <0.25 importance) |
| D14 | Config presets (conservative/balanced/aggressive) | User control over promotion sensitivity |
| D15 | Auto-memory toggle | Progressive consent — user can disable entirely |
