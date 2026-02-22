import type { ChatAgentId, ContentBlock } from "../../types/agentPanel";
import type { ContextCategory, ContextEntry } from "../../types/contextBridge";
import type { ExtractorConfig } from "../../types/agentSession";
import type { AgentAdapter } from "../agentPanel/adapters/base";
import { createAdapter } from "../agentPanel/adapters";

const EXTRACTION_PROMPT_TEMPLATE = `You are a fact extractor. Extract 1-5 key facts from the following AI coding agent conversation output as a JSON array.
Each fact: { "category": "discovery|decision|file_change|error|architecture|task_progress|general", "content": "one-sentence fact", "relevance": 0.0-1.0, "filePaths": [] }
Return ONLY a raw JSON array — no markdown, no explanation, no preamble.

CONVERSATION OUTPUT:
`;

/** Serialize content blocks into compact text for extraction */
function blocksToCompactText(blocks: ContentBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "text":
        parts.push(block.text.slice(0, 500));
        break;
      case "file_edit":
        parts.push(`Edited file: ${block.path}`);
        break;
      case "file_write":
        parts.push(`Created file: ${block.path}`);
        break;
      case "file_read":
        parts.push(`Read file: ${block.path}`);
        break;
      case "bash_command":
        parts.push(
          `Ran command: ${block.command}${block.exitCode ? ` (exit ${block.exitCode})` : ""}${block.output ? `\nOutput: ${block.output.slice(0, 200)}` : ""}`,
        );
        break;
      case "error":
        parts.push(`Error: ${block.message}`);
        break;
      case "tool_use":
        parts.push(`Used tool: ${block.tool}`);
        break;
    }
  }

  return parts.join("\n").slice(0, 2000);
}

/** Extract JSON array from CLI output that may contain preamble text */
function parseJsonFromResponse(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export class CliExtractor {
  private adapter: AgentAdapter | null = null;
  private isProcessing = false;
  private config: ExtractorConfig;
  private cwd: string;

  constructor(cwd: string, config: ExtractorConfig) {
    this.cwd = cwd;
    this.config = config;
  }

  async init(): Promise<void> {
    this.adapter = createAdapter(this.config.agentId);
    await this.adapter.spawn(this.cwd, this.config.model);
  }

  async extract(
    blocks: ContentBlock[],
    agentId: ChatAgentId,
    messageId: string,
  ): Promise<ContextEntry[]> {
    if (!this.adapter || this.isProcessing) return [];

    const text = blocksToCompactText(blocks);
    if (text.length < 2) return [];

    this.isProcessing = true;

    try {
      const result = await new Promise<string>((resolve, reject) => {
        let accumulated = "";
        const timeout = setTimeout(() => {
          reject(new Error("CLI extraction timeout"));
        }, 30000);

        this.adapter!.onStreamingText((_msgId, fullText) => {
          accumulated = fullText;
        });

        this.adapter!.onMessageComplete(() => {
          clearTimeout(timeout);
          resolve(accumulated);
        });

        this.adapter!.onError((err) => {
          clearTimeout(timeout);
          reject(new Error(err));
        });

        const prompt = EXTRACTION_PROMPT_TEMPLATE + text;
        this.adapter!.sendMessage(prompt, this.config.model);
      });

      const facts = parseJsonFromResponse(result);
      return facts.slice(0, 5).map((f: any) => ({
        id: crypto.randomUUID(),
        sourceAgent: agentId,
        sourceMessageId: messageId,
        timestamp: Date.now(),
        category: (f.category as ContextCategory) || "general",
        content: String(f.content || "").slice(0, 300),
        relevance: Math.min(1, Math.max(0, Number(f.relevance) || 0.5)),
        filePaths: Array.isArray(f.filePaths) ? (f.filePaths as string[]) : undefined,
      }));
    } finally {
      // Clear callback references to prevent stale closure retention
      if (this.adapter) {
        this.adapter.onStreamingText(() => {});
        this.adapter.onMessageComplete(() => {});
        this.adapter.onError(() => {});
      }
      this.isProcessing = false;
    }
  }

  dispose(): void {
    if (this.adapter) {
      this.adapter.kill();
      this.adapter.dispose();
      this.adapter = null;
    }
  }
}
