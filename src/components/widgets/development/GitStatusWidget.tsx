import { useEffect, useState } from "react";
import { useGitStore } from "../../../stores/gitStore";
import { useUIStore } from "../../../stores/uiStore";
import type { GitStatusConfig } from "../../../types/widget";
import {
  RefreshCw,
  GitBranch,
  Plus,
  Minus,
  ChevronDown,
  Check,
  ArrowUp,
  ArrowDown,
  X,
  AlertCircle,
} from "lucide-react";

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
      style={{ padding: "3px 0", fontSize: 11 }}
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
                borderRadius: "var(--vp-radius-xs)",
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
                borderRadius: "var(--vp-radius-xs)",
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
  widgetId: _widgetId,
  config = {},
}: {
  widgetId: string;
  config?: GitStatusConfig;
}) {
  const projectPath = useUIStore((s) => s.selectedProject?.path) || "";

  // Use the shared git store — same data source as the sidebar GitPanel
  const status = useGitStore((s) => s.status);
  const branches = useGitStore((s) => s.branches);
  const loading = useGitStore((s) => s.loading);
  const storeError = useGitStore((s) => s.error);
  const refresh = useGitStore((s) => s.refresh);
  const stageFile = useGitStore((s) => s.stage);
  const stageAllFn = useGitStore((s) => s.stageAll);
  const unstageFile = useGitStore((s) => s.unstage);
  const commitFn = useGitStore((s) => s.commit);
  const pullFn = useGitStore((s) => s.pull);
  const pushFn = useGitStore((s) => s.push);
  const switchBranch = useGitStore((s) => s.switchBranch);
  const loadBranches = useGitStore((s) => s.loadBranches);

  const [showBranches, setShowBranches] = useState(false);
  const [showCommit, setShowCommit] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Refresh on mount and poll
  useEffect(() => {
    if (!projectPath) return;
    refresh(projectPath);
    loadBranches(projectPath);
    if (config.autoRefresh !== false) {
      const interval = setInterval(() => refresh(projectPath), config.refreshInterval ?? 3000);
      return () => clearInterval(interval);
    }
  }, [projectPath, config.autoRefresh, config.refreshInterval]);

  const handleAction = async (action: string, file?: string) => {
    if (!projectPath) return;
    setActionLoading(action);
    try {
      switch (action) {
        case "add":
          if (file) await stageFile(projectPath, file);
          break;
        case "remove":
          if (file) await unstageFile(projectPath, file);
          break;
        case "stash":
          // stash not in gitStore, use fallback
          break;
        case "pull":
          await pullFn(projectPath);
          break;
        case "push":
          await pushFn(projectPath);
          break;
        case "checkout":
          if (file) {
            await switchBranch(projectPath, file);
            await loadBranches(projectPath);
          }
          break;
        case "reset":
          // reset not in gitStore, refresh after
          break;
        case "commit":
          if (commitMsg.trim()) {
            await commitFn(projectPath, commitMsg.trim());
            setCommitMsg("");
            setShowCommit(false);
          }
          break;
      }
    } catch (e) {
      console.error(`Git action failed: ${action}`, e);
    }
    setActionLoading(null);
  };

  const handleFileAction = (file: string, _type: "staged" | "unstaged" | "untracked", action: "add" | "remove" | "view") => {
    if (action === "add") {
      handleAction("add", file);
    } else if (action === "remove") {
      handleAction("remove", file);
    }
  };

  const totalChanges = status
    ? status.staged.length + status.unstaged.length + status.untracked.length
    : 0;

  if (!projectPath) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2" style={{ color: "var(--vp-text-dim)" }}>
        <GitBranch size={20} />
        <span style={{ fontSize: 12 }}>No project selected</span>
      </div>
    );
  }

  if (storeError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2" style={{ color: "var(--vp-text-dim)" }}>
        <AlertCircle size={20} style={{ color: "var(--vp-accent-amber)" }} />
        <span style={{ fontSize: 11, color: "var(--vp-text-muted)" }}>{storeError}</span>
        <button onClick={() => refresh(projectPath)} style={{
          marginTop: 4, padding: "4px 12px", borderRadius: "var(--vp-radius-md)",
          background: "var(--vp-bg-surface)", border: "1px solid var(--vp-bg-surface-hover)",
          color: "var(--vp-text-muted)", fontSize: 10, cursor: "pointer",
        }}>Retry</button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3" style={{ padding: 16 }}>
        {[80, 60, 70].map((w, i) => (
          <div key={i} style={{
            width: `${w}%`, height: 10, borderRadius: "var(--vp-radius-md)",
            background: "var(--vp-bg-surface-hover)",
            animation: "pulse 1.5s ease-in-out infinite",
            animationDelay: `${i * 0.2}s`,
          }} />
        ))}
        <style>{`@keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.7; } }`}</style>
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
            onClick={() => { setShowBranches(!showBranches); if (!showBranches) loadBranches(projectPath); }}
            className="flex items-center gap-1"
            style={{
              background: "rgba(167,139,250,0.1)",
              border: "1px solid rgba(167,139,250,0.2)",
              borderRadius: "var(--vp-radius-sm)",
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
          {showBranches && branches.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                background: "var(--vp-bg-secondary)",
                border: "1px solid var(--vp-border-light)",
                borderRadius: "var(--vp-radius-md)",
                marginTop: 4,
                minWidth: 150,
                maxHeight: 200,
                overflow: "auto",
                zIndex: 10,
              }}
            >
              {branches.map((b) => (
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
            onClick={() => refresh(projectPath)}
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
          onClick={() => handleAction("pull")}
          disabled={actionLoading === "pull"}
          style={{
            flex: 1, padding: "4px 6px", fontSize: 9, borderRadius: "var(--vp-radius-sm)",
            background: "var(--vp-accent-blue-bg)", border: "none",
            color: "var(--vp-accent-blue)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}
          title="Pull"
        >
          <ArrowDown size={10} /> Pull
        </button>
        <button
          onClick={() => handleAction("push")}
          disabled={actionLoading === "push"}
          style={{
            flex: 1, padding: "4px 6px", fontSize: 9, borderRadius: "var(--vp-radius-sm)",
            background: "var(--vp-accent-blue-bg)", border: "none",
            color: "var(--vp-accent-blue)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}
          title="Push"
        >
          <ArrowUp size={10} /> Push
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
              onKeyDown={(e) => { if (e.key === "Enter" && commitMsg.trim()) handleAction("commit"); }}
              style={{
                flex: 1,
                background: "var(--vp-bg-surface-hover)",
                border: "1px solid var(--vp-border-light)",
                borderRadius: "var(--vp-radius-sm)",
                padding: "4px 8px",
                fontSize: 11,
                color: "var(--vp-text-primary)",
                outline: "none",
              }}
            />
            <button
              onClick={() => handleAction("commit")}
              disabled={!commitMsg.trim()}
              style={{
                padding: "4px 10px", fontSize: 10, borderRadius: "var(--vp-radius-sm)",
                background: "var(--vp-accent-green-bg-hover)", border: "none",
                color: "var(--vp-accent-green)",
                cursor: !commitMsg.trim() ? "not-allowed" : "pointer",
              }}
            >
              Commit
            </button>
            <button
              onClick={() => setShowCommit(false)}
              style={{
                padding: "4px 6px", fontSize: 10, borderRadius: "var(--vp-radius-sm)",
                background: "var(--vp-bg-surface-hover)", border: "none",
                color: "var(--vp-text-dim)", cursor: "pointer",
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
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-accent-green)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Staged ({status.staged.length})
              </span>
              {!showCommit && (
                <button
                  onClick={() => setShowCommit(true)}
                  style={{
                    fontSize: 9, padding: "2px 6px", borderRadius: "var(--vp-radius-xs)",
                    background: "var(--vp-accent-green-bg-hover)", border: "none",
                    color: "var(--vp-accent-green)", cursor: "pointer",
                  }}
                >
                  Commit
                </button>
              )}
            </div>
            {status.staged.map((f) => (
              <FileItem key={f} file={f} type="staged" color="var(--vp-accent-green)" onAction={(action) => handleFileAction(f, "staged", action)} />
            ))}
          </div>
        )}

        {status.unstaged.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-accent-amber)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Modified ({status.unstaged.length})
              </span>
              <button
                onClick={() => stageAllFn(projectPath)}
                style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: "var(--vp-radius-xs)",
                  background: "var(--vp-accent-green-bg)", border: "none",
                  color: "var(--vp-accent-green)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 2,
                }}
                title="Stage all changes"
              >
                <Plus size={8} /> Stage All
              </button>
            </div>
            {status.unstaged.map((f) => (
              <FileItem key={f} file={f} type="unstaged" color="var(--vp-accent-amber)" onAction={(action) => handleFileAction(f, "unstaged", action)} />
            ))}
          </div>
        )}

        {config.showUntracked !== false && status.untracked.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--vp-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
              Untracked ({status.untracked.length})
            </div>
            {status.untracked.map((f) => (
              <FileItem key={f} file={f} type="untracked" color="var(--vp-text-muted)" onAction={(action) => handleFileAction(f, "untracked", action)} />
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
