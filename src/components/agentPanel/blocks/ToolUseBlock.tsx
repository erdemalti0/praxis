import { Wrench } from "lucide-react";

interface Props {
  tool: string;
  input: Record<string, unknown>;
}

export default function ToolUseBlock({ tool, input }: Props) {
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid var(--vp-border-subtle)",
        background: "var(--vp-bg-surface)",
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--vp-text-dim)", marginBottom: 4 }}>
        <Wrench size={14} />
        <span style={{ fontWeight: 500 }}>{tool}</span>
      </div>
      <pre
        style={{
          fontSize: 11,
          color: "var(--vp-text-secondary)",
          margin: 0,
          overflow: "auto",
          maxHeight: 200,
          fontFamily: "var(--vp-font-mono, monospace)",
        }}
      >
        {JSON.stringify(input, null, 2)}
      </pre>
    </div>
  );
}
