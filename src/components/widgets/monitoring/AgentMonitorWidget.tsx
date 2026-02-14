import { useMemo, useState, useEffect } from "react";
import { useTerminalStore, isSessionWorking, type TerminalSession } from "../../../stores/terminalStore";
import { useUIStore } from "../../../stores/uiStore";
import { getAgentConfig } from "../../../lib/agentTypes";
import type { AgentMonitorConfig } from "../../../types/widget";
import { Bot, Terminal } from "lucide-react";

export default function AgentMonitorWidget({
  widgetId,
  config = {},
}: {
  widgetId: string;
  config?: AgentMonitorConfig;
}) {
  const sessions = useTerminalStore((s) => s.sessions);
  const outputActivity = useTerminalStore((s) => s.outputActivity);
  const workspaces = useUIStore((s) => s.workspaces);
  const [now, setNow] = useState(Date.now());

  // Tick every second to update "working" status
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const groups = useMemo(() => {
    const result: Array<{
      workspaceName: string;
      workspaceColor: string;
      sessions: TerminalSession[];
    }> = [];

    for (const ws of workspaces) {
      const wsSessions = sessions.filter((s) => s.workspaceId === ws.id);
      if (wsSessions.length === 0) continue;
      result.push({
        workspaceName: ws.name,
        workspaceColor: ws.color || "var(--vp-text-faint)",
        sessions: wsSessions,
      });
    }
    return result;
  }, [sessions, workspaces]);

  const totalCount = sessions.length;
  const workingCount = sessions.filter(
    (s) => isSessionWorking(outputActivity[s.id])
  ).length;

  if (totalCount === 0) {
    return (
      <div className="h-full flex flex-col">
        <Header total={0} working={0} />
        <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: "var(--vp-text-faint)" }}>
          <Bot size={32} />
          <p style={{ fontSize: 12 }}>No agents running</p>
          <p style={{ fontSize: 10 }}>Open a terminal to see it here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Header total={totalCount} working={workingCount} />
      <div className="flex-1 overflow-auto">
        {groups.map((group) => (
          <div key={group.workspaceName}>
            {/* Workspace header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderBottom: "1px solid var(--vp-bg-surface)",
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: 2, background: group.workspaceColor, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--vp-text-secondary)", flex: 1 }}>
                {group.workspaceName}
              </span>
              <span style={{ fontSize: 10, color: "var(--vp-text-faint)" }}>{group.sessions.length}</span>
            </div>

            {/* Session cards */}
            {group.sessions.map((session) => {
              const agentConfig = getAgentConfig(session.agentType);
              const isWorking = isSessionWorking(outputActivity[session.id]);
              const dirName = (session.projectPath || "~").split("/").filter(Boolean).pop() || "~";

              return (
                <div
                  key={session.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--vp-bg-surface)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--vp-bg-surface)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Status dot */}
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isWorking ? "var(--vp-accent-green)" : "var(--vp-text-faint)",
                      flexShrink: 0,
                      boxShadow: isWorking ? "0 0 6px var(--vp-accent-green-glow)" : "none",
                    }}
                  />

                  {/* Logo */}
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: "var(--vp-bg-surface-hover)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {agentConfig.logo ? (
                      <img
                        src={agentConfig.logo}
                        alt={agentConfig.label}
                        style={{ width: 16, height: 16, objectFit: "contain" }}
                        draggable={false}
                      />
                    ) : (
                      <Terminal size={14} style={{ color: agentConfig.color }} />
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--vp-text-primary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {agentConfig.label}
                      </span>
                      {isWorking && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 500,
                            color: "var(--vp-accent-green)",
                            letterSpacing: "0.03em",
                          }}
                        >
                          working
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--vp-text-faint)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {session.title} · {dirName}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes agentPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function Header({ total, working }: { total: number; working: number }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: "6px 10px", borderBottom: "1px solid var(--vp-bg-surface-hover)" }}
    >
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 11, color: "var(--vp-text-muted)" }}>
          {total} agent{total !== 1 ? "s" : ""}
        </span>
        {working > 0 && (
          <span
            style={{
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 3,
              background: "var(--vp-accent-green-bg-hover)",
              color: "var(--vp-accent-green)",
            }}
          >
            {working} working
          </span>
        )}
      </div>
    </div>
  );
}
