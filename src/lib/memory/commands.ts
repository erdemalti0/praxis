/**
 * Memory system slash commands.
 * /remember <text> — manually add entry to project memory
 * /forget <keyword|id> — remove entry from memory
 * /pin <id|keyword> — pin entry for always-inject
 * /memory status — show memory system status
 * /memory list [category] — list memory entries
 * /memory search <query> — search memory
 * /memory budget <tokens> — update budget ceiling
 * /memory alias add|list|remove — manage search aliases
 * /memory auto on|off — toggle auto-memory extraction
 * /memory config [preset] — set promotion config preset
 */

import { useMemoryStore } from "@/stores/memoryStore";
import { PromptBudgetAllocator } from "./budgetAllocator";
import type { MemoryCategory, PromotionSignal, MemoryEntryStatus, ConfigPreset, MemoryFeatureFlags } from "./types";
import { PROMOTION_PRESETS, DEFAULT_FEATURE_FLAGS } from "./types";

// ─── Command Context (matches commandRegistry.ts interface) ───────────

interface CommandContext {
  activeAgentId: string;
  showSystemMessage: (text: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function statusIcon(status: MemoryEntryStatus): string {
  switch (status) {
    case "pinned": return "[PIN]";
    case "confirmed": return "[OK]";
    case "candidate": return "[?]";
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

// ─── /remember ────────────────────────────────────────────────────────

/**
 * Parse /remember command args.
 * Supports optional category prefix: /remember [decision] JWT tokens use httpOnly cookies
 */
function parseRememberArgs(args: string): { content: string; category: MemoryCategory } {
  const categoryMatch = args.match(/^\[(\w+)]\s+(.+)$/s);
  if (categoryMatch) {
    const cat = categoryMatch[1].toLowerCase();
    const validCategories: MemoryCategory[] = [
      "decision", "architecture", "pattern", "warning",
      "discovery", "error", "preference", "file_change", "task_progress",
    ];
    const category = validCategories.includes(cat as MemoryCategory)
      ? (cat as MemoryCategory)
      : "discovery";
    return { content: categoryMatch[2].trim(), category };
  }

  // Auto-detect category from keywords
  const lower = args.toLowerCase();
  let category: MemoryCategory = "discovery";
  if (lower.includes("never") || lower.includes("don't") || lower.includes("avoid") || lower.includes("warning")) {
    category = "warning";
  } else if (lower.includes("decided") || lower.includes("chose") || lower.includes("use ") || lower.includes("decision")) {
    category = "decision";
  } else if (lower.includes("pattern") || lower.includes("convention") || lower.includes("always")) {
    category = "pattern";
  } else if (lower.includes("prefer") || lower.includes("style")) {
    category = "preference";
  }

  return { content: args.trim(), category };
}

export function executeRemember(args: string, context: CommandContext): boolean {
  if (!args.trim()) {
    context.showSystemMessage("Usage: /remember <text>\nExample: /remember [decision] JWT tokens stored in httpOnly cookies");
    return true;
  }

  const { content, category } = parseRememberArgs(args);
  const store = useMemoryStore.getState();

  if (!store.isLoaded) {
    context.showSystemMessage("Memory system not initialized. Send a message first to activate.");
    return true;
  }

  const signals: PromotionSignal[] = ["user-intent"];
  const result = store.addEntry({
    content,
    category,
    importance: 0.8,
    status: "confirmed",
    confidence: 1.0,
    source: {
      sessionId: "manual",
      agentId: context.activeAgentId as any,
      messageId: "manual",
      promotedAt: Date.now(),
      promotionSignals: signals,
    },
  });

  if (result) {
    if (result.isDuplicate) {
      context.showSystemMessage(
        `Entry boosted (duplicate detected) [${category.toUpperCase()}]: "${truncate(content, 100)}"\nEntry ID: ${result.id}`,
      );
    } else {
      context.showSystemMessage(
        `Remembered [${category.toUpperCase()}]: "${truncate(content, 100)}"\nEntry ID: ${result.id}`,
      );
    }
  } else {
    context.showSystemMessage("Failed to save memory entry.");
  }

  return true;
}

// ─── /forget ─────────────────────────────────────────────────────────

export function executeForget(args: string, context: CommandContext): boolean {
  const query = args.trim();
  if (!query) {
    context.showSystemMessage("Usage: /forget <keyword or entry-id>");
    return true;
  }

  const store = useMemoryStore.getState();
  if (!store.isLoaded) {
    context.showSystemMessage("Memory system not initialized.");
    return true;
  }

  // Direct ID deletion
  if (UUID_RE.test(query)) {
    const entry = store.getEntry(query);
    if (!entry) {
      context.showSystemMessage(`Entry not found: ${query}`);
      return true;
    }
    store.removeEntry(query);
    context.showSystemMessage(`Removed: [${entry.category.toUpperCase()}] "${truncate(entry.content, 80)}"`);
    return true;
  }

  // Search by keyword, delete best match
  const results = store.search(query);
  if (results.length === 0) {
    context.showSystemMessage(`No matching entries found for: "${query}"`);
    return true;
  }

  const best = results[0];
  store.removeEntry(best.entry.id);

  const lines = [`Removed: [${best.entry.category.toUpperCase()}] "${truncate(best.entry.content, 80)}"`];
  if (results.length > 1) {
    lines.push("", "Other matches (not removed):");
    for (const r of results.slice(1, 3)) {
      lines.push(`  [${r.score.toFixed(2)}] ${truncate(r.entry.content, 60)} (ID: ${r.entry.id.slice(0, 8)}...)`);
    }
  }

  context.showSystemMessage(lines.join("\n"));
  return true;
}

// ─── /pin ────────────────────────────────────────────────────────────

export function executePin(args: string, context: CommandContext): boolean {
  const query = args.trim();
  if (!query) {
    context.showSystemMessage("Usage: /pin <entry-id or keyword>");
    return true;
  }

  const store = useMemoryStore.getState();
  if (!store.isLoaded) {
    context.showSystemMessage("Memory system not initialized.");
    return true;
  }

  // Find the entry
  let entryId: string | null = null;

  if (UUID_RE.test(query)) {
    const entry = store.getEntry(query);
    if (!entry) {
      context.showSystemMessage(`Entry not found: ${query}`);
      return true;
    }
    entryId = query;
  } else {
    // Search by keyword
    const results = store.search(query);
    if (results.length === 0) {
      context.showSystemMessage(`No matching entries found for: "${query}"`);
      return true;
    }
    entryId = results[0].entry.id;
  }

  // Check pinned count
  const pinnedCount = store.store.entries.filter((e) => e.status === "pinned").length;
  if (pinnedCount >= 5) {
    context.showSystemMessage(
      `Warning: Already ${pinnedCount} pinned entries (max recommended: 5).\nPinned entries are always injected and consume token budget.`,
    );
  }

  const entry = store.getEntry(entryId);
  if (!entry) return true;

  if (entry.status === "pinned") {
    // Unpin
    store.updateEntry(entryId, { status: "confirmed" });
    context.showSystemMessage(`Unpinned: "${truncate(entry.content, 80)}"`);
  } else {
    // Pin
    store.updateEntry(entryId, { status: "pinned" });
    context.showSystemMessage(`Pinned: "${truncate(entry.content, 80)}"\nThis entry will always be injected into agent context.`);
  }

  return true;
}

// ─── /memory subcommands ─────────────────────────────────────────────

export function executeMemoryCommand(args: string, context: CommandContext): boolean {
  const parts = args.trim().split(/\s+/);
  const subcommand = (parts[0] || "status").toLowerCase();
  const subArgs = parts.slice(1).join(" ");

  switch (subcommand) {
    case "status":
    case "":
      return executeMemoryStatus(subArgs, context);
    case "list":
      return executeMemoryList(subArgs, context);
    case "search":
      return executeMemorySearch(subArgs, context);
    case "budget":
      return executeMemoryBudget(subArgs, context);
    case "alias":
      return executeMemoryAlias(subArgs, context);
    case "auto":
      return executeMemoryAuto(subArgs, context);
    case "config":
      return executeMemoryConfig(subArgs, context);
    case "flags":
      return executeMemoryFlags(subArgs, context);
    default:
      context.showSystemMessage(
        "Usage: /memory <status|list|search|budget|alias|auto|config|flags>\n" +
        "  /memory status — show system status\n" +
        "  /memory list [category] — list entries\n" +
        "  /memory search <query> — search entries\n" +
        "  /memory budget <tokens> — set budget ceiling\n" +
        "  /memory alias add|list|remove — manage aliases\n" +
        "  /memory auto on|off — toggle auto-memory\n" +
        "  /memory config [preset] — set promotion config\n" +
        "  /memory flags [name on|off] — toggle feature flags",
      );
      return true;
  }
}

// ─── /memory status ──────────────────────────────────────────────────

export function executeMemoryStatus(_args: string, context: CommandContext): boolean {
  const store = useMemoryStore.getState();

  if (!store.isLoaded) {
    context.showSystemMessage("Memory system not loaded.");
    return true;
  }

  const status = store.getStatus();

  const lines: string[] = [
    "── Memory System Status ──",
    "",
    `Entries: ${status.entryCount}`,
    `  Pinned: ${status.byStatus.pinned}`,
    `  Confirmed: ${status.byStatus.confirmed}`,
    `  Candidate: ${status.byStatus.candidate}`,
    "",
    `Estimated tokens: ${status.estimatedTokens}`,
    "",
    "Categories:",
  ];

  for (const [cat, count] of Object.entries(status.byCategory)) {
    lines.push(`  ${cat}: ${count}`);
  }

  lines.push(
    "",
    `Index: ${status.indexHealth.indexed} entries indexed`,
    `Last rebuilt: ${status.indexHealth.lastRebuiltAt ? new Date(status.indexHealth.lastRebuiltAt).toLocaleTimeString() : "never"}`,
  );

  if (status.lastInjected.length > 0) {
    lines.push("", "Last injected:");
    for (const item of status.lastInjected.slice(0, 5)) {
      lines.push(`  [${item.score.toFixed(2)}] ${item.content}`);
    }
  }

  // Injection telemetry (Phase 5)
  const flags = store.store.metadata.featureFlags;
  if (flags?.injectionTelemetry) {
    const entriesWithTelemetry = store.store.entries.filter((e) => e.telemetry);
    if (entriesWithTelemetry.length > 0) {
      const totalInjections = entriesWithTelemetry.reduce(
        (sum, e) => sum + (e.telemetry?.injectionCount ?? 0), 0,
      );
      const allAgents = new Set(
        entriesWithTelemetry.flatMap((e) => e.telemetry?.targetAgents ?? []),
      );
      const mostInjected = entriesWithTelemetry
        .sort((a, b) => (b.telemetry?.injectionCount ?? 0) - (a.telemetry?.injectionCount ?? 0))[0];

      lines.push(
        "",
        "Injection telemetry:",
        `  Total injections: ${totalInjections}`,
      );
      if (mostInjected?.telemetry) {
        lines.push(
          `  Most injected: "${truncate(mostInjected.content, 50)}" (${mostInjected.telemetry.injectionCount}x)`,
        );
      }
      if (allAgents.size > 0) {
        lines.push(`  Agents reached: ${[...allAgents].join(", ")}`);
      }
      const contradicted = entriesWithTelemetry.filter((e) => e.telemetry?.wasContradicted).length;
      if (contradicted > 0) {
        lines.push(`  Contradicted entries: ${contradicted}`);
      }
    }
  }

  context.showSystemMessage(lines.join("\n"));
  return true;
}

// ─── /memory list ────────────────────────────────────────────────────

function executeMemoryList(args: string, context: CommandContext): boolean {
  const store = useMemoryStore.getState();
  if (!store.isLoaded) {
    context.showSystemMessage("Memory system not loaded.");
    return true;
  }

  // Parse: /memory list [category] [--limit N]
  let category: MemoryCategory | null = null;
  let limit = 10;

  const parts = args.trim().split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "--limit" && parts[i + 1]) {
      limit = Math.min(50, Math.max(1, parseInt(parts[i + 1], 10) || 10));
      i++;
    } else if (parts[i]) {
      category = parts[i].toLowerCase() as MemoryCategory;
    }
  }

  let entries = store.store.entries;
  if (category) {
    entries = entries.filter((e) => e.category === category);
  }

  // Sort by importance desc
  const sorted = [...entries].sort((a, b) => b.importance - a.importance).slice(0, limit);

  if (sorted.length === 0) {
    context.showSystemMessage(category ? `No entries in category: ${category}` : "No memory entries.");
    return true;
  }

  const lines = [`── Memory Entries (${sorted.length}/${entries.length}) ──`, ""];
  for (const entry of sorted) {
    lines.push(
      `${statusIcon(entry.status)} [${entry.category.toUpperCase()}] ${truncate(entry.content, 70)}`,
      `    importance: ${entry.importance.toFixed(2)} | accessed: ${entry.accessCount}x | ID: ${entry.id.slice(0, 8)}...`,
    );
  }

  context.showSystemMessage(lines.join("\n"));
  return true;
}

// ─── /memory search ──────────────────────────────────────────────────

function executeMemorySearch(args: string, context: CommandContext): boolean {
  const query = args.trim();
  if (!query) {
    context.showSystemMessage("Usage: /memory search <query>");
    return true;
  }

  const store = useMemoryStore.getState();
  if (!store.isLoaded) {
    context.showSystemMessage("Memory system not loaded.");
    return true;
  }

  const results = store.search(query);
  if (results.length === 0) {
    context.showSystemMessage(`No results for: "${query}"`);
    return true;
  }

  const lines = [`── Search: "${query}" (${results.length} results) ──`, ""];
  for (const r of results.slice(0, 10)) {
    lines.push(
      `[${r.score.toFixed(2)}] ${statusIcon(r.entry.status)} [${r.entry.category.toUpperCase()}] ${truncate(r.entry.content, 60)}`,
      `    fields: ${r.matchedFields.join(", ")} | ID: ${r.entry.id.slice(0, 8)}...`,
    );
  }

  context.showSystemMessage(lines.join("\n"));
  return true;
}

// ─── /memory budget ──────────────────────────────────────────────────

function executeMemoryBudget(args: string, context: CommandContext): boolean {
  const tokensArg = parseInt(args.trim(), 10);

  if (!tokensArg || tokensArg < 500) {
    // Show current allocation
    const allocator = new PromptBudgetAllocator();
    const budget = allocator.allocate(100_000);
    const lines = [
      "── Memory Budget Allocation (100K context) ──",
      "",
      `  Always-inject: ${budget.memoryAlwaysInject} tokens`,
      `  Retrieval: ${budget.memoryRetrieval} tokens`,
      `  Context bridge: ${budget.contextBridge} tokens`,
      `  Session summary: ${budget.sessionSummary} tokens`,
      `  Total: ${budget.total} tokens`,
      "",
      "Usage: /memory budget <total-ceiling>  (min: 500)",
    ];
    context.showSystemMessage(lines.join("\n"));
    return true;
  }

  const allocator = new PromptBudgetAllocator({ totalCeiling: tokensArg });
  const budget = allocator.allocate(100_000);
  const lines = [
    `── Budget Updated (ceiling: ${tokensArg}) ──`,
    "",
    `  Always-inject: ${budget.memoryAlwaysInject} tokens`,
    `  Retrieval: ${budget.memoryRetrieval} tokens`,
    `  Context bridge: ${budget.contextBridge} tokens`,
    `  Session summary: ${budget.sessionSummary} tokens`,
    `  Total: ${budget.total} tokens`,
  ];
  context.showSystemMessage(lines.join("\n"));
  return true;
}

// ─── /memory alias ───────────────────────────────────────────────────

function executeMemoryAlias(args: string, context: CommandContext): boolean {
  const store = useMemoryStore.getState();
  if (!store.isLoaded) {
    context.showSystemMessage("Memory system not loaded.");
    return true;
  }

  const parts = args.trim().split(/\s+/);
  const action = (parts[0] || "list").toLowerCase();

  switch (action) {
    case "list": {
      const aliases = store.store.aliases;
      const keys = Object.keys(aliases);
      if (keys.length === 0) {
        context.showSystemMessage("No aliases configured.");
        return true;
      }
      const lines = ["── Aliases ──", ""];
      for (const key of keys.sort()) {
        lines.push(`  ${key} -> ${aliases[key].join(", ")}`);
      }
      context.showSystemMessage(lines.join("\n"));
      return true;
    }

    case "add": {
      const key = parts[1];
      const synonyms = parts.slice(2);
      if (!key || synonyms.length === 0) {
        context.showSystemMessage("Usage: /memory alias add <key> <synonym1> <synonym2> ...");
        return true;
      }
      const existing = store.store.aliases[key] || [];
      const merged = [...new Set([...existing, ...synonyms])];
      const updatedAliases = { ...store.store.aliases, [key]: merged };
      store.store.aliases = updatedAliases;
      store.save();
      context.showSystemMessage(`Alias updated: ${key} -> ${merged.join(", ")}`);
      return true;
    }

    case "remove": {
      const key = parts[1];
      if (!key) {
        context.showSystemMessage("Usage: /memory alias remove <key>");
        return true;
      }
      if (!store.store.aliases[key]) {
        context.showSystemMessage(`Alias not found: ${key}`);
        return true;
      }
      const { [key]: _removed, ...rest } = store.store.aliases;
      store.store.aliases = rest;
      store.save();
      context.showSystemMessage(`Alias removed: ${key}`);
      return true;
    }

    default:
      context.showSystemMessage("Usage: /memory alias <add|list|remove>");
      return true;
  }
}

// ─── /memory auto ───────────────────────────────────────────────────

function executeMemoryAuto(args: string, context: CommandContext): boolean {
  const store = useMemoryStore.getState();
  if (!store.isLoaded) {
    context.showSystemMessage("Memory system not loaded.");
    return true;
  }

  const arg = args.trim().toLowerCase();

  if (arg === "on") {
    store.store.metadata.autoMemoryEnabled = true;
    store.save();
    context.showSystemMessage("Auto-memory enabled. Session findings will be automatically extracted and promoted.");
    return true;
  }

  if (arg === "off") {
    store.store.metadata.autoMemoryEnabled = false;
    store.save();
    context.showSystemMessage("Auto-memory disabled. Use /remember to manually save entries.");
    return true;
  }

  // Show current state
  const enabled = store.store.metadata.autoMemoryEnabled;
  context.showSystemMessage(
    `Auto-memory is currently: ${enabled ? "ON" : "OFF"}\n` +
    "Usage: /memory auto <on|off>",
  );
  return true;
}

// ─── /memory config ─────────────────────────────────────────────────

function executeMemoryConfig(args: string, context: CommandContext): boolean {
  const store = useMemoryStore.getState();
  if (!store.isLoaded) {
    context.showSystemMessage("Memory system not loaded.");
    return true;
  }

  const preset = args.trim().toLowerCase() as ConfigPreset;
  const validPresets: ConfigPreset[] = ["conservative", "balanced", "aggressive"];

  if (validPresets.includes(preset)) {
    store.store.metadata.configPreset = preset;
    store.save();

    const config = PROMOTION_PRESETS[preset];
    context.showSystemMessage(
      `Config preset set to: ${preset.toUpperCase()}\n` +
      `  Min points to promote: ${config.minPoints}\n` +
      `  Min importance: ${config.minImportance}\n` +
      `  Min content length: ${config.minContentLength}`,
    );
    return true;
  }

  // Show current config
  const current = store.store.metadata.configPreset || "balanced";
  const config = PROMOTION_PRESETS[current];
  const lines = [
    `── Memory Config (${current.toUpperCase()}) ──`,
    "",
    `  Min points to promote: ${config.minPoints}`,
    `  Min importance: ${config.minImportance}`,
    `  Min content length: ${config.minContentLength}`,
    `  Auto-memory: ${store.store.metadata.autoMemoryEnabled ? "ON" : "OFF"}`,
    "",
    "Presets: conservative | balanced | aggressive",
    "",
    "  conservative — Higher bar (4 pts, 0.4 importance, 50 chars)",
    "  balanced     — Default (3 pts, 0.25 importance, 30 chars)",
    "  aggressive   — Lower bar (2 pts, 0.15 importance, 20 chars)",
    "",
    "Usage: /memory config <preset>",
  ];
  context.showSystemMessage(lines.join("\n"));
  return true;
}

// ─── /memory flags ──────────────────────────────────────────────────

const VALID_FLAG_NAMES: (keyof MemoryFeatureFlags)[] = [
  "conflictMetadata",
  "duplicateSuppression",
  "messagePointers",
  "injectionTelemetry",
  "softCategoryBonus",
];

function executeMemoryFlags(args: string, context: CommandContext): boolean {
  const store = useMemoryStore.getState();
  if (!store.isLoaded) {
    context.showSystemMessage("Memory system not loaded.");
    return true;
  }

  const flags = store.store.metadata.featureFlags ?? { ...DEFAULT_FEATURE_FLAGS };
  const parts = args.trim().split(/\s+/);
  const flagName = parts[0] as keyof MemoryFeatureFlags | undefined;
  const action = parts[1]?.toLowerCase();

  // Toggle a specific flag
  if (flagName && VALID_FLAG_NAMES.includes(flagName) && (action === "on" || action === "off")) {
    flags[flagName] = action === "on";
    store.store.metadata.featureFlags = flags;
    store.save();
    context.showSystemMessage(`Feature flag "${flagName}" set to ${action.toUpperCase()}.`);
    return true;
  }

  // Show current flags
  const lines = [
    "── Feature Flags ──",
    "",
    ...VALID_FLAG_NAMES.map((name) => `  ${flags[name] ? "[ON] " : "[OFF]"} ${name}`),
    "",
    "Usage: /memory flags <name> on|off",
    `Valid flags: ${VALID_FLAG_NAMES.join(", ")}`,
  ];
  context.showSystemMessage(lines.join("\n"));
  return true;
}
