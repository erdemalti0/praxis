/**
 * Session finalization pipeline.
 * When a session ends, extract findings from assistant messages
 * and create a SessionMemory record for future promotion.
 */

import { extractContext } from "@/lib/contextBridge/extractor";
import type { ChatMessage, ChatAgentId } from "@/types/agentPanel";
import type { ContextCategory } from "@/types/contextBridge";
import type { SessionMemory, SessionFinding, MemoryCategory } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Map ContextCategory to MemoryCategory.
 * Context bridge has "general" which maps to "discovery".
 */
function mapCategory(contextCat: ContextCategory): MemoryCategory {
  switch (contextCat) {
    case "discovery": return "discovery";
    case "decision": return "decision";
    case "file_change": return "file_change";
    case "error": return "error";
    case "architecture": return "architecture";
    case "task_progress": return "task_progress";
    case "general": return "discovery";
    default: return "discovery";
  }
}

/**
 * Compute fingerprint for deduplication (same as memoryStore).
 */
function computeFingerprint(content: string): string {
  const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(16, "0");
}

/**
 * Deduplicate findings by fingerprint, keeping highest importance.
 */
function deduplicateByFingerprint(findings: SessionFinding[]): SessionFinding[] {
  const map = new Map<string, SessionFinding>();
  for (const f of findings) {
    const existing = map.get(f.fingerprint);
    if (!existing || f.importance > existing.importance) {
      map.set(f.fingerprint, f);
    }
  }
  return Array.from(map.values());
}

// ─── Main Finalizer ──────────────────────────────────────────────────

/**
 * Finalize a session by extracting findings from all assistant messages.
 * Creates a SessionMemory record suitable for persistence and promotion.
 *
 * @param sessionId - The session being finalized
 * @param messages - All messages in the session
 * @param agentId - The primary agent in the session
 * @returns SessionMemory with extracted and deduped findings
 */
export async function finalizeSession(
  sessionId: string,
  messages: ChatMessage[],
  agentId: ChatAgentId,
): Promise<SessionMemory> {
  const findings: SessionFinding[] = [];

  // Process assistant messages only
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  for (const msg of assistantMessages) {
    try {
      const contextEntries = await extractContext(msg.blocks, agentId, msg.id);

      for (const entry of contextEntries) {
        findings.push({
          id: crypto.randomUUID(),
          fingerprint: computeFingerprint(entry.content),
          content: entry.content.slice(0, 500),
          category: mapCategory(entry.category),
          importance: entry.relevance,
          confidence: 0.6, // rule-based extraction = lower confidence
          filePaths: entry.filePaths,
          promotedToProjectMemory: false,
        });
      }
    } catch (err) {
      console.warn(`[memory] Failed to extract context from message ${msg.id}:`, err);
    }
  }

  // Dedup findings by fingerprint
  const deduped = deduplicateByFingerprint(findings);

  // Generate summary from top findings
  const topFindings = deduped
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 3);
  const summary = topFindings.map((f) => f.content).join("; ");

  const now = Date.now();
  return {
    version: 1,
    sessionId,
    agentId,
    findings: deduped,
    summary: summary.slice(0, 500),
    createdAt: now,
    finalizedAt: now,
  };
}

/**
 * Quick finalize without async extraction (for beforeunload).
 * Uses only message text, not full extraction pipeline.
 */
export function finalizeSessionSync(
  sessionId: string,
  messages: ChatMessage[],
  agentId: ChatAgentId,
): SessionMemory {
  const findings: SessionFinding[] = [];

  const assistantMessages = messages.filter((m) => m.role === "assistant");
  for (const msg of assistantMessages) {
    // Extract text blocks only (fast path)
    for (const block of msg.blocks) {
      if (block.type === "text" && block.text.length > 20) {
        // Only keep meaningful text (skip short acknowledgments)
        const content = block.text.slice(0, 500);
        findings.push({
          id: crypto.randomUUID(),
          fingerprint: computeFingerprint(content),
          content,
          category: "discovery",
          importance: 0.3, // lower importance for raw text
          confidence: 0.3,
          promotedToProjectMemory: false,
        });
      }

      // File edits are high-signal
      if (block.type === "file_edit" || block.type === "file_write") {
        const content = `File modified: ${block.path}`;
        findings.push({
          id: crypto.randomUUID(),
          fingerprint: computeFingerprint(content),
          content,
          category: "file_change",
          importance: 0.5,
          confidence: 0.9,
          filePaths: [block.path],
          promotedToProjectMemory: false,
        });
      }

      // Errors are high-signal
      if (block.type === "error") {
        const content = `Error: ${block.message.slice(0, 200)}`;
        findings.push({
          id: crypto.randomUUID(),
          fingerprint: computeFingerprint(content),
          content,
          category: "error",
          importance: 0.6,
          confidence: 0.8,
          promotedToProjectMemory: false,
        });
      }
    }
  }

  const deduped = deduplicateByFingerprint(findings);
  const summary = deduped
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 3)
    .map((f) => f.content)
    .join("; ");

  const now = Date.now();
  return {
    version: 1,
    sessionId,
    agentId,
    findings: deduped,
    summary: summary.slice(0, 500),
    createdAt: now,
    finalizedAt: now,
  };
}
