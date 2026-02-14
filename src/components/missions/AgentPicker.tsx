import { useState, useEffect } from "react";
import { useTerminalStore, isSessionWorking } from "../../stores/terminalStore";
import { useUIStore } from "../../stores/uiStore";
import { getSessionIds } from "../../lib/layout/layoutUtils";
import { getAgentConfig } from "../../lib/agentTypes";
import { Terminal } from "lucide-react";

interface AgentPickerProps {
  onSelect: (sessionId: string, workspaceId: string) => void;
}

export default function AgentPicker({ onSelect }: AgentPickerProps) {
  const sessions = useTerminalStore((s) => s.sessions);
  const outputActivity = useTerminalStore((s) => s.outputActivity);
  const workspaces = useUIStore((s) => s.workspaces);
  const terminalGroups = useUIStore((s) => s.terminalGroups);
  const workspaceLayouts = useUIStore((s) => s.workspaceLayouts);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sessionGroupLabel: Record<string, string> = {};
  for (const ws of workspaces) {
    const groupIds = terminalGroups[ws.id] || [];
    for (let i = 0; i < groupIds.length; i++) {
      const layout = workspaceLayouts[groupIds[i]];
      if (!layout) continue;
      for (const sid of getSessionIds(layout)) {
        sessionGroupLabel[sid] = `Terminal ${i + 1}`;
      }
    }
  }

  const grouped = workspaces
    .map((ws) => ({
      workspace: ws,
      sessions: sessions.filter(
        (s) => s.workspaceId === ws.id && s.agentType && s.agentType !== "shell" && s.agentType !== "unknown"
      ),
    }))
    .filter((g) => g.sessions.length > 0);

  if (grouped.length === 0) {
    return (
      <div
        style={{
          width: 260, background: "var(--vp-bg-tertiary)", border: "1px solid var(--vp-border-medium)",
          borderRadius: 10, padding: "10px 0",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ padding: "8px 14px", color: "var(--vp-text-dim)", fontSize: 11, textAlign: "center" }}>
          No agents available
        </div>
      </div>
    );
  }

  const allAgentSessions = grouped.flatMap((g) => g.sessions);
  const typeCounts: Record<string, number> = {};
  const typeIndex: Record<string, number> = {};
  for (const s of allAgentSessions) {
    typeCounts[s.agentType || "unknown"] = (typeCounts[s.agentType || "unknown"] || 0) + 1;
  }

  return (
    <div
      style={{
        width: 260, background: "var(--vp-bg-tertiary)", border: "1px solid var(--vp-border-medium)",
        borderRadius: 10, padding: "6px 0",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        animation: "pickerFadeIn 0.15s ease",
      }}
    >
      <div style={{ padding: "4px 12px 8px", fontSize: 10, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Select Agent
      </div>
      {grouped.map((group) => (
        <div key={group.workspace.id}>
          <div style={{ padding: "4px 12px", fontSize: 10, fontWeight: 500, color: "var(--vp-text-faint)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: group.workspace.color, flexShrink: 0 }} />
            {group.workspace.name}
          </div>
          {group.sessions.map((session) => {
            const config = getAgentConfig(session.agentType);
            const isWorking = isSessionWorking(outputActivity[session.id]);
            const groupLabel = sessionGroupLabel[session.id] || "";
            const t = session.agentType || "unknown";
            if (!typeIndex[t]) typeIndex[t] = 0;
            typeIndex[t]++;
            const idx = (typeCounts[t] || 0) > 1 ? typeIndex[t] : undefined;
            return (
              <button
                key={session.id}
                onClick={(e) => { e.stopPropagation(); onSelect(session.id, session.workspaceId); }}
                disabled={isWorking}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 12px", background: "transparent", border: "none",
                  cursor: isWorking ? "not-allowed" : "pointer", opacity: isWorking ? 0.4 : 1,
                  transition: "background 0.15s", textAlign: "left",
                }}
                title={isWorking ? "Agent is working" : `Send to ${config.label}`}
                onMouseEnter={(e) => { if (!isWorking) e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: isWorking ? "var(--vp-accent-green)" : "var(--vp-text-faint)", flexShrink: 0,
                  boxShadow: isWorking ? "0 0 6px rgba(74,222,128,0.5)" : "none",
                  animation: isWorking ? "agentPulse 1.5s ease-in-out infinite" : "none",
                }} />
                <div style={{
                  width: 22, height: 22, borderRadius: 5,
                  background: "var(--vp-bg-surface-hover)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {config.logo ? (
                    <img src={config.logo} alt={config.label} style={{ width: 14, height: 14, objectFit: "contain" }} draggable={false} />
                  ) : (
                    <Terminal size={12} style={{ color: config.color }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: isWorking ? "var(--vp-text-dim)" : "var(--vp-text-secondary)", lineHeight: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {config.label}
                    {idx !== undefined && <span style={{ color: "var(--vp-text-faint)", fontWeight: 400, marginLeft: 3 }}>#{idx}</span>}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--vp-text-faint)", lineHeight: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {groupLabel}{groupLabel && " · "}{(session.projectPath || "~").split("/").filter(Boolean).pop() || "~"}
                  </div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 500, color: isWorking ? "var(--vp-accent-green)" : "var(--vp-text-faint)", flexShrink: 0 }}>
                  {isWorking ? "working" : "idle"}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      <style>{`
        @keyframes pickerFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes agentPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
