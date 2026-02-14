import { useState, useEffect, useRef } from "react";
import { Terminal, XCircle } from "lucide-react";
import type { Agent } from "../../types/agent";
import { useAgentStore } from "../../stores/agentStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useUIStore } from "../../stores/uiStore";
import { getSessionIds, closePane } from "../../lib/layout/layoutUtils";
import { cleanupTerminal } from "../../lib/terminal/terminalCache";
import { invoke } from "../../lib/ipc";

import { getAgentConfig } from "../../lib/agentTypes";

interface AgentCardProps {
  agent: Agent;
  workspaceId: string;
  displayIndex?: number;
  groupLabel?: string;
}

export default function AgentCard({ agent, workspaceId, displayIndex, groupLabel }: AgentCardProps) {
  const selectedId = useAgentStore((s) => s.selectedAgentId);
  const selectAgent = useAgentStore((s) => s.selectAgent);
  const session = useTerminalStore((s) => s.sessions.find((ss) => ss.id === agent.sessionId));
  const isSelected = selectedId === agent.id;

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  // Reactively subscribe to the last output timestamp for this session
  const sid = agent.sessionId || "";
  const lastOutputTs = useTerminalStore((s) => s.lastOutputAt[sid] || 0);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (lastOutputTs === 0) {
      setIsWorking(false);
      return;
    }
    const elapsed = Date.now() - lastOutputTs;
    if (elapsed < 4000) {
      setIsWorking(true);
      // Schedule turning off after the remaining time
      const timeout = setTimeout(() => setIsWorking(false), 4000 - elapsed + 100);
      return () => clearTimeout(timeout);
    } else {
      setIsWorking(false);
    }
  }, [lastOutputTs]);

  const agentType = session?.agentType || agent.type;
  const config = getAgentConfig(agentType);
  const dirName = (session?.projectPath || agent.cwd || "").split("/").filter(Boolean).pop() || "~";

  const handleClick = () => {
    selectAgent(agent.id);

    const ui = useUIStore.getState();
    const sessionId = agent.sessionId;
    if (!sessionId) return;

    // 1. Switch to the agent's workspace
    if (ui.activeWorkspaceId !== workspaceId) {
      ui.setActiveWorkspaceId(workspaceId);
    }

    // 2. Switch to terminal view
    const vm = ui.viewMode;
    if (vm !== "terminal" && vm !== "split") {
      ui.setViewMode("terminal");
    }

    // 3. Find which terminal group contains this session and activate it
    const groups = ui.terminalGroups[workspaceId] || [];
    const layouts = ui.workspaceLayouts;
    for (const gid of groups) {
      const layout = layouts[gid];
      if (layout) {
        const ids = getSessionIds(layout);
        if (ids.includes(sessionId)) {
          ui.setActiveTerminalGroup(workspaceId, gid);
          break;
        }
      }
    }

    // 4. Focus the pane
    ui.setFocusedPane(sessionId);
    useTerminalStore.getState().setActiveSession(sessionId);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleKillProcess = () => {
    setContextMenu(null);
    const sessionId = agent.sessionId;
    if (!sessionId) return;

    const ui = useUIStore.getState();
    const ts = useTerminalStore.getState();

    // Remove from layout, and remove empty groups
    const groups = ui.terminalGroups[workspaceId] || [];
    for (const gid of groups) {
      const layout = ui.workspaceLayouts[gid];
      if (!layout) continue;
      const ids = getSessionIds(layout);
      if (ids.includes(sessionId)) {
        const newLayout = closePane(layout, sessionId);
        if (newLayout) {
          // Pane removed but group still has other sessions
          ui.setWorkspaceLayout(gid, newLayout);
        } else {
          // No sessions left in this group — remove the group (tab)
          ui.removeTerminalGroup(workspaceId, gid);
        }
        break;
      }
    }

    // Close PTY and cleanup
    invoke("close_pty", { id: sessionId }).catch(() => {});
    cleanupTerminal(sessionId);
    ts.removeSession(sessionId);
  };

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          textAlign: "left",
          background: isSelected ? "var(--vp-bg-surface-hover)" : "transparent",
          border: "1px solid",
          borderColor: isSelected ? "var(--vp-border-light)" : "transparent",
          borderRadius: 10,
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = "var(--vp-bg-surface)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = "transparent";
          }
        }}
      >
        {/* Status dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: isWorking ? "var(--vp-accent-green)" : "var(--vp-text-faint)",
            flexShrink: 0,
            boxShadow: isWorking ? "0 0 10px var(--vp-accent-green), 0 0 4px var(--vp-accent-green)" : "none",
            animation: isWorking ? "agentPulse 1.5s ease-in-out infinite" : "none",
            transition: "all 0.3s ease",
          }}
        />

        {/* Logo */}
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: config.logo ? "var(--vp-bg-surface-hover)" : `${config.color}20`,
            border: config.logo ? "none" : `1px solid ${config.color}40`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {config.logo ? (
            <img
              src={config.logo}
              alt={config.label}
              style={{ width: 16, height: 16, objectFit: "contain" }}
              draggable={false}
            />
          ) : (
            <Terminal size={14} style={{ color: config.color }} />
          )}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: isSelected ? "var(--vp-text-primary)" : "var(--vp-text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: "16px",
            }}
          >
            {config.label}
            {displayIndex !== undefined && (
              <span style={{ color: "var(--vp-text-faint)", fontWeight: 400, marginLeft: 4 }}>#{displayIndex}</span>
            )}
            {isWorking && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--vp-accent-green)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  background: "var(--vp-accent-green-bg)",
                  padding: "1px 6px",
                  borderRadius: 8,
                }}
              >
                Working
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
              lineHeight: "14px",
            }}
          >
            {groupLabel && <span style={{ color: "var(--vp-text-dim)" }}>{groupLabel}</span>}
            {groupLabel && <span style={{ margin: "0 3px", color: "var(--vp-text-subtle)" }}>&middot;</span>}
            {dirName}
          </div>
        </div>

        <style>{`
          @keyframes agentPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </button>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            background: "var(--vp-bg-overlay)",
            border: "1px solid var(--vp-border-medium)",
            borderRadius: 8,
            padding: 4,
            minWidth: 160,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <button
            onClick={handleKillProcess}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              background: "transparent",
              border: "none",
              borderRadius: 6,
              color: "var(--vp-accent-red)",
              fontSize: 12,
              cursor: "pointer",
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <XCircle size={14} />
            Kill Process
          </button>
        </div>
      )}
    </>
  );
}
