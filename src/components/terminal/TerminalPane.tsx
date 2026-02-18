import { useEffect, useRef, useState, useCallback } from "react";
import { Columns2, Rows2, Plus, Hand, Terminal } from "lucide-react";
import { useTerminalStore } from "../../stores/terminalStore";
import { useUIStore } from "../../stores/uiStore";
import { invoke, send } from "../../lib/ipc";
import { getOrCreateTerminal, activateWebGL } from "../../lib/terminal/terminalCache";
import { setupPtyConnection } from "../../lib/terminal/ptyConnection";
import { swapPanes, replaceSession } from "../../lib/layout/layoutUtils";
import { LAYOUT_PRESETS } from "../../lib/layout/layoutPresets";
import { PANE_DRAG_MIME, type PaneDragData } from "../../types/layout";
import "@xterm/xterm/css/xterm.css";

/** Bracket paste escape sequences — wraps pasted text so TUI apps treat it as paste */
const BRACKET_PASTE_START = "\x1b[200~";
const BRACKET_PASTE_END = "\x1b[201~";

/** Save image File to temp, return path */
async function saveImageToTemp(file: File): Promise<string> {
  const ext = file.type === "image/jpeg" ? "jpg" : "png";
  const arrayBuf = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuf);
  // Convert in 8KB chunks instead of byte-by-byte for performance
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length))));
  }
  const base64 = btoa(chunks.join(""));
  const tmpDir = (window as any).electronAPI.getTempDir();
  const filePath = `${tmpDir}/praxis-drop-${Date.now()}.${ext}`;
  (window as any).electronAPI.writeFileBinary(filePath, base64);
  return filePath;
}

/** Write text to PTY using bracket paste mode */
function pasteToTerminal(sessionId: string, text: string) {
  const data = BRACKET_PASTE_START + text + BRACKET_PASTE_END;
  try { send("write_pty", { id: sessionId, data }); } catch { invoke("write_pty", { id: sessionId, data }).catch(() => {}); }
}

/** Miniature grid icon for layout presets */
function PresetIconSmall({ grid }: { grid: string[][] }) {
  const rows = grid.length;
  const cols = Math.max(...grid.map((r) => r.length));
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
        width: 16,
        height: 12,
        gap: 1,
        flexShrink: 0,
      }}
    >
      {grid.flatMap((row, ri) =>
        row.map((cell, ci) => {
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
                opacity: 0.6,
              }}
            />
          );
        })
      )}
    </div>
  );
}

interface TerminalPaneProps {
  sessionId: string | null;
  isFocused: boolean;
}

export default function TerminalPane({ sessionId, isFocused }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<ReturnType<typeof getOrCreateTerminal> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [hovered, setHovered] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileDragOver, setFileDragOver] = useState(false);

  const setActiveSession = useTerminalStore((s) => s.setActiveSession);
  const setFocusedPane = useUIStore((s) => s.setFocusedPane);
  const setSplitSpawnContext = useUIStore((s) => s.setSplitSpawnContext);
  const setShowSpawnDialog = useUIStore((s) => s.setShowSpawnDialog);
  const draggingPaneSessionId = useUIStore((s) => s.draggingPaneSessionId);
  const setDraggingPaneSessionId = useUIStore((s) => s.setDraggingPaneSessionId);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const activeTerminalGroup = useUIStore((s) => s.activeTerminalGroup);
  const workspaceLayouts = useUIStore((s) => s.workspaceLayouts);

  const someoneIsDragging = draggingPaneSessionId !== null;
  const isDragging = draggingPaneSessionId === sessionId;

  const handleFocus = () => {
    if (sessionId) {
      setFocusedPane(sessionId);
      setActiveSession(sessionId);
    }
  };

  const handleSplit = (direction: "horizontal" | "vertical") => {
    if (sessionId) {
      setSplitSpawnContext({ sessionId, direction });
      setShowSpawnDialog(true);
    }
  };

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!sessionId) return;
      const ui = useUIStore.getState();
      const wsId = ui.activeWorkspaceId;
      if (!wsId) return;
      const groups = ui.terminalGroups[wsId] || [];
      const groupId = ui.activeTerminalGroup[wsId] || groups[0];

      const data: PaneDragData = {
        sessionId,
        sourceGroupId: groupId || "",
        sourceWorkspaceId: wsId,
      };
      e.dataTransfer.setData(PANE_DRAG_MIME, JSON.stringify(data));
      e.dataTransfer.effectAllowed = "move";

      // Register global dragend cleanup BEFORE the drag handle is unmounted.
      // The toolbar is hidden when someoneIsDragging becomes true (via setTimeout below),
      // which removes the drag handle from DOM — so the element-level onDragEnd never fires.
      // This document-level listener ensures state is always cleaned up.
      const cleanupDragEnd = () => {
        useUIStore.getState().setDraggingPaneSessionId(null);
        document.removeEventListener("dragend", cleanupDragEnd);
      };
      document.addEventListener("dragend", cleanupDragEnd);

      setTimeout(() => setDraggingPaneSessionId(sessionId), 0);
    },
    [sessionId, setDraggingPaneSessionId]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingPaneSessionId(null);
    setDragOver(false);
  }, [setDraggingPaneSessionId]);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggingPaneSessionId && draggingPaneSessionId !== sessionId) {
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }
    },
    [draggingPaneSessionId, sessionId]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const raw = e.dataTransfer.getData(PANE_DRAG_MIME);
      if (!raw || !sessionId) return;

      let data: PaneDragData;
      try { data = JSON.parse(raw); } catch { return; }
      if (data.sessionId === sessionId) return;

      const ui = useUIStore.getState();
      const wsId = ui.activeWorkspaceId;
      if (!wsId) return;
      const groups = ui.terminalGroups[wsId] || [];
      const activeGroupId = ui.activeTerminalGroup[wsId] || groups[0];
      if (!activeGroupId) return;

      if (data.sourceGroupId === activeGroupId) {
        // Same group: simple swap
        const layout = ui.workspaceLayouts[activeGroupId];
        if (layout) {
          ui.setWorkspaceLayout(activeGroupId, swapPanes(layout, data.sessionId, sessionId));
        }
      } else {
        // Cross-group: swap session IDs between the two layout trees
        const sourceLayout = ui.workspaceLayouts[data.sourceGroupId];
        const targetLayout = ui.workspaceLayouts[activeGroupId];
        if (sourceLayout && targetLayout) {
          const newSource = replaceSession(sourceLayout, data.sessionId, sessionId);
          const newTarget = replaceSession(targetLayout, sessionId, data.sessionId);
          ui.setWorkspaceLayout(data.sourceGroupId, newSource);
          ui.setWorkspaceLayout(activeGroupId, newTarget);
        }
      }
      setDraggingPaneSessionId(null);
    },
    [sessionId, setDraggingPaneSessionId]
  );

  // ── File drag detection: only on THIS pane via native listeners on outer div ──
  const outerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = outerRef.current;
    if (!el || !sessionId) return;

    let enterCount = 0;

    const onDragEnter = (e: DragEvent) => {
      if (draggingPaneSessionId) return;
      const types = e.dataTransfer?.types || [];
      if (types.includes("Files") || types.includes("public.file-url")) {
        enterCount++;
        setFileDragOver(true);
      }
    };

    const onDragLeave = () => {
      enterCount--;
      if (enterCount <= 0) {
        enterCount = 0;
        setFileDragOver(false);
      }
    };

    const onDrop = () => {
      enterCount = 0;
      setFileDragOver(false);
    };

    el.addEventListener("dragenter", onDragEnter);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragenter", onDragEnter);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [sessionId, draggingPaneSessionId]);

  // Re-fit terminal when focus changes (switching between terminals)
  useEffect(() => {
    if (isFocused && terminalRef.current) {
      requestAnimationFrame(() => {
        try { terminalRef.current?.fitAddon.fit(); } catch {}
      });
    }
  }, [isFocused]);

  // Main terminal setup effect
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !sessionId) {
      return;
    }

    // Get or create terminal instance from shared cache
    const { terminal, fitAddon, searchAddon } = getOrCreateTerminal(sessionId);
    terminalRef.current = { terminal, fitAddon, searchAddon };

    // Mount terminal to DOM
    if (!terminal.element) {
      terminal.open(container);
    } else if (!container.contains(terminal.element)) {
      // Clear any stale children safely before re-attaching
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      container.appendChild(terminal.element);
    }

    // Fit terminal + activate WebGL after mount.
    // Multiple fit attempts to handle layout not being settled yet (black screen fix).
    const fitWithRetry = () => {
      // Skip if container has no dimensions yet (layout not settled)
      if (container.offsetWidth === 0 || container.offsetHeight === 0) return;
      try { fitAddon.fit(); } catch {}
    };
    requestAnimationFrame(() => {
      fitWithRetry();
      activateWebGL(sessionId);
    });
    // Retry fits to handle cases where container dimensions aren't ready yet
    const retryTimers = [
      setTimeout(fitWithRetry, 50),
      setTimeout(fitWithRetry, 150),
      setTimeout(fitWithRetry, 400),
    ];

    // Set up PTY ↔ xterm connection with flow control (shared helper)
    setupPtyConnection({ sessionId, terminal });

    // Handle image paste on xterm's internal textarea
    const xtermTextarea = terminal.element?.querySelector("textarea");
    const pasteHandler = async (e: ClipboardEvent) => {
      const hasImage = e.clipboardData?.items
        ? Array.from(e.clipboardData.items).some((i) => i.type.startsWith("image/"))
        : false;

      if (hasImage) {
        e.preventDefault();
        e.stopPropagation();
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const blob = item.getAsFile();
            if (!blob) continue;
            const filePath = await saveImageToTemp(blob);
            pasteToTerminal(sessionId, filePath);
            return;
          }
        }
      }
    };

    if (xtermTextarea) {
      xtermTextarea.addEventListener("paste", pasteHandler as unknown as EventListener);
    }

    // Resize observer
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    resizeObserverRef.current = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try { fitAddon.fit(); } catch {}
      }, 150);
    });
    resizeObserverRef.current.observe(container);

    return () => {
      retryTimers.forEach(clearTimeout);
      resizeObserverRef.current?.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      if (xtermTextarea) {
        xtermTextarea.removeEventListener("paste", pasteHandler as unknown as EventListener);
      }
      // Detach xterm element from container so it doesn't leak into other workspaces.
      // Use try/catch to guard against React already having removed the DOM node.
      try {
        if (terminal.element && container.contains(terminal.element)) {
          container.removeChild(terminal.element);
        }
      } catch {
        // Node already removed by React — safe to ignore
      }
    };
  }, [sessionId]);

  const handleDropOnEmpty = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const raw = e.dataTransfer.getData(PANE_DRAG_MIME);
      if (!raw) return;

      let data: PaneDragData;
      try { data = JSON.parse(raw); } catch { return; }

      const ui = useUIStore.getState();
      const wsId = ui.activeWorkspaceId;
      if (!wsId) return;
      const groups = ui.terminalGroups[wsId] || [];
      const activeGroupId = ui.activeTerminalGroup[wsId] || groups[0];
      if (!activeGroupId) return;

      if (data.sourceGroupId === activeGroupId) {
        // Same group: swap the dragged session with null (move to empty slot)
        const layout = ui.workspaceLayouts[activeGroupId];
        if (layout) {
          // Use replaceSession to put the dragged session into the null slot
          // and null out the source — effectively swapPanes but with null support
          const temp = `__temp_${Date.now()}`;
          let newLayout = replaceSession(layout, data.sessionId, temp);
          // Find first null leaf and fill it with the dragged session
          if (newLayout.type === "leaf" && !newLayout.sessionId) {
            newLayout = { type: "leaf", sessionId: data.sessionId };
          } else {
            // Walk the tree: replace first null with data.sessionId, then replace temp with null
            const fillNull = (node: typeof newLayout): typeof newLayout => {
              if (node.type === "leaf") {
                if (!node.sessionId) return { type: "leaf", sessionId: data.sessionId };
                return node;
              }
              const left = fillNull(node.children[0]);
              if (left !== node.children[0]) return { ...node, children: [left, node.children[1]] };
              const right = fillNull(node.children[1]);
              if (right !== node.children[1]) return { ...node, children: [node.children[0], right] };
              return node;
            };
            newLayout = fillNull(newLayout);
          }
          newLayout = replaceSession(newLayout, temp, null);
          ui.setWorkspaceLayout(activeGroupId, newLayout);
        }
      } else {
        // Cross-group: move session from source group to this empty slot
        ui.moveSessionToGroup(data.sessionId, data.sourceGroupId, activeGroupId);
      }
      ui.setDraggingPaneSessionId(null);
    },
    []
  );

  if (!sessionId) {
    // Check if this is the initial empty state (single empty leaf, no splits)
    const groupId = activeWorkspaceId ? activeTerminalGroup[activeWorkspaceId] : undefined;
    const layout = groupId ? workspaceLayouts[groupId] : undefined;
    const isInitialEmpty = layout?.type === "leaf" && !layout.sessionId;

    const handlePresetSelect = (preset: typeof LAYOUT_PRESETS[number]) => {
      if (!activeWorkspaceId) return;
      const gid = activeTerminalGroup[activeWorkspaceId];
      if (!gid) return;
      useUIStore.getState().setWorkspaceLayout(gid, preset.createLayout());
    };

    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          position: "relative",
          background: "var(--vp-bg-primary)",
          border: dragOver ? "2px solid var(--vp-accent-blue-glow)" : "1px solid var(--vp-border-subtle)",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropOnEmpty}
      >
        {/* Drop overlay for empty pane */}
        {dragOver && (
          <div
            className="absolute inset-0 z-10"
            style={{
              background: "var(--vp-accent-blue-bg)",
              border: "2px dashed var(--vp-accent-blue-glow)",
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "var(--vp-accent-blue-glow)", fontSize: 12, fontWeight: 500 }}>
              Drop here
            </span>
          </div>
        )}
        {isInitialEmpty ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
            color: "var(--vp-text-faint)",
          }}>
            {/* New Terminal (single) */}
            <button
              onClick={() => setShowSpawnDialog(true)}
              className="flex items-center gap-2 px-4 py-2.5 text-xs"
              style={{
                color: "var(--vp-text-muted)",
                border: "1px solid var(--vp-border-light)",
                borderRadius: "var(--vp-radius-lg)",
                background: "var(--vp-bg-surface)",
                cursor: "pointer",
                transition: "all 0.2s",
                width: "100%",
                justifyContent: "center",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--vp-text-primary)";
                e.currentTarget.style.borderColor = "var(--vp-border-strong)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--vp-text-muted)";
                e.currentTarget.style.borderColor = "var(--vp-border-light)";
              }}
            >
              <Terminal size={14} />
              New Terminal
            </button>

            {/* Separator */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              color: "var(--vp-text-dim)", fontSize: 10,
            }}>
              <div style={{ flex: 1, height: 1, background: "var(--vp-border-light)" }} />
              <span>or choose a layout</span>
              <div style={{ flex: 1, height: 1, background: "var(--vp-border-light)" }} />
            </div>

            {/* Layout presets grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
              width: "100%",
            }}>
              {LAYOUT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset)}
                  className="flex items-center gap-2 px-3 py-2 text-xs"
                  style={{
                    color: "var(--vp-text-dim)",
                    border: "1px solid var(--vp-border-light)",
                    borderRadius: "var(--vp-radius-lg)",
                    background: "var(--vp-bg-surface)",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--vp-text-primary)";
                    e.currentTarget.style.borderColor = "var(--vp-border-strong)";
                    e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--vp-text-dim)";
                    e.currentTarget.style.borderColor = "var(--vp-border-light)";
                    e.currentTarget.style.background = "var(--vp-bg-surface)";
                  }}
                >
                  <PresetIconSmall grid={preset.iconGrid} />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", gap: 16, color: "var(--vp-text-faint)"
          }}>
            <button
              onClick={() => setShowSpawnDialog(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs"
              style={{
                color: "var(--vp-text-muted)",
                border: "1px solid var(--vp-border-light)",
                borderRadius: "var(--vp-radius-lg)",
                background: "var(--vp-bg-surface)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--vp-text-primary)";
                e.currentTarget.style.borderColor = "var(--vp-border-strong)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--vp-text-muted)";
                e.currentTarget.style.borderColor = "var(--vp-border-light)";
              }}
            >
              <Plus size={14} />
              New Terminal
            </button>
          </div>
        )}
      </div>
    );
  }

  let borderColor = "var(--vp-border-subtle)";
  if (dragOver) {
    borderColor = "var(--vp-accent-blue-glow)";
  } else if (isFocused) {
    borderColor = "var(--vp-accent-blue-glow)";
  }

  return (
    <div
      ref={outerRef}
      className="relative w-full h-full"
      style={{
        border: `2px solid ${borderColor}`,
        transition: "border-color 0.15s, opacity 0.15s",
        opacity: isDragging ? 0.4 : 1,
        overflow: "hidden",
      }}
      onClick={handleFocus}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Internal pane swap overlay */}
      {dragOver && (
        <div
          className="absolute inset-0 z-10"
          style={{
            background: "var(--vp-accent-blue-bg)",
            border: "2px dashed var(--vp-accent-blue-glow)",
            borderRadius: "var(--vp-radius-xs)",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "var(--vp-accent-blue-glow)", fontSize: 12, fontWeight: 500 }}>
            Drop to swap
          </span>
        </div>
      )}

      {/* File/image drop overlay — only on THIS terminal when files dragged over it */}
      {fileDragOver && !dragOver && (
        <DropOverlay
          sessionId={sessionId}
          onDone={() => setFileDragOver(false)}
        />
      )}

      {/* Toolbar: keep in DOM during drag (isDragging) so onDragEnd fires.
          Visible when hovered and nobody is dragging, OR hidden-but-present when this pane is dragging. */}
      {(hovered || isDragging) && (
        <div
          className="absolute top-1 right-1 flex gap-1 z-10"
          style={{
            animation: !isDragging ? "fadeIn 0.15s ease" : undefined,
            opacity: isDragging ? 0 : someoneIsDragging ? 0 : 1,
            pointerEvents: isDragging || someoneIsDragging ? "none" : "auto",
          }}
        >
          <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            title="Drag to swap"
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: "var(--vp-radius-md)",
              background: "var(--vp-bg-overlay)",
              border: "1px solid var(--vp-border-medium)",
              color: "var(--vp-text-secondary)",
              cursor: "grab",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-text-primary)";
              e.currentTarget.style.background = "var(--vp-border-medium)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-secondary)";
              e.currentTarget.style.background = "var(--vp-bg-overlay)";
            }}
          >
            <Hand size={12} />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleSplit("horizontal"); }}
            title="Split Right"
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: "var(--vp-radius-md)",
              background: "var(--vp-bg-overlay)",
              border: "1px solid var(--vp-border-medium)",
              color: "var(--vp-text-secondary)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-text-primary)";
              e.currentTarget.style.background = "var(--vp-accent-blue-border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-secondary)";
              e.currentTarget.style.background = "var(--vp-bg-overlay)";
            }}
          >
            <Columns2 size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleSplit("vertical"); }}
            title="Split Down"
            className="flex items-center justify-center"
            style={{
              width: 24,
              height: 24,
              borderRadius: "var(--vp-radius-md)",
              background: "var(--vp-bg-overlay)",
              border: "1px solid var(--vp-border-medium)",
              color: "var(--vp-text-secondary)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-text-primary)";
              e.currentTarget.style.background = "var(--vp-accent-blue-border)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-secondary)";
              e.currentTarget.style.background = "var(--vp-bg-overlay)";
            }}
          >
            <Rows2 size={12} />
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ background: "var(--vp-bg-primary)", minHeight: 80, overflow: "hidden" }}
      />
    </div>
  );
}

/**
 * Transparent overlay that captures file/image drops via native DOM events.
 * Mounts on top of xterm canvas only on the terminal being dragged over.
 */
/**
 * Transparent overlay that captures file/image drops via native DOM events.
 * Mounts on top of xterm canvas only on the terminal being dragged over.
 */
function DropOverlay({ sessionId, onDone }: { sessionId: string | null; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const dt = e.dataTransfer;
      if (!sessionId || !dt) {
        onDoneRef.current();
        return;
      }

      // Find image or file
      let imageFile: File | null = null;
      let filePath: string | null = null;

      if (dt.files && dt.files.length > 0) {
        const f = dt.files[0];
        if (f.type.startsWith("image/")) imageFile = f;
        else filePath = (f as any).path || null;
      }

      if (!imageFile && !filePath && dt.items) {
        for (const item of Array.from(dt.items)) {
          if (item.kind === "file") {
            const f = item.getAsFile();
            if (!f) continue;
            if (f.type.startsWith("image/")) { imageFile = f; break; }
            filePath = (f as any).path || null;
            if (filePath) break;
          }
        }
      }

      if (imageFile) {
        try {
          const savedPath = await saveImageToTemp(imageFile);
          pasteToTerminal(sessionId, savedPath);
        } catch (err) {
          console.error("[DropOverlay] save failed:", err);
        }
      } else if (filePath) {
        pasteToTerminal(sessionId, filePath);
      }

      onDoneRef.current();
    };

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("drop", onDrop);
    };
  }, [sessionId]);

  // Safety: auto-hide after 6 seconds
  useEffect(() => {
    const timer = setTimeout(() => onDoneRef.current(), 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        background: "rgba(74, 222, 128, 0.08)",
        border: "2px dashed var(--vp-accent-green)",
        borderRadius: "var(--vp-radius-xs)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "copy",
      }}
    >
      <span style={{ color: "var(--vp-accent-green)", fontSize: 12, fontWeight: 500, pointerEvents: "none" }}>
        Drop image / file
      </span>
    </div>
  );
}
