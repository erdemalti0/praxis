import { MessageSquare, Bot, User } from "lucide-react";
import type { HistoryEntry } from "../../types/session";
import { getBaseName } from "../../lib/pathUtils";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "\u2026";
}

const typeIcons = {
  human: User,
  assistant: Bot,
  system: MessageSquare,
};

export default function TimelineEntry({ entry }: { entry: HistoryEntry }) {
  const Icon = typeIcons[entry.type] || MessageSquare;
  const projectName = entry.project ? getBaseName(entry.project) : "unknown";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "6px 10px",
        borderRadius: "var(--vp-radius-xl)",
        fontSize: 12,
        transition: "background 0.2s ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--vp-bg-surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ color: "var(--vp-text-dim)", flexShrink: 0, width: 36, textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
        {formatTime(entry.timestamp)}
      </span>
      <Icon size={13} style={{ flexShrink: 0, marginTop: 1, color: "var(--vp-text-faint)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: "var(--vp-text-secondary)" }}>{projectName}</span>
        {entry.display && (
          <span style={{ color: "var(--vp-text-muted)", marginLeft: 4 }}>
            {truncate(entry.display, 80)}
          </span>
        )}
      </div>
    </div>
  );
}
