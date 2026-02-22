import type { AgentAdapter } from "./adapters/base";
import type { ChatAgentId, ContentBlock, SystemEventItem } from "../../types/agentPanel";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import type { AgentEvent, AgentEventType } from "../../types/eventBus";
import { agentEventBus } from "../eventBus";
import { useAgentPanelStore } from "../../stores/agentPanelStore";
import { RetryManager } from "./retryManager";

/** Singleton retry manager wired to the global event bus. */
export const retryManager = new RetryManager(agentEventBus);

/**
 * Wire an adapter's callbacks to emit events through the EventBus.
 * Call this once per adapter after creation.
 *
 * @param adapter  The agent adapter instance
 * @param agentId  The agent identifier
 * @param getMessageId  Function to resolve current streaming message ID for this agent
 */
export function wireAdapterToEventBus(
  adapter: AgentAdapter,
  agentId: ChatAgentId,
  getMessageId: () => string | undefined,
): void {
  adapter.onContentBlock((block: ContentBlock, _messageId: string) => {
    const msgId = getMessageId();
    if (!msgId) { console.warn(`[AdapterBridge] Dropped content_block for ${agentId}: no active messageId`); return; }
    agentEventBus.emit({
      type: "content_block",
      agentId,
      timestamp: Date.now(),
      payload: { block, messageId: msgId },
    });
  });

  adapter.onStreamingText((_messageId: string, fullText: string) => {
    const msgId = getMessageId();
    if (!msgId) { console.warn(`[AdapterBridge] Dropped streaming_text for ${agentId}: no active messageId`); return; }
    agentEventBus.emit({
      type: "streaming_text",
      agentId,
      timestamp: Date.now(),
      payload: { messageId: msgId, fullText },
    });
  });

  adapter.onStreamingThinking((_messageId: string, fullText: string) => {
    const msgId = getMessageId();
    if (!msgId) { console.warn(`[AdapterBridge] Dropped streaming_thinking for ${agentId}: no active messageId`); return; }
    agentEventBus.emit({
      type: "streaming_thinking",
      agentId,
      timestamp: Date.now(),
      payload: { messageId: msgId, fullText },
    });
  });

  adapter.onToolResult((_messageId: string, toolUseId: string, output: string, isError?: boolean) => {
    const msgId = getMessageId();
    if (!msgId) { console.warn(`[AdapterBridge] Dropped tool_result for ${agentId}: no active messageId`); return; }
    agentEventBus.emit({
      type: "tool_result",
      agentId,
      timestamp: Date.now(),
      payload: { messageId: msgId, toolUseId, output, isError },
    });
  });

  adapter.onMessageComplete((_messageId: string, meta) => {
    const msgId = getMessageId();
    if (!msgId) { console.warn(`[AdapterBridge] Dropped message_complete for ${agentId}: no active messageId`); return; }
    agentEventBus.emit({
      type: "message_complete",
      agentId,
      timestamp: Date.now(),
      payload: { messageId: msgId, meta },
    });
  });

  adapter.onError((error: string) => {
    agentEventBus.emit({
      type: "error",
      agentId,
      timestamp: Date.now(),
      payload: { error },
    });
  });

  adapter.onStatusChange((status) => {
    agentEventBus.emit({
      type: "status_change",
      agentId,
      timestamp: Date.now(),
      payload: { status },
    });
  });

  // Wire lifecycle events to the event bus
  adapter.onLifecycleEvent((event) => {
    agentEventBus.emit({
      type: event.type as AgentEventType,
      agentId,
      timestamp: Date.now(),
      payload: { sessionId: event.sessionId, ...event.data },
    });
  });

  // Attach retry manager to this adapter
  retryManager.attachToAdapter(adapter, agentId, getMessageId);
}

/**
 * Wire EventBus events to the agentPanelStore actions.
 * Call once on mount. Returns an unsubscribe function.
 *
 * @param getMessageId  Function to get and clear the streaming message ID for a given agent
 * @param onMessageComplete  Optional callback fired after message finalization (e.g. for context extraction)
 */
export function wireEventBusToStore(
  getMessageId: (agentId: ChatAgentId) => string | undefined,
  clearMessageId: (agentId: ChatAgentId) => void,
  onMessageComplete?: (agentId: ChatAgentId, messageId: string) => void,
): () => void {
  const store = useAgentPanelStore.getState;
  const unsubs: Array<() => void> = [];

  unsubs.push(
    agentEventBus.subscribe("content_block", (event: AgentEvent) => {
      const { block, messageId } = event.payload as { block: ContentBlock; messageId: string };
      store().appendBlock(event.agentId, messageId, block);
    }),
  );

  unsubs.push(
    agentEventBus.subscribe("streaming_text", (event: AgentEvent) => {
      const { messageId, fullText } = event.payload as { messageId: string; fullText: string };
      store().updateStreamingBlock(event.agentId, messageId, { type: "text", text: fullText });
    }),
  );

  unsubs.push(
    agentEventBus.subscribe("streaming_thinking", (event: AgentEvent) => {
      const { messageId, fullText } = event.payload as { messageId: string; fullText: string };
      store().updateStreamingBlock(event.agentId, messageId, { type: "thinking", text: fullText });
    }),
  );

  unsubs.push(
    agentEventBus.subscribe("tool_result", (event: AgentEvent) => {
      const { messageId, toolUseId, output, isError } = event.payload as {
        messageId: string;
        toolUseId: string;
        output: string;
        isError?: boolean;
      };
      store().mergeToolResult(event.agentId, messageId, toolUseId, output, isError);
    }),
  );

  unsubs.push(
    agentEventBus.subscribe("message_complete", (event: AgentEvent) => {
      const { messageId, meta } = event.payload as { messageId: string; meta: Record<string, unknown> };
      store().finalizeMessage(event.agentId, messageId, meta);
      clearMessageId(event.agentId);
      onMessageComplete?.(event.agentId, messageId);
    }),
  );

  unsubs.push(
    agentEventBus.subscribe("error", (event: AgentEvent) => {
      const { error } = event.payload as { error: string };
      const msgId = getMessageId(event.agentId);
      if (msgId) {
        store().appendBlock(event.agentId, msgId, { type: "error", message: error });
      }
    }),
  );

  unsubs.push(
    agentEventBus.subscribe("status_change", (event: AgentEvent) => {
      const { status } = event.payload as { status: string };
      store().updateSessionStatus(event.agentId, status as "idle" | "running" | "error" | "starting" | "stopped");
    }),
  );

  // Wire compaction lifecycle events to unified message list as system banners
  unsubs.push(
    agentEventBus.subscribe("compaction", (event: AgentEvent) => {
      const label = AGENT_CONFIGS[event.agentId]?.label ?? event.agentId;
      store().addUnifiedMessage({
        id: crypto.randomUUID(),
        type: "system-event",
        eventType: "compaction",
        agentId: event.agentId,
        timestamp: event.timestamp,
        message: `Context compacted for ${label}`,
      } as SystemEventItem);
    }),
  );

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
