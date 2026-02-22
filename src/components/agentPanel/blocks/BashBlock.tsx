import { useState } from "react";
import { Terminal, ChevronRight, Check, X, Copy } from "lucide-react";

interface Props {
  command: string;
  output?: string;
  exitCode?: number;
}

export default function BashBlock({ command, output, exitCode }: Props) {
  const [expanded, setExpanded] = useState(!!output && output.length < 500);
  const [copied, setCopied] = useState(false);

  const isError = exitCode !== undefined && exitCode !== 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${isError ? "var(--vp-accent-red-border, #ef4444)" : "var(--vp-border-subtle)"}`,
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
        <Terminal size={14} />
        <code style={{ flex: 1, color: "var(--vp-text-primary)", fontFamily: "var(--vp-font-mono, monospace)" }}>
          $ {command}
        </code>
        <button
          onClick={handleCopy}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--vp-text-dim)", padding: 2 }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
        {exitCode !== undefined && (
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {isError ? <X size={12} color="#ef4444" /> : <Check size={12} color="#22c55e" />}
            <span style={{ color: isError ? "#ef4444" : "#22c55e" }}>
              {exitCode}
            </span>
          </span>
        )}
      </div>
      {output && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              width: "100%",
              padding: "4px 12px",
              background: "none",
              border: "none",
              borderTop: "1px solid var(--vp-border-subtle)",
              cursor: "pointer",
              color: "var(--vp-text-dim)",
              fontSize: 11,
            }}
          >
            <ChevronRight
              size={12}
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 150ms" }}
            />
            Output ({output.split("\n").length} lines)
          </button>
          {expanded && (
            <pre
              style={{
                padding: "8px 12px",
                fontSize: 11,
                lineHeight: 1.4,
                color: "var(--vp-text-secondary)",
                borderTop: "1px solid var(--vp-border-subtle)",
                margin: 0,
                overflow: "auto",
                maxHeight: 300,
                fontFamily: "var(--vp-font-mono, monospace)",
              }}
            >
              {output}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
