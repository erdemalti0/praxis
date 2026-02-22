import type { ChatAgentId } from "../../types/agentPanel";
import type { ContextEntry } from "../../types/contextBridge";

/**
 * Build agent-specific context prefix for injection.
 *
 * - claude-code: XML tags format
 * - gemini: Markdown with heading + bullet list
 * - codex / opencode: System message style with "System context:" prefix
 */
export function buildContextPrefix(entries: ContextEntry[], targetAgent?: ChatAgentId): string {
  if (entries.length === 0) return "";

  const lines = entries.map((e) => `[${e.sourceAgent}] ${e.content}`);

  // Default / claude-code: XML tags
  if (!targetAgent || targetAgent === "claude-code") {
    return [
      "<context_from_other_agents>",
      "The following facts were discovered by other AI agents working on this project.",
      "Use them as background context. Do not repeat or acknowledge them explicitly.",
      "",
      ...lines,
      "</context_from_other_agents>",
      "",
    ].join("\n");
  }

  // Gemini: Markdown format
  if (targetAgent === "gemini") {
    const bullets = lines.map((l) => `- ${l}`);
    return [
      "## Context from Other Agents",
      "",
      "The following facts were discovered by other AI agents working on this project.",
      "Use them as background context. Do not repeat or acknowledge them explicitly.",
      "",
      ...bullets,
      "",
      "---",
      "",
    ].join("\n");
  }

  // Codex / OpenCode: System message style
  return [
    "System context:",
    "The following facts were discovered by other AI agents working on this project.",
    "Use them as background context. Do not repeat or acknowledge them explicitly.",
    "",
    ...lines,
    "",
  ].join("\n");
}
