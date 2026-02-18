import { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import { invoke } from "../../lib/ipc";
import { Folder, File, ChevronRight, Loader2, AlertCircle, FilePlus } from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { useEditorStore } from "../../stores/editorStore";
import { useConfirmStore } from "../../stores/confirmStore";
import type { FileEntry } from "../../types/session";

function formatSize(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default memo(function FileExplorer({ showHidden: _showHidden = false }: { showHidden?: boolean } = {}) {
  const selectedProject = useUIStore((s) => s.selectedProject);
  const rootPath = selectedProject?.path ?? "";

  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const newFileRef = useRef<HTMLInputElement>(null);

  // Reset when project changes
  useEffect(() => {
    setCurrentPath(rootPath);
  }, [rootPath]);

  const loadDirectory = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<FileEntry[]>("list_directory", { path });
      setEntries(result);
    } catch (e) {
      setError(String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDirectory(currentPath);
    // Auto-refresh every 10 seconds (chokidar file watcher handles real-time changes)
    const interval = setInterval(() => {
      if (currentPath) loadDirectory(currentPath);
    }, 10000);
    return () => clearInterval(interval);
  }, [currentPath, loadDirectory]);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
  };

  const handleFileClick = useCallback((filePath: string) => {
    const fileName = filePath.split("/").pop() || "";
    const isSensitive = fileName.startsWith(".env");

    const openInEditor = () => {
      const ui = useUIStore.getState();
      if (ui.viewMode !== "editor") {
        useEditorStore.getState().setPreviousViewMode(ui.viewMode);
      }
      useEditorStore.getState().openFile(filePath);
      ui.setViewMode("editor");
    };

    if (isSensitive) {
      useConfirmStore.getState().showConfirm(
        "Sensitive File",
        `"${fileName}" may contain API keys, passwords, or other credentials. Are you sure you want to open it?`,
        openInEditor,
      );
    } else {
      openInEditor();
    }
  }, []);

  // Context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  // Focus new file input
  useEffect(() => {
    if (showNewFileInput && newFileRef.current) {
      newFileRef.current.focus();
    }
  }, [showNewFileInput]);

  const handleNewFile = useCallback(() => {
    const name = newFileName.trim();
    if (!name) {
      setShowNewFileInput(false);
      setNewFileName("");
      return;
    }
    const viewMode = useUIStore.getState().viewMode;
    if (viewMode !== "editor") {
      useEditorStore.getState().setPreviousViewMode(viewMode);
    }
    useEditorStore.getState().createFile(currentPath, name);
    useUIStore.getState().setViewMode("editor");
    loadDirectory(currentPath);
    setShowNewFileInput(false);
    setNewFileName("");
  }, [newFileName, currentPath, loadDirectory]);

  const breadcrumbs = useMemo(() => {
    if (!rootPath || !currentPath) return [];
    const relative = currentPath.startsWith(rootPath)
      ? currentPath.slice(rootPath.length)
      : currentPath;
    const parts = relative.split("/").filter(Boolean);
    const segments = [
      { name: selectedProject?.name ?? "root", path: rootPath },
    ];
    let accumulated = rootPath;
    for (const part of parts) {
      accumulated += "/" + part;
      segments.push({ name: part, path: accumulated });
    }
    return segments;
  }, [rootPath, currentPath, selectedProject?.name]);

  if (!rootPath) {
    return (
      <div
        className="flex items-center justify-center h-full px-4"
        style={{ color: "var(--vp-text-dim)", fontSize: 12 }}
      >
        Select a project to browse files
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" onContextMenu={handleContextMenu}>
      {/* Breadcrumb */}
      <div
        className="px-3 py-2 flex items-center gap-1 flex-shrink-0 overflow-x-auto"
        style={{
          borderBottom: "1px solid var(--vp-border-subtle)",
          fontSize: 11,
          whiteSpace: "nowrap",
        }}
      >
        {breadcrumbs.map((seg, i) => (
          <span key={seg.path} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight size={10} style={{ color: "var(--vp-text-subtle)", flexShrink: 0 }} />
            )}
            <button
              onClick={() => navigateTo(seg.path)}
              style={{
                color: i === breadcrumbs.length - 1 ? "var(--vp-text-primary)" : "var(--vp-text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "1px 2px",
                borderRadius: "var(--vp-radius-xs)",
                fontFamily: "inherit",
                fontSize: 11,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-text-primary)")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.color =
                  i === breadcrumbs.length - 1 ? "var(--vp-text-primary)" : "var(--vp-text-muted)")
              }
            >
              {seg.name}
            </button>
          </span>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div
            className="flex items-center justify-center py-8"
            style={{ color: "var(--vp-text-dim)" }}
          >
            <Loader2 size={16} className="animate-spin" />
          </div>
        )}

        {error && !loading && (
          <div
            className="flex items-center gap-2 px-3 py-4"
            style={{ color: "#aa4444", fontSize: 12 }}
          >
            <AlertCircle size={14} />
            <span>Cannot read directory</span>
          </div>
        )}

        {!loading && !error && (
          <div className="py-1">
            {/* Go up entry */}
            {currentPath !== rootPath && (
              <button
                onClick={() => {
                  const parent = currentPath.split("/").slice(0, -1).join("/");
                  navigateTo(parent || rootPath);
                }}
                className="w-full flex items-center gap-2 px-3"
                style={{
                  height: 32,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--vp-text-muted)",
                  fontSize: 12,
                  transition: "background 0.15s",
                  textAlign: "left",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--vp-bg-surface)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <Folder size={14} style={{ color: "var(--vp-text-muted)", flexShrink: 0 }} />
                <span>..</span>
              </button>
            )}

            {/* New file input */}
            {showNewFileInput && (
              <div
                className="flex items-center gap-2 px-3"
                style={{ height: 32 }}
              >
                <FilePlus size={14} style={{ color: "var(--vp-accent-blue)", flexShrink: 0 }} />
                <input
                  ref={newFileRef}
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleNewFile();
                    if (e.key === "Escape") {
                      setShowNewFileInput(false);
                      setNewFileName("");
                    }
                  }}
                  onBlur={() => {
                    if (!newFileName.trim()) {
                      setShowNewFileInput(false);
                      setNewFileName("");
                    }
                  }}
                  placeholder="filename.ext"
                  style={{
                    flex: 1,
                    background: "var(--vp-bg-surface-hover)",
                    border: "1px solid var(--vp-accent-blue-border)",
                    borderRadius: "var(--vp-radius-sm)",
                    color: "var(--vp-text-primary)",
                    fontSize: 12,
                    padding: "2px 8px",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            )}

            {entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => {
                  if (entry.isDir) {
                    navigateTo(entry.path);
                  } else {
                    handleFileClick(entry.path);
                  }
                }}
                className="w-full flex items-center gap-2 px-3"
                style={{
                  height: 32,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: entry.isDir ? "var(--vp-text-primary)" : "var(--vp-text-secondary)",
                  fontSize: 12,
                  transition: "background 0.15s",
                  textAlign: "left",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--vp-bg-surface)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                {entry.isDir ? (
                  <Folder size={14} style={{ color: "var(--vp-text-primary)", flexShrink: 0 }} />
                ) : (
                  <File size={14} style={{ color: "var(--vp-text-dim)", flexShrink: 0 }} />
                )}
                <span
                  className="flex-1 truncate"
                  style={{ fontFamily: "inherit" }}
                >
                  {entry.name}
                </span>
                {!entry.isDir && entry.size > 0 && (
                  <span
                    style={{
                      color: "var(--vp-text-dim)",
                      fontSize: 10,
                      fontFamily: "monospace",
                      flexShrink: 0,
                    }}
                  >
                    {formatSize(entry.size)}
                  </span>
                )}
              </button>
            ))}

            {entries.length === 0 && (
              <div
                className="px-3 py-4"
                style={{ color: "var(--vp-text-dim)", fontSize: 12, textAlign: "center" }}
              >
                Empty directory
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
            background: "var(--vp-bg-tertiary)",
            border: "1px solid var(--vp-border-light)",
            borderRadius: "var(--vp-radius-lg)",
            padding: "4px 0",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            minWidth: 160,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu(null);
              setShowNewFileInput(true);
              setNewFileName("");
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--vp-text-primary)",
              fontSize: 12,
              textAlign: "left",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--vp-bg-surface-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <FilePlus size={13} style={{ color: "var(--vp-accent-blue)" }} />
            New File
          </button>
        </div>
      )}
    </div>
  );
});
