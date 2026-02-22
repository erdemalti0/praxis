import type { ContentBlock } from "../../../types/agentPanel";

/**
 * Claude Code stream-json event types.
 * Events arrive as JSONL via `claude -p --output-format stream-json`.
 */

interface ClaudeSystemEvent {
  type: "system";
  subtype: "init" | "compact_boundary";
  session_id?: string;
  model?: string;
  tools?: string[];
}

interface ClaudeContentBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  tool_use_id?: string;
}

interface ClaudeAssistantEvent {
  type: "assistant";
  message: {
    role: "assistant";
    content: ClaudeContentBlock[];
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
}

interface ClaudeUserEvent {
  type: "user";
  message: {
    role: "user";
    content: ClaudeContentBlock[];
  };
}

interface ClaudeResultEvent {
  type: "result";
  subtype?: string;
  is_error?: boolean;
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  session_id?: string;
}

export type ClaudeEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeUserEvent
  | ClaudeResultEvent
  | { type: string; [key: string]: unknown };

export interface ParsedClaudeEvent {
  kind: "init" | "compaction" | "blocks" | "tool_result" | "user_tool_results" | "result" | "streaming_text" | "streaming_thinking" | "unknown";
  blocks?: ContentBlock[];
  text?: string;
  model?: string;
  sessionId?: string;
  meta?: {
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    durationMs?: number;
    isError?: boolean;
  };
}

function inferLanguage(filePath: string): string | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", rb: "ruby",
    css: "css", html: "html", json: "json", yaml: "yaml", yml: "yaml",
    md: "markdown", sh: "bash", sql: "sql", toml: "toml",
  };
  return ext ? map[ext] : undefined;
}

function convertContentBlock(block: ClaudeContentBlock): ContentBlock | null {
  switch (block.type) {
    case "thinking":
      return { type: "thinking", text: block.thinking || "" };

    case "text":
      return { type: "text", text: block.text || "" };

    case "tool_use": {
      const name = block.name || "";
      const input = block.input || {};

      if (name === "Edit") {
        const path = (input.file_path as string) || "";
        const oldStr = (input.old_string as string) || "";
        const newStr = (input.new_string as string) || "";
        const diff = `--- ${path}\n+++ ${path}\n${oldStr.split("\n").map((l) => `- ${l}`).join("\n")}\n${newStr.split("\n").map((l) => `+ ${l}`).join("\n")}`;
        return { type: "file_edit", path, diff, language: inferLanguage(path) };
      }

      if (name === "Write") {
        const path = (input.file_path as string) || "";
        const content = (input.content as string) || "";
        return { type: "file_write", path, content, language: inferLanguage(path) };
      }

      if (name === "Read") {
        const path = (input.file_path as string) || "";
        return { type: "file_read", path, content: "" };
      }

      if (name === "Bash") {
        const command = (input.command as string) || "";
        return { type: "bash_command", command };
      }

      return { type: "tool_use", tool: name, input, id: block.id };
    }

    case "tool_result":
      return {
        type: "tool_result",
        toolUseId: block.tool_use_id || "",
        output: (typeof block.content === "string" ? block.content : "") || "",
      };

    default:
      return null;
  }
}

export function parseClaudeEvent(raw: unknown): ParsedClaudeEvent {
  const event = raw as ClaudeEvent;

  if (event.type === "system") {
    const sys = event as ClaudeSystemEvent;
    if (sys.subtype === "compact_boundary") {
      return { kind: "compaction", sessionId: sys.session_id };
    }
    return {
      kind: "init",
      model: sys.model,
      sessionId: sys.session_id,
    };
  }

  if (event.type === "assistant") {
    const assistant = event as ClaudeAssistantEvent;
    const blocks: ContentBlock[] = [];
    for (const block of assistant.message.content) {
      const converted = convertContentBlock(block);
      if (converted) blocks.push(converted);
    }
    return {
      kind: "blocks",
      blocks,
      model: assistant.message.model,
    };
  }

  if (event.type === "user") {
    const user = event as ClaudeUserEvent;
    const blocks: ContentBlock[] = [];
    for (const block of user.message.content) {
      const converted = convertContentBlock(block);
      if (converted) blocks.push(converted);
    }
    return { kind: "user_tool_results", blocks };
  }

  // Handle streaming partial messages (--include-partial-messages)
  if (event.type === "stream_event") {
    const streamEvent = (event as any).event;
    if (!streamEvent) return { kind: "unknown" };

    // content_block_delta carries token-by-token text
    if (streamEvent.type === "content_block_delta") {
      const delta = streamEvent.delta;
      if (delta?.type === "text_delta" && delta.text) {
        return { kind: "streaming_text", text: delta.text };
      }
      if (delta?.type === "thinking_delta" && delta.thinking) {
        return { kind: "streaming_thinking", text: delta.thinking };
      }
    }
    return { kind: "unknown" };
  }

  if (event.type === "result") {
    const result = event as ClaudeResultEvent;
    return {
      kind: "result",
      sessionId: result.session_id,
      meta: {
        tokensIn: result.usage?.input_tokens,
        tokensOut: result.usage?.output_tokens,
        costUsd: result.total_cost_usd,
        durationMs: result.duration_ms,
        isError: result.is_error,
      },
    };
  }

  return { kind: "unknown" };
}
