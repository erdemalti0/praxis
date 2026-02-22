/**
 * Gemini CLI stream-json event types.
 * Events arrive via `gemini -p --output-format stream-json`.
 */

interface GeminiInitEvent {
  type: "init";
  timestamp: string;
  session_id: string;
  model: string;
}

interface GeminiMessageEvent {
  type: "message";
  timestamp: string;
  role: "user" | "assistant";
  content: string;
  delta?: boolean;
}

interface GeminiToolUseEvent {
  type: "tool_use";
  timestamp: string;
  tool_name: string;
  tool_id: string;
  parameters: Record<string, unknown>;
}

interface GeminiToolResultEvent {
  type: "tool_result";
  timestamp: string;
  tool_id: string;
  status: "success" | "error";
  output: string;
}

interface GeminiResultEvent {
  type: "result";
  timestamp: string;
  status: "success" | "error";
  stats?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    cached?: number;
    input?: number;
    duration_ms?: number;
    tool_calls?: number;
  };
}

export type GeminiEvent =
  | GeminiInitEvent
  | GeminiMessageEvent
  | GeminiToolUseEvent
  | GeminiToolResultEvent
  | GeminiResultEvent
  | { type: string; [key: string]: unknown };

export interface ParsedGeminiEvent {
  kind:
    | "init"
    | "text_delta"
    | "tool_use"
    | "tool_result"
    | "result"
    | "error"
    | "unknown";
  sessionId?: string;
  model?: string;
  text?: string;
  toolName?: string;
  toolId?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolStatus?: "success" | "error";
  meta?: {
    tokensIn?: number;
    tokensOut?: number;
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

export { inferLanguage };

export function parseGeminiEvent(raw: unknown): ParsedGeminiEvent {
  const event = raw as GeminiEvent;

  if (event.type === "init") {
    const init = event as GeminiInitEvent;
    return {
      kind: "init",
      sessionId: init.session_id,
      model: init.model,
    };
  }

  if (event.type === "message") {
    const msg = event as GeminiMessageEvent;
    if (msg.role === "assistant") {
      return {
        kind: "text_delta",
        text: msg.content,
      };
    }
    // User messages are echoed back — ignore
    return { kind: "unknown" };
  }

  if (event.type === "tool_use") {
    const tool = event as GeminiToolUseEvent;
    return {
      kind: "tool_use",
      toolName: tool.tool_name,
      toolId: tool.tool_id,
      toolInput: tool.parameters,
    };
  }

  if (event.type === "tool_result") {
    const result = event as GeminiToolResultEvent;
    return {
      kind: "tool_result",
      toolId: result.tool_id,
      toolOutput: result.output,
      toolStatus: result.status,
    };
  }

  if (event.type === "result") {
    const result = event as GeminiResultEvent;
    return {
      kind: "result",
      meta: {
        tokensIn: result.stats?.input_tokens,
        tokensOut: result.stats?.output_tokens,
        durationMs: result.stats?.duration_ms,
        isError: result.status === "error",
      },
    };
  }

  return { kind: "unknown" };
}
