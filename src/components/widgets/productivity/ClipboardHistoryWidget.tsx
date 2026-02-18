import { useState, useEffect, useRef, useMemo } from "react";
import { useUIStore } from "../../../stores/uiStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useTerminalStore } from "../../../stores/terminalStore";
import { send } from "../../../lib/ipc";
import { ClipboardHistoryConfig } from "../../../types/widget";
import { loadJsonFile, createDebouncedSaver } from "../../../lib/persistence";
import { getProjectDataDir } from "../../../lib/projectSlug";
import {
  ClipboardList,
  Plus,
  Search,
  Pin,
  Copy,
  Terminal,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface Snippet {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: number;
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function ClipboardHistoryWidget({
  widgetId: _widgetId,
  config,
}: {
  widgetId: string;
  config?: ClipboardHistoryConfig;
}) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const homeDir = useSettingsStore((s) => s.homeDir);
  const projectPath = useUIStore((s) => s.selectedProject?.path);
  const activeSessionId = useTerminalStore((s) => s.activeSessionId);
  const saverRef = useRef(createDebouncedSaver(500));

  const dataDir = projectPath && homeDir ? getProjectDataDir(homeDir, projectPath) : null;
  const maxItems = config?.maxItems ?? 50;

  // Load on mount
  useEffect(() => {
    if (!dataDir) return;
    try {
      const filePath = `${dataDir}/clipboard-history.json`;
      const data = loadJsonFile(filePath, { snippets: [] as Snippet[] });
      if (data.snippets) setSnippets(data.snippets);
    } catch {}
  }, [dataDir]);

  // Save on change
  useEffect(() => {
    if (!dataDir) return;
    const filePath = `${dataDir}/clipboard-history.json`;
    saverRef.current(filePath, { snippets });
  }, [snippets, dataDir]);

  const filteredSnippets = useMemo(() => {
    let result = snippets;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.text.toLowerCase().includes(q));
    }
    return result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  }, [snippets, search]);

  const handleSave = async () => {
    const text = newText.trim();
    if (!text) return;

    const snippet: Snippet = {
      id: `clip-${Date.now()}`,
      text,
      pinned: false,
      createdAt: Date.now(),
    };

    setSnippets((prev) => {
      const next = [snippet, ...prev];
      // Enforce max items: remove oldest unpinned if over limit
      if (next.length > maxItems) {
        const pinned = next.filter((s) => s.pinned);
        const unpinned = next.filter((s) => !s.pinned);
        while (pinned.length + unpinned.length > maxItems && unpinned.length > 0) {
          unpinned.pop();
        }
        return [...pinned, ...unpinned].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.createdAt - a.createdAt;
        });
      }
      return next;
    });

    try {
      await navigator.clipboard.writeText(text);
    } catch {}

    setNewText("");
    setAdding(false);
  };

  const handleCopy = async (snippet: Snippet) => {
    try {
      await navigator.clipboard.writeText(snippet.text);
    } catch {}
  };

  const handlePin = (id: string) => {
    setSnippets((prev) =>
      prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s))
    );
  };

  const handleSendToTerminal = (snippet: Snippet) => {
    if (!activeSessionId) return;
    send("write_pty", { id: activeSessionId, data: snippet.text + "\n" });
  };

  const handleDelete = (id: string) => {
    setSnippets((prev) => prev.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div className="h-full flex flex-col" style={{ gap: 6, padding: 8 }}>
      {/* Toolbar: Search + Add */}
      <div className="flex gap-2">
        <div
          className="flex items-center gap-1"
          style={{
            flex: 1,
            background: "var(--vp-bg-surface)",
            borderRadius: "var(--vp-radius-md)",
            padding: "4px 8px",
          }}
        >
          <Search size={12} style={{ color: "var(--vp-text-faint)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search snippets..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              fontSize: 11,
              color: "var(--vp-text-primary)",
              outline: "none",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                background: "none",
                border: "none",
                color: "var(--vp-text-faint)",
                cursor: "pointer",
                padding: 2,
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>
        <button
          onClick={() => setAdding(!adding)}
          style={{
            background: adding ? "var(--vp-accent-blue)" : "none",
            border: "none",
            color: adding ? "#fff" : "var(--vp-text-faint)",
            cursor: "pointer",
            padding: 6,
            borderRadius: "var(--vp-radius-sm)",
          }}
          title="Add snippet"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Add Form */}
      {adding && (
        <div
          style={{
            background: "var(--vp-bg-surface)",
            borderRadius: "var(--vp-radius-md)",
            padding: 8,
          }}
        >
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Paste or type a snippet..."
            rows={3}
            style={{
              width: "100%",
              background: "var(--vp-bg-surface-hover)",
              border: "1px solid var(--vp-border-light)",
              borderRadius: "var(--vp-radius-sm)",
              padding: "4px 8px",
              fontSize: 11,
              color: "var(--vp-text-primary)",
              resize: "vertical",
              fontFamily: "monospace",
              marginBottom: 6,
              boxSizing: "border-box",
            }}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setAdding(false);
                setNewText("");
              }}
              style={{
                padding: "3px 8px",
                fontSize: 10,
                borderRadius: "var(--vp-radius-sm)",
                background: "none",
                border: "1px solid var(--vp-border-light)",
                color: "var(--vp-text-muted)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!newText.trim()}
              style={{
                padding: "3px 8px",
                fontSize: 10,
                borderRadius: "var(--vp-radius-sm)",
                background: newText.trim()
                  ? "var(--vp-accent-blue)"
                  : "var(--vp-bg-secondary)",
                border: "none",
                color: newText.trim() ? "#fff" : "var(--vp-text-dim)",
                cursor: newText.trim() ? "pointer" : "default",
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Snippet List */}
      <div
        className="flex-1 overflow-auto"
        style={{ display: "flex", flexDirection: "column", gap: 4 }}
      >
        {filteredSnippets.length === 0 ? (
          <div
            className="flex-1 flex flex-col items-center justify-center gap-2"
            style={{ color: "var(--vp-text-faint)" }}
          >
            <ClipboardList size={28} />
            <p style={{ fontSize: 11 }}>No snippets yet</p>
          </div>
        ) : (
          filteredSnippets.map((snippet) => {
            const isExpanded = expandedId === snippet.id;
            const preview =
              snippet.text.length > 80
                ? snippet.text.slice(0, 80) + "..."
                : snippet.text;

            return (
              <div
                key={snippet.id}
                style={{
                  background: "var(--vp-bg-surface)",
                  border: "1px solid var(--vp-bg-surface-hover)",
                  borderRadius: "var(--vp-radius-md)",
                  padding: "6px 8px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "var(--vp-bg-surface-hover)";
                  e.currentTarget.style.borderColor =
                    "var(--vp-border-light)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "var(--vp-bg-surface)";
                  e.currentTarget.style.borderColor =
                    "var(--vp-bg-surface-hover)";
                }}
              >
                {/* Header: expand toggle + preview + timestamp */}
                <div
                  className="flex items-center gap-1"
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    setExpandedId(isExpanded ? null : snippet.id)
                  }
                >
                  {isExpanded ? (
                    <ChevronDown
                      size={11}
                      style={{ color: "var(--vp-text-faint)", flexShrink: 0 }}
                    />
                  ) : (
                    <ChevronRight
                      size={11}
                      style={{ color: "var(--vp-text-faint)", flexShrink: 0 }}
                    />
                  )}
                  {snippet.pinned && (
                    <Pin
                      size={9}
                      style={{
                        color: "var(--vp-accent-amber)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: "var(--vp-text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {preview}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: "var(--vp-text-faint)",
                      flexShrink: 0,
                      marginLeft: 4,
                    }}
                  >
                    {timeAgo(snippet.createdAt)}
                  </span>
                </div>

                {/* Expanded: full text */}
                {isExpanded && (
                  <pre
                    style={{
                      margin: "6px 0 4px 16px",
                      fontSize: 11,
                      fontFamily: "monospace",
                      color: "var(--vp-text-secondary)",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      lineHeight: 1.4,
                      background: "var(--vp-bg-secondary)",
                      borderRadius: "var(--vp-radius-sm)",
                      padding: "4px 8px",
                    }}
                  >
                    {snippet.text}
                  </pre>
                )}

                {/* Hover actions row */}
                <div
                  className="flex gap-1"
                  style={{
                    marginTop: 4,
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(snippet);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--vp-text-faint)",
                      cursor: "pointer",
                      padding: 2,
                    }}
                    title="Copy to clipboard"
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color =
                        "var(--vp-accent-blue)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color =
                        "var(--vp-text-faint)")
                    }
                  >
                    <Copy size={11} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePin(snippet.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: snippet.pinned
                        ? "var(--vp-accent-amber)"
                        : "var(--vp-text-faint)",
                      cursor: "pointer",
                      padding: 2,
                    }}
                    title={snippet.pinned ? "Unpin" : "Pin"}
                    onMouseEnter={(e) => {
                      if (!snippet.pinned)
                        e.currentTarget.style.color =
                          "var(--vp-accent-amber)";
                    }}
                    onMouseLeave={(e) => {
                      if (!snippet.pinned)
                        e.currentTarget.style.color =
                          "var(--vp-text-faint)";
                    }}
                  >
                    <Pin size={11} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendToTerminal(snippet);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--vp-text-faint)",
                      cursor: "pointer",
                      padding: 2,
                      opacity: activeSessionId ? 1 : 0.4,
                    }}
                    title="Send to terminal"
                    disabled={!activeSessionId}
                    onMouseEnter={(e) => {
                      if (activeSessionId)
                        e.currentTarget.style.color =
                          "var(--vp-accent-green)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color =
                        "var(--vp-text-faint)";
                    }}
                  >
                    <Terminal size={11} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(snippet.id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--vp-text-faint)",
                      cursor: "pointer",
                      padding: 2,
                    }}
                    title="Delete"
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color =
                        "var(--vp-accent-red-text)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color =
                        "var(--vp-text-faint)")
                    }
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          fontSize: 10,
          color: "var(--vp-text-dim)",
          textAlign: "center",
          paddingTop: 2,
        }}
      >
        {snippets.length} snippet{snippets.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
