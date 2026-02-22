import type { ChatAgentId, ContentBlock, AgentSessionStatus } from "./agentPanel";
import type { MessageMeta } from "../lib/agentPanel/adapters/base";

export type AgentEventType =
  | "content_block"
  | "streaming_text"
  | "streaming_thinking"
  | "tool_result"
  | "message_complete"
  | "status_change"
  | "error"
  | "session_start"
  | "session_end"
  | "compaction"
  | "token_warning"
  | "interactive_prompt";

export interface AgentEventMap {
  content_block: { block: ContentBlock; messageId: string };
  streaming_text: { messageId: string; fullText: string };
  streaming_thinking: { messageId: string; fullText: string };
  tool_result: { messageId: string; toolUseId: string; output: string; isError?: boolean };
  message_complete: { messageId: string; meta: MessageMeta };
  status_change: { status: AgentSessionStatus };
  error: { error: string };
  session_start: { sessionId: string; model?: string };
  session_end: { sessionId: string; reason: "user" | "error" | "budget" };
  compaction: { sessionId: string };
  token_warning: { sessionId: string; currentTokens: number; maxTokens: number; percentUsed: number };
  interactive_prompt: { promptId: string; rawText: string; responseType: "yes_no" | "choice" | "freeform" };
}

export interface AgentEvent<T extends AgentEventType = AgentEventType> {
  type: T;
  agentId: ChatAgentId;
  timestamp: number;
  payload: AgentEventMap[T];
}

export type EventSubscriber = (event: AgentEvent) => void;

export interface EventBus {
  /** Emit an event to all matching subscribers */
  emit<T extends AgentEventType>(event: AgentEvent<T>): void;
  /** Subscribe to a specific event type or "*" for all events. Returns unsubscribe function. */
  subscribe(type: AgentEventType | "*", handler: EventSubscriber): () => void;
  /** Get last N events from ring buffer (for debug panel / replay) */
  getHistory(limit?: number): AgentEvent[];
  /** Clear all history and subscribers */
  clear(): void;
}
