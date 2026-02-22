import type { ContentBlock } from "../../../types/agentPanel";

/**
 * OpenCode CLI JSONL event types.
 * Events arrive via `opencode run --format json`.
 */

interface OpenCodePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  reason?: string;
  cost?: number;
  tokens?: {
    total?: number;
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
  time?: { start?: number; end?: number };
  // Tool-specific fields
  tool?: string;
  callID?: string;
  state?: {
    status?: string;
    input?: Record<string, unknown>;
    output?: string;
    title?: string;
    metadata?: {
      output?: string;
      exit?: number;
      description?: string;
      truncated?: boolean;
      // File tool metadata
      path?: string;
      content?: string;
      old_string?: string;
      new_string?: string;
    };
    time?: { start?: number; end?: number };
  };
}

interface OpenCodeEvent {
  type: string;
  timestamp: number;
  sessionID: string;
  part: OpenCodePart;
}

export interface ParsedOpenCodeEvent {
  kind:
    | "init"
    | "thinking"
    | "text"
    | "tool_use"
    | "result"
    | "error"
    | "unknown";
  sessionId?: string;
  text?: string;
  block?: ContentBlock;
  meta?: {
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
    durationMs?: number;
    reason?: string;
  };
  errorMessage?: string;
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

function convertToolEvent(part: OpenCodePart): ContentBlock | null {
  const tool = part.tool || part.state?.input?.tool as string || "";
  const state = part.state;
  if (!state) return null;

  const input = state.input || {};
  const meta = state.metadata || {};

  // Bash / shell tool
  if (tool === "bash" || tool === "shell") {
    const command = (input.command as string) || (input.cmd as string) || "";
    const output = meta.output || state.output || "";
    const exitCode = meta.exit ?? undefined;
    return { type: "bash_command", command, output, exitCode };
  }

  // File read tool
  if (tool === "file_read" || tool === "read") {
    const path = (input.path as string) || meta.path || "";
    const content = meta.content || state.output || "";
    return { type: "file_read", path, content };
  }

  // File write tool
  if (tool === "file_write" || tool === "write") {
    const path = (input.path as string) || meta.path || "";
    const content = (input.content as string) || meta.content || "";
    return { type: "file_write", path, content, language: inferLanguage(path) };
  }

  // File edit / patch tool
  if (tool === "file_edit" || tool === "edit" || tool === "patch") {
    const path = (input.path as string) || (input.file_path as string) || meta.path || "";
    const oldStr = (input.old_string as string) || meta.old_string || "";
    const newStr = (input.new_string as string) || meta.new_string || "";
    if (oldStr || newStr) {
      const diff = `--- ${path}\n+++ ${path}\n${oldStr.split("\n").map((l) => `- ${l}`).join("\n")}\n${newStr.split("\n").map((l) => `+ ${l}`).join("\n")}`;
      return { type: "file_edit", path, diff, language: inferLanguage(path) };
    }
    // Fallback to generic tool_use if no diff data
    return { type: "tool_use", tool, input, id: part.callID };
  }

  // Generic tool use fallback
  return {
    type: "tool_use",
    tool: state.title || tool || "unknown",
    input,
    id: part.callID,
  };
}

export function parseOpenCodeEvent(raw: unknown): ParsedOpenCodeEvent {
  const event = raw as OpenCodeEvent;
  if (!event || !event.type) return { kind: "unknown" };

  const sessionId = event.sessionID;

  switch (event.type) {
    case "step_start":
      return { kind: "init", sessionId };

    case "reasoning":
      return {
        kind: "thinking",
        sessionId,
        text: event.part?.text || "",
      };

    case "text":
      return {
        kind: "text",
        sessionId,
        text: event.part?.text || "",
      };

    case "tool_use": {
      const block = convertToolEvent(event.part);
      if (!block) return { kind: "unknown" };
      return { kind: "tool_use", sessionId, block };
    }

    case "step_finish": {
      const part = event.part;
      const tokens = part?.tokens;
      const startTime = part?.time?.start;
      const endTime = part?.time?.end ?? event.timestamp;
      const durationMs = startTime && endTime ? endTime - startTime : undefined;
      return {
        kind: "result",
        sessionId,
        meta: {
          tokensIn: tokens?.input,
          tokensOut: tokens?.output,
          costUsd: part?.cost,
          durationMs,
          reason: part?.reason,
        },
      };
    }

    case "error":
      return {
        kind: "error",
        sessionId,
        errorMessage: event.part?.text || "Unknown error",
      };

    default:
      return { kind: "unknown" };
  }
}
