import { useEffect, useRef, useState, useCallback } from "react";
import { Columns2, Rows2, Plus, Hand } from "lucide-react";
import { useTerminalStore } from "../../stores/terminalStore";
import { useUIStore } from "../../stores/uiStore";
import { invoke, listen } from "../../lib/ipc";
import { getOrCreateTerminal, activateWebGL } from "../../lib/terminal/terminalCache";
import { swapPanes } from "../../lib/layout/layoutUtils";
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
  invoke("write_pty", { id: sessionId, data: BRACKET_PASTE_START + text + BRACKET_PASTE_END }).catch(() => {});
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
      e.dataTransfer.setData("text/plain", sessionId);
      e.dataTransfer.effectAllowed = "move";
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

      // Internal pane swap only — file drops are handled by DropOverlay
      const draggedId = e.dataTransfer.getData("text/plain");
      if (!draggedId || !sessionId || draggedId === sessionId) return;

      const ui = useUIStore.getState();
      const wsId = ui.activeWorkspaceId;
      if (!wsId) return;
      const groups = ui.terminalGroups[wsId] || [];
      const activeGroupId = ui.activeTerminalGroup[wsId] || groups[0];
      if (!activeGroupId) return;

      const layout = ui.workspaceLayouts[activeGroupId];
      if (!layout) return;

      const newLayout = swapPanes(layout, draggedId, sessionId);
      ui.setWorkspaceLayout(activeGroupId, newLayout);
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
      container.innerHTML = "";
      container.appendChild(terminal.element);
    }

    // Fit terminal + activate WebGL after mount
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {}
      activateWebGL(sessionId);
    });

    // Set up PTY connection if not already connected
    const ptyKey = `__pty_${sessionId}`;
    if (!(terminal as any)[ptyKey]) {
      (terminal as any)[ptyKey] = true;

      // Single PTY output listener: write to xterm + track activity
      let lastMark = 0;
      let pendingBytes = 0;
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flushOutput = () => {
        if (pendingBytes > 0) {
          useTerminalStore.getState().markOutput(sessionId!, pendingBytes);
          pendingBytes = 0;
          lastMark = Date.now();
        }
      };
      const unsubOutput = listen(`pty-output-${sessionId}`, (data: string) => {
        terminal.write(data);
        pendingBytes += (typeof data === "string" ? data.length : 0);
        const now = Date.now();
        if (now - lastMark > 200) {
          flushOutput();
        } else {
          // Schedule trailing flush to capture the last batch
          if (flushTimer) clearTimeout(flushTimer);
          flushTimer = setTimeout(flushOutput, 250);
        }
      });

      const unsubExit = listen(`pty-exit-${sessionId}`, (info?: { exitCode: number; signal?: number }) => {
        const store = useTerminalStore.getState();
        const session = store.sessions.find((s) => s.id === sessionId);
        const isShell = session?.agentType === "shell";

        if (!isShell) {
          const shellCwd = session?.projectPath || "~";
          terminal.write("\r\n\x1b[90m[Process exited — starting shell...]\x1b[0m\r\n\r\n");
          invoke<{ id: string; cwd: string }>("spawn_pty", {
            id: sessionId,
            cmd: "/bin/zsh",
            args: [],
            cwd: shellCwd,
          }).then((res) => {
            const actualCwd = res?.cwd || shellCwd;
            store.updateSession(sessionId!, {
              agentType: "shell",
              title: `Shell@${actualCwd.split("/").pop() || actualCwd}`,
              projectPath: actualCwd,
            });
          }).catch(() => {
            terminal.write("\x1b[91m[Failed to start shell]\x1b[0m\r\n");
          });
        } else {
          const code = info?.exitCode ?? -1;
          const sig = info?.signal;
          const details = sig ? `signal=${sig}` : `code=${code}`;
          terminal.write(`\r\n\x1b[90m[Shell exited: ${details}]\x1b[0m\r\n`);
        }
      });

      const dataDisposable = terminal.onData((data) => {
        invoke("write_pty", { id: sessionId, data }).catch(() => {});
        useTerminalStore.getState().markUserInput(sessionId!);
      });

      const resizeDisposable = terminal.onResize(({ cols, rows }) => {
        invoke("resize_pty", { id: sessionId, cols, rows }).catch(() => {});
      });

      invoke("resize_pty", {
        id: sessionId,
        cols: terminal.cols,
        rows: terminal.rows
      }).catch(() => {});

      (terminal as any)[`${ptyKey}_cleanup`] = () => {
        unsubOutput();
        unsubExit();
        dataDisposable.dispose();
        resizeDisposable.dispose();
        delete (terminal as any)[ptyKey];
        delete (terminal as any)[`${ptyKey}_cleanup`];
      };
    }

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
      xtermTextarea.addEventListener("paste", pasteHandler as EventListener);
    }

    // Resize observer
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    resizeObserverRef.current = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try { fitAddon.fit(); } catch {}
      }, 50);
    });
    resizeObserverRef.current.observe(container);

    return () => {
      resizeObserverRef.current?.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      if (xtermTextarea) {
        xtermTextarea.removeEventListener("paste", pasteHandler as EventListener);
      }
    };
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{
          background: "var(--vp-bg-primary)",
          border: dragOver ? "2px solid var(--vp-accent-blue-glow)" : "1px solid var(--vp-border-subtle)",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
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
              borderRadius: 8,
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
      onMouseLeave={() => { if (!someoneIsDragging) setHovered(false); }}
    >
      {/* Internal pane swap overlay */}
      {dragOver && (
        <div
          className="absolute inset-0 z-10"
          style={{
            background: "var(--vp-accent-blue-bg)",
            border: "2px dashed var(--vp-accent-blue-glow)",
            borderRadius: 2,
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

      {hovered && !someoneIsDragging && (
        <div
          className="absolute top-1 right-1 flex gap-1 z-10"
          style={{ animation: "fadeIn 0.15s ease" }}
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
              borderRadius: 6,
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
              borderRadius: 6,
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
              borderRadius: 6,
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
        borderRadius: 2,
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
