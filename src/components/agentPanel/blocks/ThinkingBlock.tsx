import { useState } from "react";
import { ChevronRight, Brain } from "lucide-react";

export default function ThinkingBlock({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--vp-border-subtle)",
        background: "var(--vp-bg-surface)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "8px 12px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--vp-text-dim)",
          fontSize: 12,
        }}
      >
        <Brain size={14} />
        <span>Thinking</span>
        <ChevronRight
          size={14}
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 150ms",
            marginLeft: "auto",
          }}
        />
      </button>
      {expanded && (
        <div
          style={{
            padding: "8px 12px",
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--vp-text-dim)",
            borderTop: "1px solid var(--vp-border-subtle)",
            whiteSpace: "pre-wrap",
            maxHeight: 400,
            overflow: "auto",
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}
