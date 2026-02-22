import type { ChatAgentId, ContentBlock } from "../../types/agentPanel";
import type { ContextEntry } from "../../types/contextBridge";
import type { ExtractorConfig } from "../../types/agentSession";
import { CliExtractor } from "./cliExtractor";

/** Active CLI extractor instance (one per session) */
let activeCliExtractor: CliExtractor | null = null;

/** Initialize a CLI extractor for the current session */
export async function initCliExtractor(cwd: string, config: ExtractorConfig): Promise<void> {
  // Dispose any existing extractor first
  disposeCliExtractor();
  activeCliExtractor = new CliExtractor(cwd, config);
  await activeCliExtractor.init();
}

/** Dispose the active CLI extractor */
export function disposeCliExtractor(): void {
  if (activeCliExtractor) {
    activeCliExtractor.dispose();
    activeCliExtractor = null;
  }
}

/** Rule-based extraction — always works, no API calls */
function extractViaRules(
  blocks: ContentBlock[],
  agentId: ChatAgentId,
  messageId: string,
): ContextEntry[] {
  const entries: ContextEntry[] = [];

  for (const block of blocks) {
    if (block.type === "file_edit") {
      entries.push({
        id: crypto.randomUUID(),
        sourceAgent: agentId,
        sourceMessageId: messageId,
        timestamp: Date.now(),
        category: "file_change",
        content: `Edited file: ${block.path}`,
        relevance: 0.8,
        filePaths: [block.path],
      });
    } else if (block.type === "file_write") {
      entries.push({
        id: crypto.randomUUID(),
        sourceAgent: agentId,
        sourceMessageId: messageId,
        timestamp: Date.now(),
        category: "file_change",
        content: `Created file: ${block.path}`,
        relevance: 0.8,
        filePaths: [block.path],
      });
    } else if (block.type === "bash_command") {
      if (block.exitCode && block.exitCode !== 0) {
        entries.push({
          id: crypto.randomUUID(),
          sourceAgent: agentId,
          sourceMessageId: messageId,
          timestamp: Date.now(),
          category: "error",
          content: `Command failed (exit ${block.exitCode}): ${block.command.slice(0, 100)}`,
          relevance: 0.7,
        });
      } else if (block.output) {
        entries.push({
          id: crypto.randomUUID(),
          sourceAgent: agentId,
          sourceMessageId: messageId,
          timestamp: Date.now(),
          category: "discovery",
          content: `Ran: ${block.command.slice(0, 80)}${block.output ? ` → ${block.output.slice(0, 120)}` : ""}`,
          relevance: 0.5,
        });
      }
    } else if (block.type === "file_read") {
      entries.push({
        id: crypto.randomUUID(),
        sourceAgent: agentId,
        sourceMessageId: messageId,
        timestamp: Date.now(),
        category: "discovery",
        content: `Read file: ${block.path}`,
        relevance: 0.6,
        filePaths: [block.path],
      });
    } else if (block.type === "error") {
      entries.push({
        id: crypto.randomUUID(),
        sourceAgent: agentId,
        sourceMessageId: messageId,
        timestamp: Date.now(),
        category: "error",
        content: `Error: ${block.message.slice(0, 200)}`,
        relevance: 0.9,
      });
    }
  }

  // Extract text content — combine Q&A pairs when "User asked:" prefix is present
  const textBlocks = blocks.filter((b): b is ContentBlock & { type: "text" } => b.type === "text");
  const userQuestion = textBlocks.find((b) => b.text.startsWith("User asked:"));
  const answerBlocks = textBlocks.filter((b) => !b.text.startsWith("User asked:"));

  const allAnswerText = answerBlocks.map((b) => b.text.trim()).filter(Boolean).join(" ").trim();

  if (userQuestion && allAnswerText) {
    const question = userQuestion.text.replace("User asked: ", "").trim();
    const content = `Q: ${question.slice(0, 100)} → A: ${allAnswerText.slice(0, 200)}`;
    entries.push({
      id: crypto.randomUUID(),
      sourceAgent: agentId,
      sourceMessageId: messageId,
      timestamp: Date.now(),
      category: "general",
      content,
      relevance: 0.7,
    });
  } else if (allAnswerText) {
    const content = allAnswerText.length <= 300
      ? allAnswerText
      : (allAnswerText.split(/[.!?\n]/)[0]?.trim() || allAnswerText).slice(0, 300);
    entries.push({
      id: crypto.randomUUID(),
      sourceAgent: agentId,
      sourceMessageId: messageId,
      timestamp: Date.now(),
      category: "general",
      content,
      relevance: allAnswerText.length > 20 ? 0.5 : 0.6,
    });
  } else if (userQuestion) {
    const text = userQuestion.text.replace("User asked: ", "").trim();
    if (text.length > 0) {
      entries.push({
        id: crypto.randomUUID(),
        sourceAgent: agentId,
        sourceMessageId: messageId,
        timestamp: Date.now(),
        category: "general",
        content: text.slice(0, 200),
        relevance: 0.4,
      });
    }
  }

  return entries.slice(0, 8);
}

/** Main extraction function — tries CLI extractor first, falls back to rules */
export async function extractContext(
  blocks: ContentBlock[],
  agentId: ChatAgentId,
  messageId: string,
): Promise<ContextEntry[]> {
  if (blocks.length === 0) return [];

  // 1. CLI extractor (if active)
  if (activeCliExtractor) {
    try {
      const entries = await activeCliExtractor.extract(blocks, agentId, messageId);
      if (entries.length > 0) return entries;
    } catch {
      // CLI extraction failed — fall through to rule-based
    }
  }

  // 2. Rule-based fallback
  return extractViaRules(blocks, agentId, messageId);
}
