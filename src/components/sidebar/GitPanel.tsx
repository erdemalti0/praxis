import { useEffect, useState, useCallback } from "react";
import { GitBranch, GitCommitHorizontal, Plus, Minus, ChevronDown, ChevronRight, ArrowUp, ArrowDown, RefreshCw, AlertCircle } from "lucide-react";
import { useGitStore } from "../../stores/gitStore";
import { useUIStore } from "../../stores/uiStore";

export default function GitPanel() {
  const status = useGitStore((s) => s.status);
  const branches = useGitStore((s) => s.branches);
  const commitMessage = useGitStore((s) => s.commitMessage);
  const loading = useGitStore((s) => s.loading);
  const error = useGitStore((s) => s.error);
  const refresh = useGitStore((s) => s.refresh);
  const stage = useGitStore((s) => s.stage);
  const unstage = useGitStore((s) => s.unstage);
  const commit = useGitStore((s) => s.commit);
  const pull = useGitStore((s) => s.pull);
  const push = useGitStore((s) => s.push);
  const stageAll = useGitStore((s) => s.stageAll);
  const switchBranch = useGitStore((s) => s.switchBranch);
  const loadBranches = useGitStore((s) => s.loadBranches);
  const setCommitMessage = useGitStore((s) => s.setCommitMessage);
  const selectedProject = useUIStore((s) => s.selectedProject);
  const [showBranches, setShowBranches] = useState(false);
  const [sections, setSections] = useState({ staged: true, unstaged: true, untracked: true });
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLoadingTimeout(false);
      return;
    }
    const timer = setTimeout(() => setLoadingTimeout(true), 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  const projectPath = selectedProject?.path || "";

  useEffect(() => {
    if (projectPath) {
      refresh(projectPath);
      loadBranches(projectPath);
      const interval = setInterval(() => refresh(projectPath), 1000);
      return () => clearInterval(interval);
    }
  }, [projectPath, refresh, loadBranches]);

  const handleCommit = useCallback(() => {
    if (commitMessage.trim() && projectPath) {
      commit(projectPath, commitMessage.trim());
    }
  }, [commitMessage, projectPath, commit]);

  const toggleSection = (key: keyof typeof sections) => {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  };

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ color: "var(--vp-text-faint)", padding: 16, textAlign: "center" }}>
        <GitBranch size={20} style={{ color: "var(--vp-text-dim)", marginBottom: 8 }} />
        <span style={{ fontSize: 11 }}>{error}</span>
        <button
          onClick={() => projectPath && refresh(projectPath)}
          style={{
            marginTop: 8, padding: "4px 12px", borderRadius: 6,
            background: "var(--vp-bg-surface)", border: "1px solid var(--vp-bg-surface-hover)",
            color: "var(--vp-text-muted)", fontSize: 10, cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) {
    if (loading && !loadingTimeout) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-3" style={{ padding: 16 }}>
          {[80, 60, 70].map((w, i) => (
            <div
              key={i}
              style={{
                width: `${w}%`, height: 10, borderRadius: 6,
                background: "var(--vp-bg-surface-hover)",
                animation: "pulse 1.5s ease-in-out infinite",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
          <style>{`@keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 0.7; } }`}</style>
        </div>
      );
    }
    if (loading && loadingTimeout) {
      return (
        <div className="h-full flex flex-col items-center justify-center" style={{ color: "var(--vp-text-faint)", padding: 16, textAlign: "center" }}>
          <AlertCircle size={20} style={{ color: "var(--vp-accent-amber)", marginBottom: 8 }} />
          <span style={{ fontSize: 11, color: "var(--vp-text-muted)" }}>Could not load git status</span>
          <button
            onClick={() => projectPath && refresh(projectPath)}
            style={{
              marginTop: 8, padding: "4px 12px", borderRadius: 6,
              background: "var(--vp-bg-surface)", border: "1px solid var(--vp-bg-surface-hover)",
              color: "var(--vp-text-muted)", fontSize: 10, cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ color: "var(--vp-text-faint)", padding: 16, textAlign: "center" }}>
        <GitBranch size={20} style={{ color: "var(--vp-text-dim)", marginBottom: 8 }} />
        <span style={{ fontSize: 11 }}>No git repository</span>
        <span style={{ fontSize: 10, color: "var(--vp-text-subtle)", marginTop: 4 }}>Open a git project to see status</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ overflow: "hidden" }}>
      {/* Branch bar */}
      <div style={{ padding: "8px 8px 4px", flexShrink: 0 }}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBranches(!showBranches)}
            className="flex items-center gap-1 flex-1 min-w-0"
            style={{
              padding: "4px 8px", borderRadius: 6,
              background: "var(--vp-bg-surface)", border: "1px solid var(--vp-bg-surface-hover)",
              cursor: "pointer", color: "var(--vp-text-primary)", fontSize: 11,
              textAlign: "left",
            }}
          >
            <GitBranch size={11} style={{ color: "var(--vp-accent-blue)", flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {status.branch}
            </span>
            <ChevronDown size={10} style={{ color: "var(--vp-text-faint)", flexShrink: 0, marginLeft: "auto" }} />
          </button>

          <button
            onClick={() => projectPath && refresh(projectPath)}
            title="Refresh"
            style={{
              width: 24, height: 24, borderRadius: 5,
              background: "var(--vp-bg-surface)", border: "1px solid var(--vp-bg-surface-hover)",
              color: "var(--vp-text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Branch dropdown */}
        {showBranches && (
          <div style={{
            marginTop: 4, background: "var(--vp-bg-tertiary)",
            border: "1px solid var(--vp-border-light)", borderRadius: 8,
            maxHeight: 200, overflowY: "auto",
          }}>
            {branches.map((b) => (
              <button
                key={b}
                onClick={() => { switchBranch(projectPath, b); setShowBranches(false); }}
                style={{
                  width: "100%", textAlign: "left", padding: "5px 10px",
                  background: b === status.branch ? "var(--vp-accent-blue-bg)" : "transparent",
                  border: "none", cursor: "pointer", fontSize: 10,
                  color: b === status.branch ? "var(--vp-accent-blue)" : "var(--vp-text-secondary)",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--vp-bg-surface-hover)"}
                onMouseLeave={(e) => e.currentTarget.style.background = b === status.branch ? "var(--vp-accent-blue-bg)" : "transparent"}
              >
                {b}
              </button>
            ))}
          </div>
        )}

        {/* Ahead/Behind */}
        {(status.ahead > 0 || status.behind > 0) && (
          <div className="flex items-center gap-3" style={{ marginTop: 4, fontSize: 9, color: "var(--vp-text-dim)" }}>
            {status.ahead > 0 && (
              <span className="flex items-center gap-1">
                <ArrowUp size={9} /> {status.ahead} ahead
              </span>
            )}
            {status.behind > 0 && (
              <span className="flex items-center gap-1">
                <ArrowDown size={9} /> {status.behind} behind
              </span>
            )}
          </div>
        )}
      </div>

      {/* File sections */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "4px 0" }}>
        {/* Staged */}
        <FileSection
          title="Staged"
          files={status.staged}
          color="var(--vp-accent-green)"
          collapsed={!sections.staged}
          onToggle={() => toggleSection("staged")}
          actionIcon={<Minus size={9} />}
          actionTitle="Unstage"
          onAction={(f) => unstage(projectPath, f)}
        />

        {/* Unstaged */}
        <FileSection
          title="Changes"
          files={status.unstaged}
          color="var(--vp-accent-amber)"
          collapsed={!sections.unstaged}
          onToggle={() => toggleSection("unstaged")}
          actionIcon={<Plus size={9} />}
          actionTitle="Stage"
          onAction={(f) => stage(projectPath, f)}
          onStageAll={() => stageAll(projectPath)}
        />

        {/* Untracked */}
        <FileSection
          title="Untracked"
          files={status.untracked}
          color="var(--vp-text-muted)"
          collapsed={!sections.untracked}
          onToggle={() => toggleSection("untracked")}
          actionIcon={<Plus size={9} />}
          actionTitle="Stage"
          onAction={(f) => stage(projectPath, f)}
        />
      </div>

      {/* Commit area */}
      <div style={{
        padding: 12, flexShrink: 0,
        borderTop: "2px solid var(--vp-border-light)",
        background: "var(--vp-bg-secondary)",
      }}>
        {/* Section header */}
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <GitCommitHorizontal size={14} style={{ color: "var(--vp-accent-green)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--vp-text-primary)", letterSpacing: 0.3 }}>
            Commit Changes
          </span>
          {status.staged.length > 0 && (
            <span style={{
              fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
              background: "var(--vp-accent-green-bg)", color: "var(--vp-accent-green)",
            }}>
              {status.staged.length} staged
            </span>
          )}
        </div>

        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Describe your changes..."
          rows={2}
          style={{
            width: "100%", background: "var(--vp-bg-surface)",
            border: "1px solid var(--vp-border-light)", borderRadius: 8,
            padding: "8px 10px", color: "var(--vp-text-primary)", fontSize: 11,
            outline: "none", fontFamily: "inherit", resize: "none",
          }}
        />
        <div className="flex gap-2" style={{ marginTop: 8 }}>
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || status.staged.length === 0}
            className="flex items-center justify-center gap-1"
            style={{
              flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: commitMessage.trim() && status.staged.length > 0 ? "var(--vp-accent-green-bg)" : "var(--vp-bg-surface)",
              border: `1px solid ${commitMessage.trim() && status.staged.length > 0 ? "var(--vp-accent-green)" : "var(--vp-bg-surface-hover)"}`,
              color: commitMessage.trim() && status.staged.length > 0 ? "var(--vp-accent-green)" : "var(--vp-text-subtle)",
              cursor: commitMessage.trim() && status.staged.length > 0 ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
          >
            <GitCommitHorizontal size={12} />
            Commit
          </button>
          <button
            onClick={() => projectPath && pull(projectPath)}
            title="Pull from remote"
            className="flex items-center justify-center gap-1"
            style={{
              padding: "7px 12px", borderRadius: 8,
              background: "var(--vp-accent-blue-bg)", border: "1px solid var(--vp-accent-blue-border)",
              color: "var(--vp-accent-blue)", fontSize: 10, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <ArrowDown size={13} />
            Pull
          </button>
          <button
            onClick={() => projectPath && push(projectPath)}
            title="Push to remote"
            className="flex items-center justify-center gap-1"
            style={{
              padding: "7px 12px", borderRadius: 8,
              background: "var(--vp-accent-green-bg)", border: "1px solid var(--vp-accent-green)",
              color: "var(--vp-accent-green)", fontSize: 10, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <ArrowUp size={13} />
            Push
          </button>
        </div>
        {/* Quick action: Commit & Push */}
        <button
          onClick={async () => {
            if (commitMessage.trim() && projectPath && status.staged.length > 0) {
              await commit(projectPath, commitMessage.trim());
              await push(projectPath);
            }
          }}
          disabled={!commitMessage.trim() || status.staged.length === 0}
          className="flex items-center justify-center gap-1"
          style={{
            width: "100%", marginTop: 6, padding: "6px 0", borderRadius: 8, fontSize: 10, fontWeight: 600,
            background: commitMessage.trim() && status.staged.length > 0 ? "var(--vp-accent-blue-bg)" : "var(--vp-bg-surface)",
            border: `1px solid ${commitMessage.trim() && status.staged.length > 0 ? "var(--vp-accent-blue-border)" : "var(--vp-bg-surface-hover)"}`,
            color: commitMessage.trim() && status.staged.length > 0 ? "var(--vp-accent-blue)" : "var(--vp-text-subtle)",
            cursor: commitMessage.trim() && status.staged.length > 0 ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
        >
          <GitCommitHorizontal size={11} />
          Commit & Push
          <ArrowUp size={11} />
        </button>
      </div>
    </div>
  );
}

function FileSection({
  title, files, color, collapsed, onToggle, actionIcon, actionTitle, onAction, onStageAll,
}: {
  title: string;
  files: string[];
  color: string;
  collapsed: boolean;
  onToggle: () => void;
  actionIcon: React.ReactNode;
  actionTitle: string;
  onAction: (file: string) => void;
  onStageAll?: () => void;
}) {
  if (files.length === 0) return null;

  return (
    <div>
      <div className="flex items-center w-full" style={{ padding: "4px 8px" }}>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 flex-1 min-w-0"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {collapsed ? <ChevronRight size={10} style={{ color: "var(--vp-text-faint)" }} /> : <ChevronDown size={10} style={{ color: "var(--vp-text-faint)" }} />}
          <span style={{ fontSize: 10, fontWeight: 600, color }}>{title}</span>
          <span style={{ fontSize: 9, color: "var(--vp-text-faint)", marginLeft: 4 }}>{files.length}</span>
        </button>
        {onStageAll && (
          <button
            onClick={onStageAll}
            title="Stage all"
            style={{
              fontSize: 9, padding: "1px 5px", borderRadius: 3,
              background: "var(--vp-accent-green-bg)", border: "none",
              color: "var(--vp-accent-green)", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 2, flexShrink: 0,
            }}
          >
            <Plus size={8} /> Stage All
          </button>
        )}
      </div>
      {!collapsed && files.map((file) => (
        <div
          key={file}
          className="flex items-center gap-1"
          style={{ padding: "2px 8px 2px 20px" }}
        >
          <span style={{
            fontSize: 10, color: "var(--vp-text-secondary)", flex: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {file}
          </span>
          <button
            onClick={() => onAction(file)}
            title={actionTitle}
            style={{
              width: 16, height: 16, borderRadius: 3,
              background: "var(--vp-bg-surface)", border: "1px solid var(--vp-bg-surface-hover)",
              color: "var(--vp-text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {actionIcon}
          </button>
        </div>
      ))}
    </div>
  );
}
