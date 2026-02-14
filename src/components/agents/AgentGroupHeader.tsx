import { Folder } from "lucide-react";

export default function AgentGroupHeader({
  projectName,
  agentCount,
}: {
  projectName: string;
  agentCount: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        fontSize: 11,
        fontWeight: 500,
        color: "var(--vp-text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      <Folder size={13} style={{ color: "var(--vp-text-dim)" }} />
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {projectName}
      </span>
      <span style={{ color: "var(--vp-text-dim)" }}>{agentCount}</span>
    </div>
  );
}
