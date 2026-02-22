/**
 * Codex CLI JSONL event types.
 * Events arrive via `codex exec --json`.
 */

interface CodexThreadStarted {
  type: "thread.started";
  thread_id: string;
}

interface CodexTurnStarted {
  type: "turn.started";
}

interface CodexItemBase {
  id: string;
  type: "reasoning" | "agent_message" | "command_execution";
  text?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;
  status?: string;
}

interface CodexItemStarted {
  type: "item.started";
  item: CodexItemBase;
}

interface CodexItemCompleted {
  type: "item.completed";
  item: CodexItemBase;
}

interface CodexTurnCompleted {
  type: "turn.completed";
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
  };
}

interface CodexTurnFailed {
  type: "turn.failed";
  error?: { message?: string };
}

interface CodexErrorEvent {
  type: "error";
  message?: string;
}

export type CodexEvent =
  | CodexThreadStarted
  | CodexTurnStarted
  | CodexItemStarted
  | CodexItemCompleted
  | CodexTurnCompleted
  | CodexTurnFailed
  | CodexErrorEvent
  | { type: string; [key: string]: unknown };

export interface ParsedCodexEvent {
  kind:
    | "init"
    | "thinking"
    | "text"
    | "command_start"
    | "command_complete"
    | "result"
    | "error"
    | "unknown";
  threadId?: string;
  text?: string;
  command?: string;
  commandOutput?: string;
  exitCode?: number | null;
  itemId?: string;
  meta?: {
    tokensIn?: number;
    tokensOut?: number;
  };
  errorMessage?: string;
}

export function parseCodexEvent(raw: unknown): ParsedCodexEvent {
  const event = raw as CodexEvent;

  if (event.type === "thread.started") {
    return {
      kind: "init",
      threadId: (event as CodexThreadStarted).thread_id,
    };
  }

  if (event.type === "turn.started") {
    return { kind: "unknown" };
  }

  if (event.type === "item.started") {
    const item = (event as CodexItemStarted).item;
    if (item.type === "command_execution") {
      return {
        kind: "command_start",
        itemId: item.id,
        command: item.command || "",
      };
    }
    return { kind: "unknown" };
  }

  if (event.type === "item.completed") {
    const item = (event as CodexItemCompleted).item;

    if (item.type === "reasoning") {
      return {
        kind: "thinking",
        itemId: item.id,
        text: item.text || "",
      };
    }

    if (item.type === "agent_message") {
      return {
        kind: "text",
        itemId: item.id,
        text: item.text || "",
      };
    }

    if (item.type === "command_execution") {
      return {
        kind: "command_complete",
        itemId: item.id,
        command: item.command || "",
        commandOutput: item.aggregated_output || "",
        exitCode: item.exit_code,
      };
    }

    return { kind: "unknown" };
  }

  if (event.type === "turn.completed") {
    const usage = (event as CodexTurnCompleted).usage;
    return {
      kind: "result",
      meta: {
        tokensIn: usage?.input_tokens,
        tokensOut: usage?.output_tokens,
      },
    };
  }

  if (event.type === "turn.failed") {
    const err = (event as CodexTurnFailed).error;
    return {
      kind: "error",
      errorMessage: err?.message || "Turn failed",
    };
  }

  if (event.type === "error") {
    return {
      kind: "error",
      errorMessage: (event as CodexErrorEvent).message || "Unknown error",
    };
  }

  return { kind: "unknown" };
}
