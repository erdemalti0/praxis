import { FileText } from "lucide-react";
import { useState } from "react";
import { ChevronRight } from "lucide-react";

interface Props {
  path: string;
  content: string;
  lineCount?: number;
}

export default function FileReadBlock({ path, content }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = content.length > 0;
  const lines = content.split("\n");

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
        onClick={() => hasContent && setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "8px 12px",
          background: "none",
          border: "none",
          cursor: hasContent ? "pointer" : "default",
          color: "var(--vp-text-dim)",
          fontSize: 12,
        }}
      >
        <FileText size={14} color="#3b82f6" />
        <span style={{ fontFamily: "var(--vp-font-mono, monospace)", color: "var(--vp-text-primary)" }}>{path}</span>
        {hasContent && (
          <>
            <span style={{ marginLeft: "auto", fontSize: 11 }}>{lines.length} lines</span>
            <ChevronRight
              size={12}
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms" }}
            />
          </>
        )}
      </button>
      {expanded && hasContent && (
        <pre
          style={{
            padding: "8px 12px",
            fontSize: 11,
            lineHeight: 1.4,
            margin: 0,
            overflow: "auto",
            maxHeight: 300,
            borderTop: "1px solid var(--vp-border-subtle)",
            fontFamily: "var(--vp-font-mono, monospace)",
            color: "var(--vp-text-secondary)",
          }}
        >
          {content}
        </pre>
      )}
    </div>
  );
}
