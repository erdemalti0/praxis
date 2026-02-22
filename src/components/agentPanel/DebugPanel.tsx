import React, { useEffect, useRef, useState, useCallback } from "react";
import { agentEventBus } from "../../lib/eventBus";
import type { AgentEvent, AgentEventType } from "../../types/eventBus";

const MAX_EVENTS = 100;

const EVENT_COLORS: Record<AgentEventType, string> = {
  content_block: "#3b82f6",
  streaming_text: "#22c55e",
  streaming_thinking: "#a855f7",
  tool_result: "#f97316",
  message_complete: "#14b8a6",
  error: "#ef4444",
  status_change: "#9ca3af",
  session_start: "#06b6d4",
  session_end: "#78716c",
  compaction: "#eab308",
  token_warning: "#f59e0b",
  interactive_prompt: "#ec4899",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function truncate(value: unknown, maxLen: number): string {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "\u2026";
}

export const DebugPanel: React.FC = () => {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleEvent = useCallback((event: AgentEvent) => {
    setEvents((prev) => {
      const next = [...prev, event];
      if (next.length > MAX_EVENTS) {
        return next.slice(next.length - MAX_EVENTS);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const unsub = agentEventBus.subscribe("*", handleEvent);
    return unsub;
  }, [handleEvent]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events]);

  const handleClear = useCallback(() => {
    setEvents([]);
  }, []);

  return (
    <div
      style={{
        height: 200,
        backgroundColor: "#1a1a2e",
        borderTop: "1px solid #333",
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        fontSize: 10,
        color: "#d4d4d8",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "2px 8px",
          backgroundColor: "#16162a",
          borderBottom: "1px solid #333",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, letterSpacing: 0.5 }}>
          DEBUG ({events.length})
        </span>
        <button
          onClick={handleClear}
          style={{
            background: "transparent",
            border: "1px solid #555",
            color: "#aaa",
            fontSize: 9,
            padding: "1px 6px",
            cursor: "pointer",
            borderRadius: 3,
          }}
        >
          Clear
        </button>
      </div>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "2px 4px",
        }}
      >
        {events.map((evt, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 6,
              alignItems: "baseline",
              lineHeight: "16px",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "#888" }}>
              {formatTimestamp(evt.timestamp)}
            </span>
            <span
              style={{
                backgroundColor: EVENT_COLORS[evt.type] ?? "#666",
                color: "#fff",
                padding: "0 4px",
                borderRadius: 2,
                fontSize: 9,
                flexShrink: 0,
              }}
            >
              {evt.type}
            </span>
            <span style={{ color: "#a78bfa", flexShrink: 0 }}>
              {evt.agentId}
            </span>
            <span
              style={{
                color: "#71717a",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {truncate(evt.payload, 80)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DebugPanel;
