import { useEffect, useRef } from "react";
import type { ChatMessage, UnifiedItem, AgentSwitchDivider, SystemEventItem } from "../../types/agentPanel";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import ChatMessageBubble from "./ChatMessageBubble";

function AgentSwitchDividerRow({ divider }: { divider: AgentSwitchDivider }) {
  const toConfig = AGENT_CONFIGS[divider.toAgent];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 16px",
        color: "var(--vp-text-dim)",
        fontSize: 11,
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--vp-border-subtle)" }} />
      <span style={{ color: toConfig.color, fontWeight: 500 }}>
        Switched to {toConfig.label}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--vp-border-subtle)" }} />
    </div>
  );
}

function SystemEventRow({ item }: { item: SystemEventItem }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 16px",
        color: "var(--vp-text-dim)",
        fontSize: 11,
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--vp-border-subtle)" }} />
      <span>{item.message}</span>
      <div style={{ flex: 1, height: 1, background: "var(--vp-border-subtle)" }} />
    </div>
  );
}

function isAgentSwitch(item: UnifiedItem): item is AgentSwitchDivider {
  return "type" in item && (item as AgentSwitchDivider).type === "agent-switch";
}

function isSystemEvent(item: UnifiedItem): item is SystemEventItem {
  return "type" in item && (item as SystemEventItem).type === "system-event";
}

interface Props {
  messages: UnifiedItem[];
}

export default function ChatMessageList({ messages }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      isAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (isAutoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--vp-text-dim)",
          fontSize: 14,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 16, marginBottom: 4 }}>Start a conversation</p>
          <p style={{ fontSize: 12 }}>Type a message below to begin</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: "auto",
        minHeight: 0,
      }}
    >
      {messages.map((item) => {
        if (isAgentSwitch(item)) {
          return <AgentSwitchDividerRow key={item.id} divider={item} />;
        }
        if (isSystemEvent(item)) {
          return <SystemEventRow key={item.id} item={item} />;
        }
        return <ChatMessageBubble key={item.id} message={item as ChatMessage} />;
      })}
    </div>
  );
}
