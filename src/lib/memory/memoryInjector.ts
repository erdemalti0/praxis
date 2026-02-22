/**
 * Memory injection formatter.
 * Formats memory entries for per-CLI injection, following the same pattern
 * as contextBridge/injector.ts but for persistent memory.
 */

import type { ChatAgentId } from "@/types/agentPanel";
import type { MemoryEntry, SearchResult, ConflictPair } from "./types";

// ─── Format Helpers ───────────────────────────────────────────────────

function formatCategory(category: string): string {
  return category.toUpperCase().replace(/_/g, " ");
}

function formatEntry(entry: MemoryEntry): string {
  return `[${formatCategory(entry.category)}] ${entry.content}`;
}

function formatConflictMarker(entryA: MemoryEntry, entryB: MemoryEntry, conflict?: ConflictPair): string {
  const base = `[CONFLICT] "${entryA.content.slice(0, 80)}" vs "${entryB.content.slice(0, 80)}"`;
  if (conflict?.conflictSetId) {
    return `${base} [set:${conflict.conflictSetId.slice(0, 8)}, severity:${conflict.severity ?? "medium"}] Verify which is current.`;
  }
  return `${base}. Verify which is current.`;
}

// ─── Main Builder ─────────────────────────────────────────────────────

/**
 * Build agent-specific memory prefix for injection.
 *
 * @param pinnedEntries - Always-inject tier (max 5, safety-critical)
 * @param retrievalResults - BM25 retrieval results (scored, filtered)
 * @param targetAgent - Which CLI to format for
 * @param conflicts - Optional conflict pairs to mark
 */
export function buildMemoryPrefix(
  pinnedEntries: MemoryEntry[],
  retrievalResults: SearchResult[],
  targetAgent: ChatAgentId,
  conflicts?: Array<{ entryA: MemoryEntry; entryB: MemoryEntry; conflict?: ConflictPair }>,
): string {
  if (pinnedEntries.length === 0 && retrievalResults.length === 0) return "";

  const pinnedLines = pinnedEntries.map(formatEntry);
  const relevantLines = retrievalResults.map((r) => formatEntry(r.entry));

  // Add conflict markers (max 1 per pair, as per design)
  const conflictLines: string[] = [];
  if (conflicts) {
    for (const c of conflicts.slice(0, 2)) { // max 2 conflict markers
      conflictLines.push(formatConflictMarker(c.entryA, c.entryB, c.conflict));
    }
  }

  const allLines = [...conflictLines, ...pinnedLines, ...relevantLines];
  if (allLines.length === 0) return "";

  return formatForAgent(pinnedLines, relevantLines, conflictLines, targetAgent);
}

// ─── Per-CLI Formatting ───────────────────────────────────────────────

function formatForAgent(
  pinned: string[],
  relevant: string[],
  conflicts: string[],
  targetAgent: ChatAgentId,
): string {
  switch (targetAgent) {
    case "claude-code":
      return formatXml(pinned, relevant, conflicts);
    case "gemini":
      return formatMarkdown(pinned, relevant, conflicts);
    case "codex":
    case "opencode":
    default:
      return formatSystemMessage(pinned, relevant, conflicts);
  }
}

function formatXml(pinned: string[], relevant: string[], conflicts: string[]): string {
  const sections: string[] = [
    "<project_memory>",
    "Long-term project knowledge. Use as background context without acknowledging explicitly.",
  ];

  if (conflicts.length > 0) {
    sections.push("", ...conflicts);
  }
  if (pinned.length > 0) {
    sections.push("<pinned>", ...pinned, "</pinned>");
  }
  if (relevant.length > 0) {
    sections.push("<relevant>", ...relevant, "</relevant>");
  }

  sections.push("</project_memory>", "");
  return sections.join("\n");
}

function formatMarkdown(pinned: string[], relevant: string[], conflicts: string[]): string {
  const sections: string[] = [
    "## Project Memory",
    "",
    "Long-term project knowledge. Use as background context without acknowledging explicitly.",
    "",
  ];

  if (conflicts.length > 0) {
    sections.push(...conflicts.map((l) => `- **${l}**`), "");
  }
  if (pinned.length > 0) {
    sections.push("### Pinned", ...pinned.map((l) => `- **${l}**`), "");
  }
  if (relevant.length > 0) {
    sections.push("### Relevant", ...relevant.map((l) => `- ${l}`), "");
  }

  sections.push("---", "");
  return sections.join("\n");
}

function formatSystemMessage(pinned: string[], relevant: string[], conflicts: string[]): string {
  const sections: string[] = [
    "[Project Memory]",
    "Long-term project knowledge. Use as background context without acknowledging explicitly.",
    "",
  ];

  if (conflicts.length > 0) {
    sections.push(...conflicts, "");
  }
  if (pinned.length > 0) {
    sections.push("[Pinned]", ...pinned, "");
  }
  if (relevant.length > 0) {
    sections.push("[Relevant]", ...relevant, "");
  }

  return sections.join("\n");
}

/**
 * Estimate total tokens for a memory prefix.
 */
export function estimatePrefixTokens(
  pinnedEntries: MemoryEntry[],
  retrievalResults: SearchResult[],
): number {
  const overhead = 30; // formatting, headers
  const pinnedTokens = pinnedEntries.reduce(
    (sum, e) => sum + Math.ceil(e.content.length / 4) + 15,
    0,
  );
  const relevantTokens = retrievalResults.reduce(
    (sum, r) => sum + Math.ceil(r.entry.content.length / 4) + 15,
    0,
  );
  return overhead + pinnedTokens + relevantTokens;
}
