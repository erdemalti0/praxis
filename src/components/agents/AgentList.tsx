import { useMemo } from "react";
import { useTerminalStore } from "../../stores/terminalStore";
import { useUIStore, type Workspace } from "../../stores/uiStore";
import AgentCard from "./AgentCard";
import { Bot, Layout, Plus } from "lucide-react";
import type { Agent } from "../../types/agent";
import { getSessionIds } from "../../lib/layout/layoutUtils";

interface WorkspaceGroup {
  workspace: Workspace;
  agents: Agent[];
}

export default function AgentList() {
  const sessions = useTerminalStore((s) => s.sessions);
  const workspaces = useUIStore((s) => s.workspaces);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const terminalGroups = useUIStore((s) => s.terminalGroups);
  const workspaceLayouts = useUIStore((s) => s.workspaceLayouts);

  const groups: WorkspaceGroup[] = useMemo(() => {
    const result: WorkspaceGroup[] = [];
    for (const ws of workspaces) {
      const wsSessions = sessions.filter((s) => s.workspaceId === ws.id && s.agentType !== "runner" && !s.id.startsWith("runner-"));
      if (wsSessions.length === 0) continue;

      const agents: Agent[] = wsSessions.map((session) => ({
        id: session.id,
        pid: 0,
        type: "unknown" as const,
        status: "active" as const,
        projectPath: session.projectPath || "~",
        projectName: (session.projectPath || "~").split("/").filter(Boolean).pop() || "~",
        sessionId: session.id,
        cwd: session.projectPath || "~",
      }));

      result.push({ workspace: ws, agents });
    }
    return result;
  }, [sessions, workspaces]);

  // Build a map: sessionId -> "Terminal N"
  const sessionGroupLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const ws of workspaces) {
      const groupIds = terminalGroups[ws.id] || [];
      for (let i = 0; i < groupIds.length; i++) {
        const gid = groupIds[i];
        const layout = workspaceLayouts[gid];
        if (!layout) continue;
        const ids = getSessionIds(layout);
        for (const sid of ids) {
          map[sid] = `Terminal ${i + 1}`;
        }
      }
    }
    return map;
  }, [workspaces, terminalGroups, workspaceLayouts]);

  if (groups.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 gap-3"
        style={{ color: "var(--vp-text-faint)" }}
      >
        <Bot size={40} style={{ color: "var(--vp-text-dim)" }} />
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--vp-text-secondary)", marginBottom: 4 }}>
            No agents running
          </p>
          <p style={{ fontSize: 11, color: "var(--vp-text-dim)" }}>
            Spawn an agent to get started
          </p>
        </div>
        <button
          onClick={() => useUIStore.getState().setShowSpawnDialog(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 14px", fontSize: 11,
            background: "var(--vp-accent-blue-bg)",
            border: "1px solid var(--vp-accent-blue-border)",
            borderRadius: "var(--vp-radius-lg)", color: "var(--vp-accent-blue)",
            cursor: "pointer", transition: "all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-accent-blue-bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--vp-accent-blue-bg)"; }}
        >
          <Plus size={14} />
          Spawn Agent
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Spawn agent header button */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 10px 0" }}>
        <button
          onClick={() => useUIStore.getState().setShowSpawnDialog(true)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "3px 8px", fontSize: 10,
            background: "var(--vp-bg-surface)",
            border: "1px solid var(--vp-border-light)",
            borderRadius: "var(--vp-radius-md)", color: "var(--vp-text-muted)",
            cursor: "pointer", transition: "all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)"; e.currentTarget.style.color = "var(--vp-accent-blue)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--vp-border-light)"; e.currentTarget.style.color = "var(--vp-text-muted)"; }}
        >
          <Plus size={10} />
          Spawn
        </button>
      </div>
      {groups.map((group) => {
        const isActive = group.workspace.id === activeWorkspaceId;
        return (
          <div key={group.workspace.id}>
            {/* Workspace header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 500,
                color: isActive ? "var(--vp-text-secondary)" : "var(--vp-text-dim)",
                letterSpacing: "0.03em",
              }}
            >
              <Layout size={12} style={{ color: group.workspace.color, flexShrink: 0 }} />
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {group.workspace.name}
              </span>
              <span style={{ color: "var(--vp-text-faint)", fontSize: 10 }}>{group.agents.length}</span>
            </div>
            {/* Agents */}
            {(() => {
              // Pre-compute type counts and running indices in a single pass
              const typeCount = new Map<string, number>();
              const typeRunning = new Map<string, number>();
              for (const a of group.agents) {
                const t = sessions.find((s) => s.id === a.sessionId)?.agentType || "shell";
                typeCount.set(t, (typeCount.get(t) || 0) + 1);
              }

              return group.agents.map((agent) => {
                const agentType = sessions.find((s) => s.id === agent.sessionId)?.agentType || "shell";
                const running = (typeRunning.get(agentType) || 0) + 1;
                typeRunning.set(agentType, running);
                const total = typeCount.get(agentType) || 1;
                const displayIndex = total > 1 ? running : undefined;
                const groupLabel = sessionGroupLabel[agent.sessionId || ""];

                return (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    workspaceId={group.workspace.id}
                    displayIndex={displayIndex}
                    groupLabel={groupLabel}
                  />
                );
              });
            })()}
          </div>
        );
      })}
    </div>
  );
}
