import { useEffect, useState } from "react";
import { invoke } from "../../../lib/ipc";
import type { GitStatusConfig } from "../../../types/widget";
import {
  RefreshCw,
  GitBranch,
  Plus,
  Minus,
  Package,
  ChevronDown,
  Check,
  Archive,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  X,
  FileText,
} from "lucide-react";

interface GitStatus {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  branches?: string[];
}

interface FileItemProps {
  file: string;
  type: "staged" | "unstaged" | "untracked";
  color: string;
  onAction: (action: "add" | "remove" | "view") => void;
}

function FileItem({ file, type, color, onAction }: FileItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: "3px 0",
        fontSize: 11,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={{
          color,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          cursor: "pointer",
        }}
        onClick={() => onAction("view")}
        title={file}
      >
        {file}
      </span>
      {hovered && (
        <div className="flex gap-1">
          {type !== "staged" && (
            <button
              onClick={() => onAction("add")}
              style={{
                background: "var(--vp-accent-green-bg-hover)",
                border: "none",
                borderRadius: 3,
                padding: "1px 4px",
                cursor: "pointer",
                color: "var(--vp-accent-green)",
                fontSize: 9,
              }}
              title="Stage"
            >
              <Plus size={10} />
            </button>
          )}
          {type === "staged" && (
            <button
              onClick={() => onAction("remove")}
              style={{
                background: "var(--vp-accent-red-bg-hover)",
                border: "none",
                borderRadius: 3,
                padding: "1px 4px",
                cursor: "pointer",
                color: "var(--vp-accent-red-text)",
                fontSize: 9,
              }}
              title="Unstage"
            >
              <Minus size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function GitStatusWidget({
  widgetId,
  config = {},
}: {
  widgetId: string;
  config?: GitStatusConfig;
}) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [showCommit, setShowCommit] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [commiting, setCommiting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await invoke<GitStatus>("git_status");
      setStatus(data);
      setError("");
    } catch (e) {
      setError("Not a git repo");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    if (config.autoRefresh !== false) {
      const interval = setInterval(fetchStatus, config.refreshInterval ?? 1000);
      return () => clearInterval(interval);
    }
  }, [config.autoRefresh, config.refreshInterval]);

  const handleAction = async (action: string, file?: string) => {
    setActionLoading(action);
    try {
      switch (action) {
        case "add":
          await invoke("git_add", { files: file ? [file] : [] });
          break;
        case "addAll":
          await invoke("git_add", { files: [] });
          break;
        case "remove":
          await invoke("git_unstage", { files: file ? [file] : [] });
          break;
        case "stash":
          await invoke("git_stash");
          break;
        case "pull":
          await invoke("git_pull");
          break;
        case "push":
          await invoke("git_push");
          break;
        case "checkout":
          if (file) await invoke("git_checkout", { branch: file });
          break;
        case "reset":
          await invoke("git_reset");
          break;
        case "commit":
          if (commitMsg.trim()) {
            await invoke("git_commit", { message: commitMsg.trim() });
            setCommitMsg("");
            setShowCommit(false);
          }
          break;
      }
      await fetchStatus();
    } catch (e) {
      console.error(`Git action failed: ${action}`, e);
    }
    setActionLoading(null);
  };

  const handleFileAction = (file: string, type: "staged" | "unstaged" | "untracked", action: "add" | "remove" | "view") => {
    if (action === "view") {
      console.log("View diff for:", file);
    } else if (action === "add") {
      handleAction("add", file);
    } else if (action === "remove") {
      handleAction("remove", file);
    }
  };

  const totalChanges = status
    ? status.staged.length + status.unstaged.length + status.untracked.length
    : 0;

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2" style={{ color: "var(--vp-text-dim)" }}>
        <GitBranch size={20} />
        <span style={{ fontSize: 12 }}>{error}</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: "var(--vp-text-faint)", fontSize: 12 }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex items-center justify-between"
        style={{ padding: "6px 8px", borderBottom: "1px solid var(--vp-bg-surface-hover)" }}
      >
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowBranches(!showBranches)}
            className="flex items-center gap-1"
            style={{
              background: "rgba(167,139,250,0.1)",
              border: "1px solid rgba(167,139,250,0.2)",
              borderRadius: 4,
              padding: "3px 8px",
              color: "#a78bfa",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            <GitBranch size={10} />
            <span>{status.branch}</span>
            <ChevronDown size={10} style={{ opacity: 0.6 }} />
          </button>
          {showBranches && status.branches && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                background: "var(--vp-bg-secondary)",
                border: "1px solid var(--vp-border-light)",
                borderRadius: 6,
                marginTop: 4,
                minWidth: 150,
                maxHeight: 200,
                overflow: "auto",
                zIndex: 10,
              }}
            >
              {status.branches.map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    handleAction("checkout", b);
                    setShowBranches(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    background: b === status.branch ? "rgba(167,139,250,0.15)" : "transparent",
                    border: "none",
                    color: b === status.branch ? "#a78bfa" : "var(--vp-text-secondary)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {b === status.branch && <Check size={10} />}
                  <span style={{ marginLeft: b === status.branch ? 0 : 16 }}>{b}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status.ahead > 0 && (
            <span style={{ fontSize: 10, color: "var(--vp-accent-green)", display: "flex", alignItems: "center", gap: 2 }}>
              <ArrowUp size={10} /> {status.ahead}
            </span>
          )}
          {status.behind > 0 && (
            <span style={{ fontSize: 10, color: "var(--vp-accent-red-text)", display: "flex", alignItems: "center", gap: 2 }}>
              <ArrowDown size={10} /> {status.behind}
            </span>
          )}
          <button
            onClick={fetchStatus}
            disabled={loading}
            style={{
              background: "none",
              border: "none",
              color: "var(--vp-text-faint)",
              cursor: "pointer",
              padding: 2,
            }}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div
        className="flex gap-1"
        style={{ padding: "6px 8px", borderBottom: "1px solid var(--vp-bg-surface)" }}
      >
        <button
          onClick={() => handleAction("addAll")}
          disabled={actionLoading === "addAll"}
          style={{
            flex: 1,
            padding: "4px 6px",
            fontSize: 9,
            borderRadius: 4,
            background: "var(--vp-accent-green-bg)",
            border: "none",
            color: "var(--vp-accent-green)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
          title="Stage all"
        >
          <Plus size={10} /> Add All
        </button>
        <button
          onClick={() => handleAction("stash")}
          disabled={actionLoading === "stash"}
          style={{
            flex: 1,
            padding: "4px 6px",
            fontSize: 9,
            borderRadius: 4,
            background: "var(--vp-accent-blue-bg)",
            border: "none",
            color: "var(--vp-accent-blue)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
          title="Stash changes"
        >
          <Package size={10} /> Stash
        </button>
        <button
          onClick={() => handleAction("reset")}
          disabled={actionLoading === "reset"}
          style={{
            flex: 1,
            padding: "4px 6px",
            fontSize: 9,
            borderRadius: 4,
            background: "var(--vp-accent-red-bg)",
            border: "none",
            color: "var(--vp-accent-red-text)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
          title="Reset changes"
        >
          <RotateCcw size={10} /> Reset
        </button>
      </div>

      {showCommit && (
        <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--vp-bg-surface-hover)" }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit message..."
              style={{
                flex: 1,
                background: "var(--vp-bg-surface-hover)",
                border: "1px solid var(--vp-border-light)",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: 11,
                color: "var(--vp-text-primary)",
                outline: "none",
              }}
            />
            <button
              onClick={() => handleAction("commit")}
              disabled={commiting || !commitMsg.trim()}
              style={{
                padding: "4px 10px",
                fontSize: 10,
                borderRadius: 4,
                background: "var(--vp-accent-green-bg-hover)",
                border: "none",
                color: "var(--vp-accent-green)",
                cursor: commiting || !commitMsg.trim() ? "not-allowed" : "pointer",
              }}
            >
              Commit
            </button>
            <button
              onClick={() => setShowCommit(false)}
              style={{
                padding: "4px 6px",
                fontSize: 10,
                borderRadius: 4,
                background: "var(--vp-bg-surface-hover)",
                border: "none",
                color: "var(--vp-text-dim)",
                cursor: "pointer",
              }}
            >
              <X size={10} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto" style={{ padding: "8px 10px" }}>
        {status.staged.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 4 }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-accent-green)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Staged ({status.staged.length})
              </span>
              {!showCommit && status.staged.length > 0 && (
                <button
                  onClick={() => setShowCommit(true)}
                  style={{
                    fontSize: 9,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: "var(--vp-accent-green-bg-hover)",
                    border: "none",
                    color: "var(--vp-accent-green)",
                    cursor: "pointer",
                  }}
                >
                  Commit
                </button>
              )}
            </div>
            {status.staged.map((f) => (
              <FileItem
                key={f}
                file={f}
                type="staged"
                color="var(--vp-accent-green)"
                onAction={(action) => handleFileAction(f, "staged", action)}
              />
            ))}
          </div>
        )}

        {status.unstaged.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-accent-amber)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Modified ({status.unstaged.length})
            </div>
            {status.unstaged.map((f) => (
              <FileItem
                key={f}
                file={f}
                type="unstaged"
                color="var(--vp-accent-amber)"
                onAction={(action) => handleFileAction(f, "unstaged", action)}
              />
            ))}
          </div>
        )}

        {config.showUntracked !== false && status.untracked.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Untracked ({status.untracked.length})
            </div>
            {status.untracked.map((f) => (
              <FileItem
                key={f}
                file={f}
                type="untracked"
                color="var(--vp-text-muted)"
                onAction={(action) => handleFileAction(f, "untracked", action)}
              />
            ))}
          </div>
        )}

        {totalChanges === 0 && (
          <div style={{ color: "var(--vp-text-faint)", fontSize: 12, textAlign: "center", marginTop: 20 }}>
            <Check size={16} style={{ marginBottom: 4, opacity: 0.5 }} />
            <div>Working tree clean</div>
          </div>
        )}
      </div>
    </div>
  );
}
