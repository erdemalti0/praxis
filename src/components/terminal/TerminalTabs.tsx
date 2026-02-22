import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Columns2, Maximize2, Minimize2, ArrowUpDown, Pencil, Copy, Terminal, Globe, Play, Bot, ArrowLeftRight } from "lucide-react";
import { useTerminalStore } from "../../stores/terminalStore";
import { useUIStore } from "../../stores/uiStore";
import { useShallow } from "zustand/shallow";
import { closePane, getSessionIds, rebalanceLayout } from "../../lib/layout/layoutUtils";
import { PANE_DRAG_MIME, type PaneDragData } from "../../types/layout";
import { LAYOUT_PRESETS, type LayoutPreset } from "../../lib/layout/layoutPresets";
import { cleanupTerminal, refitAllTerminals } from "../../lib/terminal/terminalCache";
import { invoke } from "../../lib/ipc";
import { useConfirmStore } from "../../stores/confirmStore";
import { useWidgetStore } from "../../stores/widgetStore";
import { useBrowserStore } from "../../stores/browserStore";

/** Miniature grid icon showing the layout pattern */
function PresetIcon({ grid }: { grid: string[][] }) {
  const rows = grid.length;
  const cols = Math.max(...grid.map((r) => r.length));
  // Collect unique cell IDs to assign distinct colors
  const ids = [...new Set(grid.flat())];
  const palette = [
    "var(--vp-accent-blue)",
    "var(--vp-accent-green)",
    "var(--vp-accent-purple, #a78bfa)",
    "var(--vp-accent-orange, #fb923c)",
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        width: 18,
        height: 14,
        gap: 1,
        flexShrink: 0,
      }}
    >
      {grid.flatMap((row, ri) =>
        row.map((cell, ci) => {
          // Calculate grid span for merged cells
          const rowSpan =
            ri === 0
              ? grid.filter((r, rr) => rr > ri && r[ci] === cell).length + 1
              : grid[ri - 1]?.[ci] === cell
                ? 0
                : 1;
          const colSpan =
            ci === 0
              ? row.filter((c, cc) => cc > ci && c === cell).length + 1
              : row[ci - 1] === cell
                ? 0
                : 1;

          if (rowSpan === 0 || colSpan === 0) return null;

          return (
            <div
              key={`${ri}-${ci}`}
              style={{
                gridRow: `${ri + 1} / span ${rowSpan}`,
                gridColumn: `${ci + 1} / span ${colSpan}`,
                background: palette[ids.indexOf(cell) % palette.length],
                borderRadius: "var(--vp-radius-xs)",
                opacity: 0.7,
              }}
            />
          );
        })
      )}
    </div>
  );
}

export default memo(function TerminalTabs() {
  const allSessions = useTerminalStore((s) => s.sessions);
  const removeSession = useTerminalStore((s) => s.removeSession);
  const updateSession = useTerminalStore((s) => s.updateSession);
  const {
    setShowSpawn, activeWorkspaceId, viewMode, setViewMode, setSplitEnabled,
    terminalMaximized, setTerminalMaximized, maximizedContent, setMaximizedContent,
    swapPanes, topPaneContent,
    focusedPaneSessionId, workspaceLayouts, setWorkspaceLayout,
    terminalGroups, activeTerminalGroup, addTerminalGroup, removeTerminalGroup,
    setActiveTerminalGroup, moveSessionToGroup, setDraggingPaneSessionId,
  } = useUIStore(
    useShallow((s) => ({
      setShowSpawn: s.setShowSpawnDialog,
      activeWorkspaceId: s.activeWorkspaceId,
      viewMode: s.viewMode,
      setViewMode: s.setViewMode,
      setSplitEnabled: s.setSplitEnabled,
      terminalMaximized: s.terminalMaximized,
      setTerminalMaximized: s.setTerminalMaximized,
      maximizedContent: s.maximizedContent,
      setMaximizedContent: s.setMaximizedContent,
      swapPanes: s.swapPanes,
      topPaneContent: s.topPaneContent,
      focusedPaneSessionId: s.focusedPaneSessionId,
      workspaceLayouts: s.workspaceLayouts,
      setWorkspaceLayout: s.setWorkspaceLayout,
      terminalGroups: s.terminalGroups,
      activeTerminalGroup: s.activeTerminalGroup,
      addTerminalGroup: s.addTerminalGroup,
      removeTerminalGroup: s.removeTerminalGroup,
      setActiveTerminalGroup: s.setActiveTerminalGroup,
      moveSessionToGroup: s.moveSessionToGroup,
      setDraggingPaneSessionId: s.setDraggingPaneSessionId,
    }))
  );
  const workspaceWidgets = useWidgetStore((s) => s.workspaceWidgets);
  const hasWidgets = activeWorkspaceId
    ? (workspaceWidgets[activeWorkspaceId]?.length ?? 0) > 0
    : false;
  const { browserTabs, createLandingTab } = useBrowserStore(useShallow((s) => ({
    browserTabs: s.tabs,
    createLandingTab: s.createLandingTab,
  })));
  // Terminal is at the bottom when widgets are on top
  const terminalIsBottom = hasWidgets && topPaneContent === "widgets";

  // Drag-over state for group tabs and "+" button
  const [tabDragOver, setTabDragOver] = useState<string | null>(null);
  const [plusDragOver, setPlusDragOver] = useState(false);
  const tabSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const groupIds = useMemo(
    () => activeWorkspaceId ? (terminalGroups[activeWorkspaceId] || []) : [],
    [activeWorkspaceId, terminalGroups]
  );
  const activeGroupId = activeWorkspaceId ? activeTerminalGroup[activeWorkspaceId] : undefined;

  // Layout preset dropdown
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const layoutMenuRef = useRef<HTMLDivElement>(null);
  const layoutBtnRef = useRef<HTMLButtonElement>(null);

  // Context menu for the bar background (split screen toggle)
  const [barCtxMenu, setBarCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const barCtxRef = useRef<HTMLDivElement>(null);

  // Context menu for a tab (session list)
  const [tabCtxMenu, setTabCtxMenu] = useState<{ x: number; y: number; groupId: string } | null>(null);
  const tabCtxRef = useRef<HTMLDivElement>(null);

  // Context menu for a terminal session (right-click on group tab)
  const [sessionCtxMenu, setSessionCtxMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const sessionCtxRef = useRef<HTMLDivElement>(null);

  // Inline rename state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

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

  // Close layout menu on outside click
  useEffect(() => {
    if (!showLayoutMenu) return;
    const close = (e: MouseEvent) => {
      if (
        layoutMenuRef.current && !layoutMenuRef.current.contains(e.target as Node) &&
        layoutBtnRef.current && !layoutBtnRef.current.contains(e.target as Node)
      ) {
        setShowLayoutMenu(false);
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", close), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", close);
    };
  }, [showLayoutMenu]);

  // Keyboard shortcuts:
  // Cmd+1-9 = switch terminal groups (always), Cmd+Shift+B = Browser, Cmd+Shift+R = Runner (maximized only)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      // Skip when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // Cmd+Shift+B = Browser (maximized only)
      if (terminalMaximized && e.shiftKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        e.stopPropagation();
        if (browserTabs.length === 0) createLandingTab();
        setMaximizedContent(maximizedContent === "browser" ? "terminal" : "browser");
        return;
      }

      // Cmd+Shift+R = Runner (maximized only)
      if (terminalMaximized && e.shiftKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        e.stopPropagation();
        setMaximizedContent(maximizedContent === "runner" ? "terminal" : "runner");
        return;
      }

      // Cmd+Shift+A = Agent (maximized only)
      if (terminalMaximized && e.shiftKey && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        e.stopPropagation();
        setMaximizedContent(maximizedContent === "agent" ? "terminal" : "agent");
        return;
      }

      // Cmd+1-9 = terminal groups (always available)
      if (e.shiftKey) return;
      const num = parseInt(e.key, 10);
      if (isNaN(num) || num < 1 || num > 9) return;
      e.preventDefault();
      e.stopPropagation();
      const groupIndex = num - 1;
      if (groupIndex >= 0 && groupIndex < groupIds.length && activeWorkspaceId) {
        setActiveTerminalGroup(activeWorkspaceId, groupIds[groupIndex]);
        if (terminalMaximized && maximizedContent !== "terminal") setMaximizedContent("terminal");
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [terminalMaximized, maximizedContent, groupIds, activeWorkspaceId, browserTabs.length]);

  // Create a preset layout with empty panes (user fills each via "+ New Terminal" button)
  const handlePresetSelect = useCallback((preset: LayoutPreset) => {
    setShowLayoutMenu(false);
    if (!activeWorkspaceId) return;

    const groupId = addTerminalGroup(activeWorkspaceId);
    const layout = preset.createLayout();
    useUIStore.getState().setWorkspaceLayout(groupId, layout);

    // Switch to terminal view if needed
    const state = useUIStore.getState();
    if (state.viewMode === "missions") {
      state.setViewMode(state.splitEnabled ? "split" : "terminal");
    }
  }, [activeWorkspaceId, addTerminalGroup]);

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

  const handleCloseSession = (sessionId: string, groupId: string) => {
    useConfirmStore.getState().showConfirm("Close Terminal", "Close this terminal?", () => {
      const layout = workspaceLayouts[groupId];
      if (layout) {
        const newLayout = closePane(layout, sessionId);
        if (newLayout) {
          setWorkspaceLayout(groupId, rebalanceLayout(newLayout));
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
      {/* Quick-access buttons when maximized: Browser + Run (before terminal tabs) */}
      {terminalMaximized && (
        <div className="flex items-center gap-1" style={{ marginRight: 4 }}>
          <button
            onClick={() => {
              if (browserTabs.length === 0) createLandingTab();
              setMaximizedContent(maximizedContent === "browser" ? "terminal" : "browser");
            }}
            title="Browser (⌘⇧B)"
            className="flex items-center gap-1.5 px-2.5 py-1"
            style={{
              color: maximizedContent === "browser" ? "var(--vp-accent-blue)" : "var(--vp-text-dim)",
              fontSize: 11,
              borderRadius: "var(--vp-radius-lg)",
              border: `1px solid ${maximizedContent === "browser" ? "var(--vp-accent-blue-border)" : "var(--vp-border-light)"}`,
              background: maximizedContent === "browser" ? "var(--vp-accent-blue-bg)" : "transparent",
              transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onMouseEnter={(e) => {
              if (maximizedContent !== "browser") {
                e.currentTarget.style.color = "var(--vp-accent-blue)";
                e.currentTarget.style.background = "var(--vp-accent-blue-bg)";
                e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)";
              }
            }}
            onMouseLeave={(e) => {
              if (maximizedContent !== "browser") {
                e.currentTarget.style.color = "var(--vp-text-dim)";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--vp-border-light)";
              }
            }}
          >
            <Globe size={12} />
            <span>Browser</span>
          </button>
          <button
            onClick={() => {
              setMaximizedContent(maximizedContent === "runner" ? "terminal" : "runner");
            }}
            title="Runner (⌘⇧R)"
            className="flex items-center gap-1.5 px-2.5 py-1"
            style={{
              color: maximizedContent === "runner" ? "#fb923c" : "var(--vp-text-dim)",
              fontSize: 11,
              borderRadius: "var(--vp-radius-lg)",
              border: `1px solid ${maximizedContent === "runner" ? "rgba(251,146,60,0.3)" : "var(--vp-border-light)"}`,
              background: maximizedContent === "runner" ? "rgba(251,146,60,0.12)" : "transparent",
              transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onMouseEnter={(e) => {
              if (maximizedContent !== "runner") {
                e.currentTarget.style.color = "#fb923c";
                e.currentTarget.style.background = "rgba(251,146,60,0.12)";
                e.currentTarget.style.borderColor = "rgba(251,146,60,0.3)";
              }
            }}
            onMouseLeave={(e) => {
              if (maximizedContent !== "runner") {
                e.currentTarget.style.color = "var(--vp-text-dim)";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--vp-border-light)";
              }
            }}
          >
            <Play size={12} />
            <span>Run</span>
          </button>
          <button
            onClick={() => {
              setMaximizedContent(maximizedContent === "agent" ? "terminal" : "agent");
            }}
            title="Agent (⌘⇧A)"
            className="flex items-center gap-1.5 px-2.5 py-1"
            style={{
              color: maximizedContent === "agent" ? "var(--vp-accent-purple, #a78bfa)" : "var(--vp-text-dim)",
              fontSize: 11,
              borderRadius: "var(--vp-radius-lg)",
              border: `1px solid ${maximizedContent === "agent" ? "rgba(167,139,250,0.3)" : "var(--vp-border-light)"}`,
              background: maximizedContent === "agent" ? "rgba(167,139,250,0.12)" : "transparent",
              transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onMouseEnter={(e) => {
              if (maximizedContent !== "agent") {
                e.currentTarget.style.color = "var(--vp-accent-purple, #a78bfa)";
                e.currentTarget.style.background = "rgba(167,139,250,0.12)";
                e.currentTarget.style.borderColor = "rgba(167,139,250,0.3)";
              }
            }}
            onMouseLeave={(e) => {
              if (maximizedContent !== "agent") {
                e.currentTarget.style.color = "var(--vp-text-dim)";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--vp-border-light)";
              }
            }}
          >
            <Bot size={12} />
            <span>Agent</span>
          </button>

          {/* Separator */}
          <div style={{ width: 1, height: 16, background: "var(--vp-border-light)", marginLeft: 2, marginRight: 2 }} />
        </div>
      )}

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
              if (terminalMaximized && maximizedContent !== "terminal") setMaximizedContent("terminal");
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
              background: tabDragOver === gid ? "var(--vp-accent-blue-bg)" : isActive ? "var(--vp-bg-surface-hover)" : "transparent",
              color: tabDragOver === gid ? "var(--vp-accent-blue-glow)" : isActive ? "var(--vp-text-primary)" : "var(--vp-text-muted)",
              border: tabDragOver === gid ? "1px solid var(--vp-accent-blue-glow)" : "1px solid transparent",
              borderRadius: "var(--vp-radius-xl)",
              transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              fontWeight: isActive ? 500 : 400,
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(PANE_DRAG_MIME)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setTabDragOver(gid);
                // Auto-switch to this tab after 500ms hover during drag
                if (!tabSwitchTimerRef.current && gid !== activeGroupId && activeWorkspaceId) {
                  tabSwitchTimerRef.current = setTimeout(() => {
                    setActiveTerminalGroup(activeWorkspaceId!, gid);
                    tabSwitchTimerRef.current = null;
                  }, 500);
                }
              }
            }}
            onDragLeave={() => {
              if (tabDragOver === gid) setTabDragOver(null);
              if (tabSwitchTimerRef.current) {
                clearTimeout(tabSwitchTimerRef.current);
                tabSwitchTimerRef.current = null;
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setTabDragOver(null);
              if (tabSwitchTimerRef.current) {
                clearTimeout(tabSwitchTimerRef.current);
                tabSwitchTimerRef.current = null;
              }
              const raw = e.dataTransfer.getData(PANE_DRAG_MIME);
              if (!raw) return;
              let data: PaneDragData;
              try { data = JSON.parse(raw); } catch { return; }
              if (data.sourceGroupId === gid) return;
              moveSessionToGroup(data.sessionId, data.sourceGroupId, gid);
              setDraggingPaneSessionId(null);
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

      {/* Add new terminal button (dropdown trigger) */}
      <div
        style={{ position: "relative" }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(PANE_DRAG_MIME)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setPlusDragOver(true);
          }
        }}
        onDragLeave={() => setPlusDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setPlusDragOver(false);
          const raw = e.dataTransfer.getData(PANE_DRAG_MIME);
          if (!raw || !activeWorkspaceId) return;
          let data: PaneDragData;
          try { data = JSON.parse(raw); } catch { return; }
          const newGroupId = addTerminalGroup(activeWorkspaceId);
          moveSessionToGroup(data.sessionId, data.sourceGroupId, newGroupId);
          setDraggingPaneSessionId(null);
        }}
      >
        <button
          ref={layoutBtnRef}
          onClick={() => setShowLayoutMenu((v) => !v)}
          className="flex items-center justify-center"
          title="New Terminal"
          style={{
            color: plusDragOver ? "var(--vp-accent-blue-glow)" : showLayoutMenu ? "var(--vp-text-primary)" : "var(--vp-text-muted)",
            width: 28,
            height: 28,
            borderRadius: "var(--vp-radius-lg)",
            border: `1px solid ${plusDragOver ? "var(--vp-accent-blue-glow)" : showLayoutMenu ? "var(--vp-border-strong)" : "var(--vp-border-light)"}`,
            background: plusDragOver ? "var(--vp-accent-blue-bg)" : showLayoutMenu ? "var(--vp-border-light)" : "var(--vp-bg-surface)",
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--vp-text-primary)";
            e.currentTarget.style.background = "var(--vp-border-light)";
            e.currentTarget.style.borderColor = "var(--vp-border-strong)";
          }}
          onMouseLeave={(e) => {
            if (!showLayoutMenu) {
              e.currentTarget.style.color = "var(--vp-text-muted)";
              e.currentTarget.style.background = "var(--vp-bg-surface)";
              e.currentTarget.style.borderColor = "var(--vp-border-light)";
            }
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right-side controls */}
      {terminalMaximized ? (
        <div className="flex items-center gap-1">
          {/* Switch between terminal and widgets (only if widgets exist) */}
          {hasWidgets && (
            <button
              onClick={() => {
                setMaximizedContent(maximizedContent === "widgets" ? "terminal" : "widgets");
              }}
              title={maximizedContent === "widgets" ? "Switch to Terminal" : "Switch to Widgets"}
              className="flex items-center gap-1.5 px-2.5 py-1"
              style={{
                color: maximizedContent === "widgets" ? "var(--vp-accent-purple, #a78bfa)" : "var(--vp-text-dim)",
                fontSize: 11,
                borderRadius: "var(--vp-radius-lg)",
                border: `1px solid ${maximizedContent === "widgets" ? "rgba(167,139,250,0.3)" : "var(--vp-border-light)"}`,
                background: maximizedContent === "widgets" ? "rgba(167,139,250,0.12)" : "transparent",
                transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onMouseEnter={(e) => {
                if (maximizedContent !== "widgets") {
                  e.currentTarget.style.color = "var(--vp-text-primary)";
                  e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                  e.currentTarget.style.borderColor = "var(--vp-border-strong)";
                }
              }}
              onMouseLeave={(e) => {
                if (maximizedContent !== "widgets") {
                  e.currentTarget.style.color = "var(--vp-text-dim)";
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "var(--vp-border-light)";
                }
              }}
            >
              <ArrowLeftRight size={12} />
              <span>Widgets</span>
            </button>
          )}
          {/* Exit fullscreen */}
          <button
            onClick={() => setTerminalMaximized(false)}
            title="Exit full screen"
            className="flex items-center justify-center"
            style={{
              color: "var(--vp-text-dim)",
              width: 28,
              height: 28,
              borderRadius: "var(--vp-radius-lg)",
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
            <Minimize2 size={13} />
          </button>
        </div>
      ) : terminalIsBottom ? (
        <button
          onClick={() => { swapPanes(); setTimeout(() => refitAllTerminals(), 50); }}
          title="Swap terminal &amp; widgets"
          className="flex items-center justify-center"
          style={{
            color: "var(--vp-text-dim)",
            width: 28,
            height: 28,
            borderRadius: "var(--vp-radius-lg)",
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
          onClick={() => setTerminalMaximized(true)}
          title="Full screen"
          className="flex items-center justify-center"
          style={{
            color: "var(--vp-text-dim)",
            width: 28,
            height: 28,
            borderRadius: "var(--vp-radius-lg)",
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
          <Maximize2 size={13} />
        </button>
      )}

      {/* Layout preset dropdown */}
      {showLayoutMenu &&
        createPortal(
          <div
            ref={layoutMenuRef}
            style={{
              position: "fixed",
              left: layoutBtnRef.current
                ? layoutBtnRef.current.getBoundingClientRect().left
                : 0,
              top: layoutBtnRef.current
                ? layoutBtnRef.current.getBoundingClientRect().bottom + 6
                : 0,
              background: "var(--vp-bg-tertiary)",
              border: "1px solid var(--vp-border-medium)",
              borderRadius: "var(--vp-radius-xl)",
              padding: 4,
              zIndex: 9999,
              minWidth: 220,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            {/* New Terminal (single) */}
            <button
              onClick={() => {
                setShowLayoutMenu(false);
                handleAddTerminal();
              }}
              className="flex items-center gap-2.5 w-full px-3 py-2"
              style={{
                background: "transparent",
                border: "none",
                borderRadius: "var(--vp-radius-md)",
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
              <Terminal size={13} style={{ color: "var(--vp-text-muted)", flexShrink: 0 }} />
              <span>New Terminal</span>
            </button>

            {/* Separator */}
            <div
              style={{
                height: 1,
                background: "var(--vp-border-light)",
                margin: "4px 8px",
              }}
            />

            {/* Layout presets */}
            {LAYOUT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePresetSelect(preset)}
                className="flex items-center gap-2.5 w-full px-3 py-2"
                style={{
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--vp-radius-md)",
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
                <PresetIcon grid={preset.iconGrid} />
                <span>{preset.name}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    color: "var(--vp-text-dim)",
                    fontSize: 10,
                  }}
                >
                  {preset.paneCount}
                </span>
              </button>
            ))}
          </div>,
          document.body
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
              borderRadius: "var(--vp-radius-xl)",
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
                  setSplitEnabled(true);
                  setViewMode("split");
                }
              }}
              className="flex items-center gap-2 w-full px-3 py-2"
              style={{
                background: "transparent",
                border: "none",
                borderRadius: "var(--vp-radius-md)",
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
              borderRadius: "var(--vp-radius-xl)",
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
                  borderRadius: "var(--vp-radius-md)",
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
                  {editingSessionId === s!.id ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (editValue.trim()) updateSession(editingSessionId!, { title: editValue.trim() });
                          setEditingSessionId(null);
                        } else if (e.key === "Escape") {
                          setEditingSessionId(null);
                        }
                      }}
                      onBlur={() => {
                        if (editValue.trim()) updateSession(editingSessionId!, { title: editValue.trim() });
                        setEditingSessionId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ background: "var(--vp-input-bg)", border: "1px solid var(--vp-accent-blue)", borderRadius: "var(--vp-radius-sm)", padding: "1px 4px", color: "var(--vp-text-primary)", fontSize: 10, outline: "none", width: 80 }}
                    />
                  ) : (
                    <span>{s!.title}</span>
                  )}
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
                    borderRadius: "var(--vp-radius-sm)",
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
                    borderRadius: "var(--vp-radius-md)",
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
              borderRadius: "var(--vp-radius-lg)",
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
                setEditingSessionId(sessionCtxMenu.sessionId);
                setEditValue(session?.title ?? "");
                setSessionCtxMenu(null);
              }}
              className="flex items-center gap-2 w-full px-3 py-2"
              style={{
                background: "transparent",
                border: "none",
                borderRadius: "var(--vp-radius-md)",
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
                borderRadius: "var(--vp-radius-md)",
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
                borderRadius: "var(--vp-radius-md)",
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
