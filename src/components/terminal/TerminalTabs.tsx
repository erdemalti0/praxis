import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Columns2, Rows2, Maximize2, Minimize2, ArrowUpDown, Pencil, Copy } from "lucide-react";
import { useTerminalStore } from "../../stores/terminalStore";
import { useUIStore } from "../../stores/uiStore";
import { closePane, getSessionIds } from "../../lib/layout/layoutUtils";
import { cleanupTerminal, refitAllTerminals } from "../../lib/terminal/terminalCache";
import { invoke } from "../../lib/ipc";
import { useConfirmStore } from "../../stores/confirmStore";
import { useWidgetStore } from "../../stores/widgetStore";

export default memo(function TerminalTabs() {
  const allSessions = useTerminalStore((s) => s.sessions);
  const activeId = useTerminalStore((s) => s.activeSessionId);
  const setActive = useTerminalStore((s) => s.setActiveSession);
  const removeSession = useTerminalStore((s) => s.removeSession);
  const updateSession = useTerminalStore((s) => s.updateSession);
  const setShowSpawn = useUIStore((s) => s.setShowSpawnDialog);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setSplitEnabled = useUIStore((s) => s.setSplitEnabled);
  const terminalMaximized = useUIStore((s) => s.terminalMaximized);
  const setTerminalMaximized = useUIStore((s) => s.setTerminalMaximized);
  const swapPanes = useUIStore((s) => s.swapPanes);
  const topPaneContent = useUIStore((s) => s.topPaneContent);
  const workspaceWidgets = useWidgetStore((s) => s.workspaceWidgets);
  const hasWidgets = activeWorkspaceId
    ? (workspaceWidgets[activeWorkspaceId]?.length ?? 0) > 0
    : false;
  // Terminal is at the bottom when widgets are on top
  const terminalIsBottom = hasWidgets && topPaneContent === "widgets";
  const focusedPaneSessionId = useUIStore((s) => s.focusedPaneSessionId);
  const setSplitSpawnContext = useUIStore((s) => s.setSplitSpawnContext);
  const workspaceLayouts = useUIStore((s) => s.workspaceLayouts);
  const setWorkspaceLayout = useUIStore((s) => s.setWorkspaceLayout);
  const terminalGroups = useUIStore((s) => s.terminalGroups);
  const activeTerminalGroup = useUIStore((s) => s.activeTerminalGroup);
  const addTerminalGroup = useUIStore((s) => s.addTerminalGroup);
  const removeTerminalGroup = useUIStore((s) => s.removeTerminalGroup);
  const setActiveTerminalGroup = useUIStore((s) => s.setActiveTerminalGroup);

  const sessions = useMemo(
    () => allSessions.filter((s) => s.workspaceId === activeWorkspaceId),
    [allSessions, activeWorkspaceId]
  );
  const groupIds = useMemo(
    () => activeWorkspaceId ? (terminalGroups[activeWorkspaceId] || []) : [],
    [activeWorkspaceId, terminalGroups]
  );
  const activeGroupId = activeWorkspaceId ? activeTerminalGroup[activeWorkspaceId] : undefined;

  // Context menu for the bar background (split screen toggle)
  const [barCtxMenu, setBarCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const barCtxRef = useRef<HTMLDivElement>(null);

  // Context menu for a tab (session list)
  const [tabCtxMenu, setTabCtxMenu] = useState<{ x: number; y: number; groupId: string } | null>(null);
  const tabCtxRef = useRef<HTMLDivElement>(null);

  // Context menu for a terminal session (right-click on group tab)
  const [sessionCtxMenu, setSessionCtxMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const sessionCtxRef = useRef<HTMLDivElement>(null);

  // Close context menus on any click outside
  useEffect(() => {
    if (!barCtxMenu && !tabCtxMenu && !sessionCtxMenu) return;
    const close = (e: MouseEvent) => {
      if (barCtxMenu && barCtxRef.current && !barCtxRef.current.contains(e.target as Node)) {
        setBarCtxMenu(null);
      }
      if (tabCtxMenu && tabCtxRef.current && !tabCtxRef.current.contains(e.target as Node)) {
        setTabCtxMenu(null);
      }
      if (sessionCtxMenu && sessionCtxRef.current && !sessionCtxRef.current.contains(e.target as Node)) {
        setSessionCtxMenu(null);
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", close);
    };
  }, [barCtxMenu, tabCtxMenu, sessionCtxMenu]);

  // Close session context menu on ESC
  useEffect(() => {
    if (!sessionCtxMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSessionCtxMenu(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [sessionCtxMenu]);

  const handleBarContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBarCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const handleTabContextMenu = (e: React.MouseEvent, groupId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setTabCtxMenu({ x: e.clientX, y: e.clientY, groupId });
  };

  const handleSplit = (direction: "horizontal" | "vertical") => {
    const targetSession = focusedPaneSessionId || activeId;
    if (targetSession) {
      setSplitSpawnContext({ sessionId: targetSession, direction });
      setShowSpawn(true);
    }
  };

  const handleCloseSession = (sessionId: string, groupId: string) => {
    useConfirmStore.getState().showConfirm("Close Terminal", "Close this terminal?", () => {
      const layout = workspaceLayouts[groupId];
      if (layout) {
        const newLayout = closePane(layout, sessionId);
        if (newLayout) {
          setWorkspaceLayout(groupId, newLayout);
        } else {
          setWorkspaceLayout(groupId, { type: "leaf", sessionId: null });
        }
      }
      // Kill the PTY process on the backend
      invoke("close_pty", { id: sessionId }).catch(() => {});
      // Clean up terminal instance, xterm, and IPC listeners
      cleanupTerminal(sessionId);
      removeSession(sessionId);
    }, { danger: true });
  };

  const handleCloseAllInGroup = (groupId: string) => {
    setTabCtxMenu(null);
    const layout = workspaceLayouts[groupId];
    const sessionIds = layout ? getSessionIds(layout) : [];
    for (const sid of sessionIds) {
      // Kill the PTY process on the backend
      invoke("close_pty", { id: sid }).catch(() => {});
      // Clean up terminal instance, xterm, and IPC listeners
      cleanupTerminal(sid);
      removeSession(sid);
    }
    // If there's only one group, reset to empty leaf. Otherwise remove the group.
    if (activeWorkspaceId && groupIds.length <= 1) {
      setWorkspaceLayout(groupId, { type: "leaf", sessionId: null });
    } else if (activeWorkspaceId) {
      removeTerminalGroup(activeWorkspaceId, groupId);
    }
  };

  const handleAddTerminal = () => {
    if (!activeWorkspaceId) return;
    addTerminalGroup(activeWorkspaceId);
    setShowSpawn(true);
  };

  // Get sessions for a specific group from its layout
  const getGroupSessionIds = (groupId: string): string[] => {
    const layout = workspaceLayouts[groupId];
    return layout ? getSessionIds(layout) : [];
  };

  // Context menu sessions (for the right-clicked group)
  const ctxGroupSessions = useMemo(() => {
    if (!tabCtxMenu) return [];
    return getGroupSessionIds(tabCtxMenu.groupId)
      .map((sid) => allSessions.find((s) => s.id === sid))
      .filter(Boolean);
  }, [tabCtxMenu, allSessions, workspaceLayouts]);

  return (
    <div
      className="flex items-center px-3 gap-1 shrink-0 overflow-x-auto"
      style={{
        height: 40,
        background: "transparent",
        borderBottom: "1px solid var(--vp-border-panel)",
      }}
      onContextMenu={handleBarContextMenu}
    >
      {/* Terminal group tabs */}
      {groupIds.map((gid, index) => {
        const isActive = gid === activeGroupId;
        const groupSessionIds = getGroupSessionIds(gid);
        const paneCount = groupSessionIds.length;
        const label = `Terminal ${index + 1}`;
        const displayLabel = paneCount > 1 ? `${label} (${paneCount})` : label;

        return (
          <button
            key={gid}
            onClick={() => {
              if (activeWorkspaceId) setActiveTerminalGroup(activeWorkspaceId, gid);
            }}
            onContextMenu={(e) => {
              handleTabContextMenu(e, gid);
              // Also set session context menu for the focused session in this group
              const sessionIds = getGroupSessionIds(gid);
              const targetSessionId = focusedPaneSessionId && sessionIds.includes(focusedPaneSessionId)
                ? focusedPaneSessionId
                : sessionIds[0];
              if (targetSessionId) {
                setSessionCtxMenu({ x: e.clientX, y: e.clientY, sessionId: targetSessionId });
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap group"
            style={{
              background: isActive ? "var(--vp-bg-surface-hover)" : "transparent",
              color: isActive ? "var(--vp-text-primary)" : "var(--vp-text-muted)",
              borderRadius: 10,
              transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              fontWeight: isActive ? 500 : 400,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: isActive ? "var(--vp-accent-green)" : "var(--vp-border-strong)",
                flexShrink: 0,
              }}
            />
            <span>{displayLabel}</span>
            {/* Close group button — show when more than 1 group */}
            {groupIds.length > 1 && (
              <X
                size={12}
                className="opacity-0 group-hover:opacity-100"
                style={{ color: "var(--vp-accent-red-text)", transition: "opacity 0.2s ease" }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseAllInGroup(gid);
                }}
              />
            )}
          </button>
        );
      })}

      {/* Add new terminal button */}
      <button
        onClick={handleAddTerminal}
        className="flex items-center justify-center"
        title="New Terminal"
        style={{
          color: "var(--vp-text-muted)",
          width: 28,
          height: 28,
          borderRadius: 8,
          border: "1px solid var(--vp-border-light)",
          background: "var(--vp-bg-surface)",
          transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--vp-text-primary)";
          e.currentTarget.style.background = "var(--vp-border-light)";
          e.currentTarget.style.borderColor = "var(--vp-border-strong)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--vp-text-muted)";
          e.currentTarget.style.background = "var(--vp-bg-surface)";
          e.currentTarget.style.borderColor = "var(--vp-border-light)";
        }}
      >
        <Plus size={14} />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Swap button (when widgets exist) or Maximize button */}
      {terminalIsBottom && !terminalMaximized ? (
        <button
          onClick={() => { swapPanes(); setTimeout(() => refitAllTerminals(), 50); }}
          title="Swap terminal &amp; widgets"
          className="flex items-center justify-center"
          style={{
            color: "var(--vp-text-dim)",
            width: 28,
            height: 28,
            borderRadius: 8,
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--vp-text-primary)";
            e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--vp-text-dim)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          <ArrowUpDown size={13} />
        </button>
      ) : (
        <button
          onClick={() => setTerminalMaximized(!terminalMaximized)}
          title={terminalMaximized ? "Exit full screen" : "Full screen"}
          className="flex items-center justify-center"
          style={{
            color: "var(--vp-text-dim)",
            width: 28,
            height: 28,
            borderRadius: 8,
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--vp-text-primary)";
            e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--vp-text-dim)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          {terminalMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      )}

      {/* Bar context menu (split screen toggle) */}
      {barCtxMenu &&
        createPortal(
          <div
            ref={barCtxRef}
            style={{
              position: "fixed",
              left: barCtxMenu.x,
              top: barCtxMenu.y,
              background: "var(--vp-bg-tertiary)",
              border: "1px solid var(--vp-border-medium)",
              borderRadius: 10,
              padding: 4,
              zIndex: 9999,
              minWidth: 180,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            <button
              onClick={() => {
                setBarCtxMenu(null);
                if (viewMode === "split") {
                  setSplitEnabled(false);
                  setViewMode("terminal");
                } else {
                  setViewMode("split");
                }
              }}
              className="flex items-center gap-2 w-full px-3 py-2"
              style={{
                background: "transparent",
                border: "none",
                borderRadius: 7,
                cursor: "pointer",
                color: "var(--vp-text-primary)",
                fontSize: 12,
                textAlign: "left",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--vp-bg-surface-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <Columns2 size={13} style={{ color: "var(--vp-text-muted)" }} />
              <span>
                {viewMode === "split" ? "Close Split Screen" : "Split Screen"}
              </span>
            </button>
          </div>,
          document.body
        )}

      {/* Tab context menu (session list + close all) */}
      {tabCtxMenu &&
        createPortal(
          <div
            ref={tabCtxRef}
            style={{
              position: "fixed",
              left: tabCtxMenu.x,
              top: tabCtxMenu.y,
              background: "var(--vp-bg-tertiary)",
              border: "1px solid var(--vp-border-medium)",
              borderRadius: 10,
              padding: 4,
              zIndex: 9999,
              minWidth: 220,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            {ctxGroupSessions.map((s) => (
              <div
                key={s!.id}
                className="flex items-center justify-between w-full px-3 py-2"
                style={{
                  borderRadius: 7,
                  cursor: "default",
                  color: focusedPaneSessionId === s!.id ? "var(--vp-text-primary)" : "var(--vp-text-secondary)",
                  fontSize: 12,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--vp-bg-surface-hover)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: focusedPaneSessionId === s!.id ? "var(--vp-accent-blue)" : "var(--vp-border-strong)",
                      flexShrink: 0,
                    }}
                  />
                  <span>{s!.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseSession(s!.id, tabCtxMenu.groupId);
                    const remaining = getGroupSessionIds(tabCtxMenu.groupId);
                    if (remaining.length <= 1) setTabCtxMenu(null);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--vp-text-dim)",
                    padding: 2,
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-accent-red-text)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-dim)")}
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {ctxGroupSessions.length > 1 && (
              <>
                <div
                  style={{
                    height: 1,
                    background: "var(--vp-border-light)",
                    margin: "4px 8px",
                  }}
                />
                <button
                  onClick={() => handleCloseAllInGroup(tabCtxMenu.groupId)}
                  className="flex items-center gap-2 w-full px-3 py-2"
                  style={{
                    background: "transparent",
                    border: "none",
                    borderRadius: 7,
                    cursor: "pointer",
                    color: "var(--vp-accent-red-text)",
                    fontSize: 12,
                    textAlign: "left",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "var(--vp-bg-surface-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <X size={13} />
                  <span>Close All</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}

      {/* Session context menu (Rename / Kill / Copy Path) */}
      {sessionCtxMenu &&
        createPortal(
          <div
            ref={sessionCtxRef}
            style={{
              position: "fixed",
              left: sessionCtxMenu.x,
              top: sessionCtxMenu.y + 8,
              background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-light)",
              borderRadius: 8,
              padding: 4,
              zIndex: 10000,
              minWidth: 160,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            {/* Rename */}
            <button
              onClick={() => {
                const session = allSessions.find((s) => s.id === sessionCtxMenu.sessionId);
                const newName = window.prompt("Rename terminal:", session?.title ?? "");
                if (newName && newName.trim()) {
                  updateSession(sessionCtxMenu.sessionId, { title: newName.trim() });
                }
                setSessionCtxMenu(null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2"
              style={{
                background: "transparent",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                color: "var(--vp-text-primary)",
                fontSize: 12,
                textAlign: "left",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--vp-bg-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Pencil size={13} style={{ color: "var(--vp-text-muted)" }} />
              <span>Rename</span>
            </button>

            {/* Kill Process */}
            <button
              onClick={() => {
                invoke("close_pty", { id: sessionCtxMenu.sessionId }).catch(() => {});
                cleanupTerminal(sessionCtxMenu.sessionId);
                removeSession(sessionCtxMenu.sessionId);
                setSessionCtxMenu(null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2"
              style={{
                background: "transparent",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                color: "var(--vp-accent-red-text)",
                fontSize: 12,
                textAlign: "left",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--vp-bg-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <X size={13} />
              <span>Kill Process</span>
            </button>

            {/* Copy Path */}
            <button
              onClick={() => {
                const session = allSessions.find((s) => s.id === sessionCtxMenu.sessionId);
                if (session?.projectPath) {
                  navigator.clipboard.writeText(session.projectPath).catch(() => {});
                }
                setSessionCtxMenu(null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2"
              style={{
                background: "transparent",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                color: "var(--vp-text-primary)",
                fontSize: 12,
                textAlign: "left",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--vp-bg-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Copy size={13} style={{ color: "var(--vp-text-muted)" }} />
              <span>Copy Path</span>
            </button>
          </div>,
          document.body
        )}
    </div>
  );
});
