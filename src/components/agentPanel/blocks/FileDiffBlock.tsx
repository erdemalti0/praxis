import { useState } from "react";
import { FileEdit, ChevronRight, Copy, Check } from "lucide-react";

interface Props {
  path: string;
  diff: string;
  language?: string;
}

export default function FileDiffBlock({ path, diff }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(diff);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const lines = diff.split("\n");

  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--vp-border-subtle)",
        background: "var(--vp-bg-surface)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          fontSize: 12,
          color: "var(--vp-text-dim)",
        }}
      >
        <FileEdit size={14} color="#f59e0b" />
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flex: 1,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--vp-text-primary)",
            fontSize: 12,
            padding: 0,
            fontFamily: "var(--vp-font-mono, monospace)",
          }}
        >
          <ChevronRight
            size={12}
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms" }}
          />
          {path}
        </button>
        <button
          onClick={handleCopy}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--vp-text-dim)", padding: 2 }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      {expanded && (
        <pre
          style={{
            padding: "8px 0",
            fontSize: 12,
            lineHeight: 1.5,
            margin: 0,
            overflow: "auto",
            maxHeight: 400,
            borderTop: "1px solid var(--vp-border-subtle)",
            fontFamily: "var(--vp-font-mono, monospace)",
          }}
        >
          {lines.map((line, i) => {
            let bg = "transparent";
            let color = "var(--vp-text-secondary)";
            if (line.startsWith("+") && !line.startsWith("+++")) {
              bg = "rgba(34, 197, 94, 0.1)";
              color = "#22c55e";
            } else if (line.startsWith("-") && !line.startsWith("---")) {
              bg = "rgba(239, 68, 68, 0.1)";
              color = "#ef4444";
            } else if (line.startsWith("@@")) {
              color = "#3b82f6";
            }
            return (
              <div
                key={i}
                style={{ padding: "0 12px", background: bg, color, minHeight: 20 }}
              >
                {line || " "}
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
}
