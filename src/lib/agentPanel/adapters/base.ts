import type { ChatAgentId, ContentBlock } from "../../../types/agentPanel";

/**
 * Controls how agents handle permission/confirmation prompts.
 * - "auto-accept": Skip all permission checks (current default, risky)
 * - "prompt": Let the CLI prompt the user for each action (safest)
 */
export type AgentPermissionMode = "auto-accept" | "prompt";

export interface MessageMeta {
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  durationMs?: number;
}

export type LifecycleEventType = "session_start" | "session_end" | "compaction" | "token_warning";
export type LifecycleCallback = (event: { type: LifecycleEventType; sessionId: string; data?: Record<string, unknown> }) => void;

export type ContentBlockCallback = (block: ContentBlock, messageId: string) => void;
export type StreamingTextCallback = (messageId: string, fullText: string) => void;
export type StreamingThinkingCallback = (messageId: string, fullText: string) => void;
export type MessageCompleteCallback = (messageId: string, meta: MessageMeta) => void;
export type ToolResultCallback = (messageId: string, toolUseId: string, output: string, isError?: boolean) => void;
export type ErrorCallback = (error: string) => void;
export type StatusCallback = (status: "idle" | "running" | "error" | "starting" | "stopped") => void;

export interface AgentAdapter {
  readonly agentId: ChatAgentId;

  /** Spawn the agent PTY session. Returns PTY session ID and PID. */
  spawn(cwd: string, model?: string): Promise<{ ptySessionId: string; pid?: number }>;

  /** Send a user message to the running agent. Optional model override for per-message switching. */
  sendMessage(message: string, model?: string): void;

  /** Register callback for lifecycle events (compaction, session start/end, token warnings). */
  onLifecycleEvent(cb: LifecycleCallback): void;

  /** Register callback for parsed content blocks (streaming). */
  onContentBlock(cb: ContentBlockCallback): void;

  /** Register callback for streaming text deltas (token-by-token). */
  onStreamingText(cb: StreamingTextCallback): void;

  /** Register callback for streaming thinking deltas. */
  onStreamingThinking(cb: StreamingThinkingCallback): void;

  /** Register callback for message completion (with token/cost metadata). */
  onMessageComplete(cb: MessageCompleteCallback): void;

  /** Register callback for tool results (merges output into parent block). */
  onToolResult(cb: ToolResultCallback): void;

  /** Register callback for errors. */
  onError(cb: ErrorCallback): void;

  /** Register callback for status changes. */
  onStatusChange(cb: StatusCallback): void;

  /** Kill the agent process and clean up. */
  kill(): void;

  /** Get a text summary of the conversation for context transfer. */
  getConversationSummary(): string;

  /** Re-send the last message (for retry). Returns false if no message to resend. */
  resendLastMessage?(): boolean;

  /** Get the last sent message text. */
  getLastMessage?(): string | undefined;

  /** Write raw data to the active PTY stdin (for interactive prompt responses). */
  writeToPty?(data: string): void;

  /** Clean up all listeners and resources. */
  dispose(): void;
}
