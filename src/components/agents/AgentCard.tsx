import { useState, useEffect, useRef } from "react";
import { Terminal, XCircle } from "lucide-react";
import type { Agent } from "../../types/agent";
import { useAgentStore } from "../../stores/agentStore";
import { useTerminalStore, getLastOutputAt } from "../../stores/terminalStore";
import { useUIStore } from "../../stores/uiStore";
import { getSessionIds, closePane, rebalanceLayout } from "../../lib/layout/layoutUtils";
import { cleanupTerminal } from "../../lib/terminal/terminalCache";
import { invoke } from "../../lib/ipc";
import { getBaseName } from "../../lib/pathUtils";

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

  // Close context menu on click outside or ESC
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  // Poll output timestamp on a 1s timer (activity data lives outside Zustand)
  const sid = agent.sessionId || "";
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    const check = () => {
      const ts = getLastOutputAt(sid);
      if (ts === 0) { setIsWorking(false); return; }
      setIsWorking(Date.now() - ts < 4000);
    };
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [sid]);

  const agentType = session?.agentType || agent.type;
  const config = getAgentConfig(agentType);
  const dirName = getBaseName(session?.projectPath || agent.cwd || "") || "~";

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
          // Pane removed but group still has other sessions — rebalance
          ui.setWorkspaceLayout(gid, rebalanceLayout(newLayout));
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
          borderRadius: "var(--vp-radius-xl)",
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
            width: 10,
            height: 10,
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
            borderRadius: "var(--vp-radius-md)",
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
                  borderRadius: "var(--vp-radius-lg)",
                  animation: "workingPulse 2s ease-in-out infinite",
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
            {getLastOutputAt(sid) > 0 && (
              <>
                <span style={{ margin: "0 3px", color: "var(--vp-text-subtle)" }}>&middot;</span>
                <span style={{ color: "var(--vp-text-subtle)" }}>
                  {isWorking ? "Active now" : (() => {
                    const diff = Math.floor((Date.now() - getLastOutputAt(sid)) / 1000);
                    if (diff < 60) return `${diff}s ago`;
                    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                    return `${Math.floor(diff / 3600)}h ago`;
                  })()}
                </span>
              </>
            )}
          </div>
        </div>

      </button>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            background: "var(--vp-bg-tertiary)",
            border: "1px solid var(--vp-border-medium)",
            borderRadius: "var(--vp-radius-lg)",
            padding: 4,
            minWidth: 160,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <button
            role="menuitem"
            onClick={handleKillProcess}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 10px",
              background: "transparent",
              border: "none",
              borderRadius: "var(--vp-radius-md)",
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
