import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "../../stores/uiStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useBrowserStore } from "../../stores/browserStore";
import { useEditorStore } from "../../stores/editorStore";
import { Map, Plus, X, Globe, LayoutGrid, PlusCircle, Activity, FileCode2, Settings } from "lucide-react";
import { invoke } from "../../lib/ipc";
import { cleanupTerminal } from "../../lib/terminal/terminalCache";
import { UsagePanel } from "./UsagePanel";
import { useSettingsStore } from "../../stores/settingsStore";
import SettingsPanel from "../settings/SettingsPanel";
import { useConfirmStore } from "../../stores/confirmStore";
import { useWidgetStore } from "../../stores/widgetStore";
import { isMac } from "../../lib/platform";

export default function StatsBar() {
  const selectedProject = useUIStore((s) => s.selectedProject);
  const viewMode = useUIStore((s) => s.viewMode);
  const splitEnabled = useUIStore((s) => s.splitEnabled);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const draggingTab = useUIStore((s) => s.draggingTab);
  const setDraggingTab = useUIStore((s) => s.setDraggingTab);

  const workspaces = useUIStore((s) => s.workspaces);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const addWorkspace = useUIStore((s) => s.addWorkspace);
  const removeWorkspace = useUIStore((s) => s.removeWorkspace);
  const renameWorkspace = useUIStore((s) => s.renameWorkspace);
  const setActiveWorkspaceId = useUIStore((s) => s.setActiveWorkspaceId);
  const reorderWorkspaces = useUIStore((s) => s.reorderWorkspaces);
  const setWorkspaceEmoji = useUIStore((s) => s.setWorkspaceEmoji);

  const toggleWidgetMode = useUIStore((s) => s.toggleWidgetMode);
  const showWidgetCatalog = useUIStore((s) => s.showWidgetCatalog);
  const setShowWidgetCatalog = useUIStore((s) => s.setShowWidgetCatalog);

  const browserTabs = useBrowserStore((s) => s.tabs);
  const createLandingTab = useBrowserStore((s) => s.createLandingTab);

  const editorTabs = useEditorStore((s) => s.tabs);
  const hasEditorTabs = editorTabs.length > 0;

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const isWidgetMode = activeWorkspace?.useWidgetMode ?? false;

  const showSettingsPanel = useSettingsStore((s) => s.showSettingsPanel);
  const setShowSettingsPanel = useSettingsStore((s) => s.setShowSettingsPanel);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showUsagePanel, setShowUsagePanel] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);

  const [draggedWsId, setDraggedWsId] = useState<string | null>(null);
  const [dragOverWsId, setDragOverWsId] = useState<string | null>(null);
  const [emojiPickerWsId, setEmojiPickerWsId] = useState<string | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const EMOJI_OPTIONS = ["💻", "🚀", "🐛", "⭐", "🔥", "🎯", "📦", "🧪", "🎨", "⚡", "🔧", "📝"];

  // Close emoji picker on click outside
  useEffect(() => {
    if (!emojiPickerWsId) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPickerWsId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emojiPickerWsId]);

  const startPos = useRef<{ x: number; y: number } | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);

  /* ── Missions tab click ── */
  const handleMissionsClick = () => {
    if (isDragging.current) return;
    setViewMode("missions");
  };

  /* ── Workspace tab click ── */
  const handleWorkspaceClick = (wsId: string) => {
    setActiveWorkspaceId(wsId);
    if (viewMode === "missions" || viewMode === "browser" || viewMode === "editor") {
      if (splitEnabled) {
        setViewMode("split");
      } else {
        setViewMode("terminal");
      }
    }
  };

  /* ── Add new workspace ── */
  const handleAddWorkspace = () => {
    const nextNum = workspaces.length + 1;
    const id = `ws-${Date.now()}`;
    addWorkspace({ id, name: `Workspace ${nextNum}` });
    if (viewMode === "missions" || viewMode === "editor") {
      if (splitEnabled) {
        setViewMode("split");
      } else {
        setViewMode("terminal");
      }
    }
  };

  /* ── Drag (only Tasks tab) ── */
  const createGhost = (label: string) => {
    const el = document.createElement("div");
    el.textContent = label;
    el.style.cssText = `
      position: fixed; z-index: 99999; pointer-events: none;
      background: var(--vp-bg-tertiary); color: var(--vp-text-primary); padding: 6px 14px;
      border-radius: 8px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--vp-border-medium);
      box-shadow: 0 4px 12px var(--vp-bg-overlay);
      transform: translate(-50%, -50%);
      font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
    `;
    document.body.appendChild(el);
    return el;
  };

  const handleMissionsMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      startPos.current = { x: e.clientX, y: e.clientY };
      isDragging.current = false;

      const onMouseMove = (ev: MouseEvent) => {
        if (!startPos.current) return;
        const dx = ev.clientX - startPos.current.x;
        const dy = ev.clientY - startPos.current.y;
        if (!isDragging.current && Math.sqrt(dx * dx + dy * dy) > 5) {
          isDragging.current = true;
          setDraggingTab("missions");
          ghostRef.current = createGhost("Missions");
        }
        if (isDragging.current && ghostRef.current) {
          ghostRef.current.style.left = ev.clientX + "px";
          ghostRef.current.style.top = ev.clientY + "px";
        }
      };

      const onMouseUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (ghostRef.current) {
          document.body.removeChild(ghostRef.current);
          ghostRef.current = null;
        }
        if (isDragging.current) {
          document.dispatchEvent(
            new CustomEvent("praxis-tab-drop", {
              detail: { tab: "missions", x: ev.clientX, y: ev.clientY },
            })
          );
        }
        setDraggingTab(null);
        startPos.current = null;
        setTimeout(() => {
          isDragging.current = false;
        }, 0);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [setDraggingTab]
  );

  /* ── Inline rename ── */
  const startRename = (id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
    setTimeout(() => editRef.current?.select(), 0);
  };

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      renameWorkspace(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  /* ── Active states ── */
  const isMissionsActive = viewMode === "missions";
  const isTerminalView = viewMode === "terminal" || viewMode === "split";

  return (
    <div
      className="flex items-center gap-4 select-none shrink-0"
      style={{
        height: 52,
        background: "transparent",
        position: "relative",
        zIndex: 2,
        paddingLeft: isMac() ? 78 : 20,
        paddingRight: 20,
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      {/* Project name */}
      <span
        style={{
          color: "var(--vp-text-primary)",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          marginRight: 4,
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties}
      >
        {selectedProject?.name ?? "Praxis"}
      </span>

      {/* Tab bar */}
      <div
        className="flex items-center"
        style={{
          background: "var(--vp-bg-surface)",
          borderRadius: 12,
          padding: 4,
          gap: 3,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties}
      >
        {/* Missions tab (draggable) */}
        <button
          onClick={handleMissionsClick}
          onMouseDown={handleMissionsMouseDown}
          className="flex items-center gap-2 px-4 py-2"
          style={{
            background: isMissionsActive ? "var(--vp-border-light)" : "transparent",
            border: isMissionsActive
              ? "1px solid var(--vp-border-medium)"
              : "1px solid var(--vp-bg-surface-hover)",
            borderRadius: 9,
            cursor: "grab",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            opacity: draggingTab === "missions" ? 0.4 : 1,
            userSelect: "none",
            minWidth: 80,
          }}
        >
          <Map
            size={13}
            style={{
              color: isMissionsActive ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
              transition: "color 0.2s",
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: isMissionsActive ? 500 : 400,
              color: isMissionsActive ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
              transition: "color 0.2s",
              pointerEvents: "none",
            }}
          >
            Missions
          </span>
        </button>

        {/* Browser button */}
        <div
          style={{
            width: 1,
            height: 20,
            background: "var(--vp-border-subtle)",
            margin: "0 2px",
            flexShrink: 0,
          }}
        />
        <button
          onClick={() => {
            if (viewMode === "browser") return;
            if (browserTabs.length === 0) createLandingTab();
            setViewMode("browser" as any);
          }}
          className="flex items-center gap-2 px-4 py-2"
          style={{
            background: viewMode === "browser" ? "var(--vp-accent-blue-bg-hover)" : "transparent",
            border: viewMode === "browser"
              ? "1px solid var(--vp-accent-blue-border)"
              : "1px solid var(--vp-bg-surface-hover)",
            borderRadius: 9,
            cursor: "pointer",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            userSelect: "none",
            minWidth: 80,
          }}
          onMouseEnter={(e) => {
            if (viewMode !== "browser") {
              e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
              e.currentTarget.style.borderColor = "var(--vp-border-medium)";
            }
          }}
          onMouseLeave={(e) => {
            if (viewMode !== "browser") {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--vp-bg-surface-hover)";
            }
          }}
        >
          <Globe
            size={13}
            style={{
              color: viewMode === "browser" ? "var(--vp-accent-blue)" : "var(--vp-text-dim)",
              transition: "color 0.2s",
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: viewMode === "browser" ? 500 : 400,
              color: viewMode === "browser" ? "var(--vp-accent-blue)" : "var(--vp-text-dim)",
              transition: "color 0.2s",
              pointerEvents: "none",
            }}
          >
            Browser
          </span>
        </button>

        {/* Editor tab — visible when files are open */}
        {hasEditorTabs && (
          <>
            <div
              style={{
                width: 1,
                height: 20,
                background: "var(--vp-border-subtle)",
                margin: "0 2px",
                flexShrink: 0,
              }}
            />
            <button
              onClick={() => setViewMode("editor")}
              className="flex items-center gap-2 px-4 py-2"
              style={{
                background: viewMode === "editor" ? "rgba(74,222,128,0.12)" : "transparent",
                border: viewMode === "editor"
                  ? "1px solid rgba(74,222,128,0.35)"
                  : "1px solid var(--vp-bg-surface-hover)",
                borderRadius: 9,
                cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                userSelect: "none",
                minWidth: 80,
              }}
              onMouseEnter={(e) => {
                if (viewMode !== "editor") {
                  e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                  e.currentTarget.style.borderColor = "var(--vp-border-medium)";
                }
              }}
              onMouseLeave={(e) => {
                if (viewMode !== "editor") {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "var(--vp-bg-surface-hover)";
                }
              }}
            >
              <FileCode2
                size={13}
                style={{
                  color: viewMode === "editor" ? "var(--vp-accent-green)" : "var(--vp-text-dim)",
                  transition: "color 0.2s",
                  pointerEvents: "none",
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: viewMode === "editor" ? 500 : 400,
                  color: viewMode === "editor" ? "var(--vp-accent-green)" : "var(--vp-text-dim)",
                  transition: "color 0.2s",
                  pointerEvents: "none",
                }}
              >
                Editor
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: viewMode === "editor" ? "rgba(74,222,128,0.6)" : "var(--vp-text-subtle)",
                  pointerEvents: "none",
                }}
              >
                {editorTabs.length}
              </span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  borderRadius: 5,
                  cursor: "pointer",
                  flexShrink: 0,
                  pointerEvents: "auto",
                  transition: "all 0.15s",
                  background: "var(--vp-bg-surface)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--vp-accent-red-border)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--vp-bg-surface)";
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const store = useEditorStore.getState();
                  // Close all editor tabs
                  for (const tab of [...store.tabs]) {
                    store.closeFile(tab.filePath);
                  }
                  if (viewMode === "editor") {
                    setViewMode(store.previousViewMode as any || "terminal");
                  }
                }}
              >
                <X size={11} style={{ color: "var(--vp-text-muted)" }} />
              </div>
            </button>
          </>
        )}

        {/* Workspace separator */}
        {workspaces.length > 0 && (
          <div
            style={{
              width: 1,
              height: 20,
              background: "var(--vp-border-subtle)",
              margin: "0 2px",
              flexShrink: 0,
            }}
          />
        )}

        {/* Workspace tabs — scrollable container */}
        <div
          className="flex items-center ws-scroll-container"
          style={{
            gap: 3,
            overflowX: "auto",
            scrollbarWidth: "none",
            flex: 1,
            minWidth: 0,
          }}
          onWheel={(e) => { e.currentTarget.scrollLeft += e.deltaY; }}
        >
          <style>{`.ws-scroll-container::-webkit-scrollbar { display: none; }`}</style>
        {workspaces.map((ws) => {
          const isActive = isTerminalView && activeWorkspaceId === ws.id;
          const isEditing = editingId === ws.id;
          const color = ws.color;
          const isDraggedOver = dragOverWsId === ws.id && draggedWsId !== ws.id;

          return (
            <div key={ws.id} style={{ position: "relative", flexShrink: 0 }}>
            <button
              draggable={true}
              onDragStart={(e) => {
                setDraggedWsId(ws.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverWsId(ws.id);
              }}
              onDragLeave={() => {
                if (dragOverWsId === ws.id) setDragOverWsId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedWsId && draggedWsId !== ws.id) {
                  reorderWorkspaces(draggedWsId, ws.id);
                }
                setDraggedWsId(null);
                setDragOverWsId(null);
              }}
              onDragEnd={() => {
                setDraggedWsId(null);
                setDragOverWsId(null);
              }}
              onClick={() => handleWorkspaceClick(ws.id)}
              onDoubleClick={() => startRename(ws.id, ws.name)}
              className="flex items-center gap-2 px-4 py-2 group"
              style={{
                background: isActive ? `${color}20` : "transparent",
                border: `1px solid ${isActive ? `${color}50` : "var(--vp-bg-surface-hover)"}`,
                borderLeft: isDraggedOver ? `3px solid ${color}` : undefined,
                borderRadius: 9,
                cursor: "grab",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                userSelect: "none",
                minWidth: 90,
                maxWidth: 200,
                opacity: draggedWsId === ws.id ? 0.4 : 1,
              }}
            >
              {/* Emoji area */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEmojiPickerWsId(emojiPickerWsId === ws.id ? null : ws.id);
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                {ws.emoji ? (
                  <span style={{ fontSize: 13, lineHeight: 1 }}>{ws.emoji}</span>
                ) : (
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: color,
                      opacity: isActive ? 1 : 0.4,
                      transition: "opacity 0.2s",
                    }}
                  />
                )}
              </div>
              {isEditing ? (
                <input
                  ref={editRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--vp-text-primary)",
                    background: "var(--vp-border-subtle)",
                    border: "1px solid var(--vp-border-medium)",
                    borderRadius: 5,
                    outline: "none",
                    padding: "1px 6px",
                    width: 110,
                    fontFamily: "inherit",
                  }}
                  autoFocus
                />
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? color : "var(--vp-text-dim)",
                    transition: "color 0.2s",
                    pointerEvents: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ws.name}
                </span>
              )}
              {workspaces.length > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    cursor: "pointer",
                    flexShrink: 0,
                    pointerEvents: "auto",
                    transition: "all 0.15s",
                    background: "var(--vp-bg-surface)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--vp-accent-red-border)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--vp-bg-surface)";
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    useConfirmStore.getState().showConfirm("Close Workspace", "Close this workspace and all its terminals?", () => {
                      // Kill all PTY processes in this workspace before removing
                      const uiState = useUIStore.getState();
                      const tsState = useTerminalStore.getState();
                      const groupIds = uiState.terminalGroups[ws.id] || [];
                      const sessions = tsState.sessions.filter((s) => s.workspaceId === ws.id);
                      for (const session of sessions) {
                        invoke("close_pty", { id: session.id }).catch(() => {});
                        cleanupTerminal(session.id);
                        tsState.removeSession(session.id);
                      }
                      removeWorkspace(ws.id);
                    }, { danger: true });
                  }}
                >
                  <X size={11} style={{ color: "var(--vp-text-muted)" }} />
                </div>
              )}
            </button>
            {/* Emoji picker popup */}
            {emojiPickerWsId === ws.id && (
              <div
                ref={emojiPickerRef}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "var(--vp-bg-surface)",
                  border: "1px solid var(--vp-border-light)",
                  borderRadius: 8,
                  padding: 6,
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 2,
                  zIndex: 100,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                }}
              >
                {EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={(e) => {
                      e.stopPropagation();
                      setWorkspaceEmoji(ws.id, emoji);
                      setEmojiPickerWsId(null);
                    }}
                    style={{
                      width: 28,
                      height: 28,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      background: "transparent",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            </div>
          );
        })}
        </div>

        {/* Add workspace button — outside scroll, always visible */}
        <button
          onClick={handleAddWorkspace}
          className="flex items-center justify-center"
          title="New Workspace"
          style={{
            color: "var(--vp-text-dim)",
            width: 30,
            height: 30,
            borderRadius: 8,
            border: "1px solid var(--vp-bg-surface-hover)",
            background: "transparent",
            cursor: "pointer",
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--vp-text-primary)";
            e.currentTarget.style.background = "var(--vp-border-subtle)";
            e.currentTarget.style.borderColor = "var(--vp-border-medium)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--vp-text-dim)";
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "var(--vp-bg-surface-hover)";
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Widget mode controls */}
      <div className="ml-auto flex items-center gap-2" style={{ position: "relative", flexShrink: 0, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {/* Usage panel toggle */}
        <button
          onClick={() => setShowUsagePanel(!showUsagePanel)}
          className="flex items-center justify-center"
          title="AI Usage Monitor"
          style={{
            width: 32,
            height: 32,
            background: showUsagePanel ? "var(--vp-accent-blue-bg-hover)" : "transparent",
            border: `1px solid ${showUsagePanel ? "var(--vp-accent-blue-border)" : "var(--vp-bg-surface-hover)"}`,
            borderRadius: 7,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!showUsagePanel) {
              e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
              e.currentTarget.style.borderColor = "var(--vp-border-medium)";
            }
          }}
          onMouseLeave={(e) => {
            if (!showUsagePanel) {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--vp-bg-surface-hover)";
            }
          }}
        >
          <Activity size={14} style={{ color: showUsagePanel ? "var(--vp-accent-blue)" : "var(--vp-text-faint)" }} />
        </button>

        {showUsagePanel && <UsagePanel onClose={() => setShowUsagePanel(false)} />}

        {/* Settings gear */}
        <button
          onClick={() => setShowSettingsPanel(!showSettingsPanel)}
          className="flex items-center justify-center"
          title="Settings"
          style={{
            width: 32,
            height: 32,
            background: showSettingsPanel ? "var(--vp-accent-blue-bg-hover)" : "transparent",
            border: `1px solid ${showSettingsPanel ? "var(--vp-accent-blue-border)" : "var(--vp-bg-surface-hover)"}`,
            borderRadius: 7,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!showSettingsPanel) {
              e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
              e.currentTarget.style.borderColor = "var(--vp-border-medium)";
            }
          }}
          onMouseLeave={(e) => {
            if (!showSettingsPanel) {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--vp-bg-surface-hover)";
            }
          }}
        >
          <Settings size={14} style={{ color: showSettingsPanel ? "var(--vp-accent-blue)" : "var(--vp-text-faint)" }} />
        </button>

        {/* Settings modal */}
        <SettingsPanel />

        {/* Customize — enters widget mode (permanent) or toggles catalog; hidden on browser/tasks */}
        {activeWorkspaceId && viewMode !== "browser" && viewMode !== "missions" && (
          <button
            onClick={() => {
              if (!isWidgetMode) {
                // Auto-add terminal widget when entering widget mode from terminal/split view
                if (viewMode === "terminal" || viewMode === "split") {
                  useWidgetStore.getState().addWidget(activeWorkspaceId, "terminal");
                }
                toggleWidgetMode(activeWorkspaceId);
                setShowWidgetCatalog(true);
              } else {
                setShowWidgetCatalog(!showWidgetCatalog);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5"
            title={isWidgetMode
              ? (showWidgetCatalog ? "Close widget panel" : "Open widget panel")
              : "Switch to customizable widget layout"}
            style={{
              background: showWidgetCatalog && isWidgetMode
                ? "var(--vp-accent-blue-bg-hover)"
                : isWidgetMode
                  ? "var(--vp-accent-blue-bg)"
                  : "transparent",
              border: `1px solid ${isWidgetMode ? "var(--vp-accent-blue-border)" : "var(--vp-bg-surface-hover)"}`,
              borderRadius: 7,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (!isWidgetMode) {
                e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                e.currentTarget.style.borderColor = "var(--vp-border-medium)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isWidgetMode) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--vp-bg-surface-hover)";
              }
            }}
          >
            <LayoutGrid size={12} style={{ color: isWidgetMode ? "var(--vp-accent-blue)" : "var(--vp-text-faint)" }} />
            <span style={{ fontSize: 11, color: isWidgetMode ? "var(--vp-accent-blue)" : "var(--vp-text-faint)", fontWeight: isWidgetMode ? 500 : 400 }}>
              {isWidgetMode ? (showWidgetCatalog ? "Done" : "Customize") : "Customize"}
            </span>
          </button>
        )}


        {/* Branding */}
        <span
          style={{
            color: "var(--vp-text-subtle)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.02em",
            marginLeft: 8,
          }}
        >
          Praxis
        </span>
      </div>
    </div>
  );
}
