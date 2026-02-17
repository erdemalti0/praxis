import { useState, useEffect } from "react";
import { FolderOpen, X, Clock, GitBranch, Loader2, FolderInput } from "lucide-react";
import { invoke } from "../../lib/ipc";
import { useUIStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ProjectInfo } from "../../types/session";

function truncatePath(fullPath: string): string {
  const segments = fullPath.split("/").filter(Boolean);
  if (segments.length <= 3) return fullPath;
  return ".../" + segments.slice(-3).join("/");
}

function CloneModal({ onClose, onCloned }: { onClose: () => void; onCloned: (path: string) => void }) {
  const [repoUrl, setRepoUrl] = useState("");
  const [targetDir, setTargetDir] = useState("");
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState("");

  const handleChooseFolder = async () => {
    const selectedPath = await invoke<string | null>("open_directory_dialog");
    if (selectedPath) setTargetDir(selectedPath);
  };

  const handleClone = async () => {
    if (!repoUrl.trim() || !targetDir) return;
    setCloning(true);
    setError("");
    try {
      const clonedPath = await invoke<string>("git_clone_repo", {
        repoUrl: repoUrl.trim(),
        targetDir,
      });
      if (clonedPath) {
        onCloned(clonedPath);
      } else {
        setError("Clone succeeded but returned no path");
      }
    } catch (e: any) {
      setError(e.message || "Clone failed");
    } finally {
      setCloning(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--vp-bg-primary)",
          border: "1px solid var(--vp-border)",
          borderRadius: 16,
          padding: 28,
          width: 440,
          maxWidth: "90vw",
          animation: "fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--vp-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
            <GitBranch size={18} />
            Clone Repository
          </h2>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--vp-text-dim)", padding: 4, borderRadius: 6, display: "flex" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Repo URL */}
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--vp-text-secondary)", marginBottom: 6, display: "block" }}>
          Repository URL
        </label>
        <input
          type="text"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/user/repo.git"
          disabled={cloning}
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 13,
            background: "var(--vp-bg-surface)",
            color: "var(--vp-text-primary)",
            border: "1px solid var(--vp-border)",
            borderRadius: 10,
            outline: "none",
            marginBottom: 16,
            boxSizing: "border-box",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--vp-accent-blue)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--vp-border)")}
          autoFocus
        />

        {/* Target Folder */}
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--vp-text-secondary)", marginBottom: 6, display: "block" }}>
          Clone Into
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <div
            style={{
              flex: 1,
              padding: "10px 12px",
              fontSize: 13,
              background: "var(--vp-bg-surface)",
              color: targetDir ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
              border: "1px solid var(--vp-border)",
              borderRadius: 10,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {targetDir ? truncatePath(targetDir) : "Select a folder..."}
          </div>
          <button
            onClick={handleChooseFolder}
            disabled={cloning}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 500,
              background: "var(--vp-bg-surface)",
              color: "var(--vp-text-primary)",
              border: "1px solid var(--vp-border)",
              borderRadius: 10,
              cursor: "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <FolderInput size={14} />
            Browse
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{ fontSize: 12, color: "var(--vp-accent-red, #ef4444)", marginBottom: 16, padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 8 }}>
            {error}
          </div>
        )}

        {/* Clone Button */}
        <button
          onClick={handleClone}
          disabled={cloning || !repoUrl.trim() || !targetDir}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 0",
            background: cloning || !repoUrl.trim() || !targetDir ? "var(--vp-bg-surface)" : "var(--vp-button-primary-bg)",
            color: cloning || !repoUrl.trim() || !targetDir ? "var(--vp-text-dim)" : "var(--vp-button-primary-text)",
            border: "none",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            cursor: cloning || !repoUrl.trim() || !targetDir ? "not-allowed" : "pointer",
            transition: "all 0.2s ease",
          }}
        >
          {cloning ? (
            <>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              Cloning...
            </>
          ) : (
            <>
              <GitBranch size={16} />
              Clone
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function ProjectSelect() {
  const setSelectedProject = useUIStore((s) => s.setSelectedProject);
  const recentProjects = useSettingsStore((s) => s.recentProjects);
  const addRecentProject = useSettingsStore((s) => s.addRecentProject);
  const removeRecentProject = useSettingsStore((s) => s.removeRecentProject);
  const [showCloneModal, setShowCloneModal] = useState(false);

  // Listen for menu-triggered clone modal
  useEffect(() => {
    const handler = () => setShowCloneModal(true);
    window.addEventListener("open-clone-modal", handler);
    return () => window.removeEventListener("open-clone-modal", handler);
  }, []);

  const handleOpenFolder = async () => {
    try {
      const selectedPath = await invoke<string | null>("open_directory_dialog");
      if (!selectedPath) return;
      const name = selectedPath.split("/").filter(Boolean).pop() || selectedPath;
      const project: ProjectInfo = { name, path: selectedPath, lastModified: Date.now() / 1000 };
      setSelectedProject(project);
      addRecentProject(project);
    } catch (err) {
      console.error("Failed to open directory dialog:", err);
    }
  };

  const handleCloned = (clonedPath: string) => {
    const name = clonedPath.split("/").filter(Boolean).pop() || clonedPath;
    const project: ProjectInfo = { name, path: clonedPath, lastModified: Date.now() / 1000 };
    setSelectedProject(project);
    addRecentProject(project);
    setShowCloneModal(false);
  };

  const handleSelectRecent = (project: ProjectInfo) => {
    setSelectedProject(project);
    addRecentProject(project);
  };

  return (
    <div
      style={{
        background: "var(--vp-bg-primary)",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", "Segoe UI", sans-serif',
      }}
    >
      {/* Subtle radial glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -60%)",
          width: 600,
          height: 400,
          background:
            "radial-gradient(ellipse at center, var(--vp-bg-surface) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <div
        style={{
          textAlign: "center",
          marginBottom: recentProjects.length > 0 ? 24 : 48,
          animation: "fadeInDown 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--vp-accent-green)",
              boxShadow: "0 0 8px rgba(74, 222, 128, 0.4)",
            }}
          />
          <span
            style={{
              color: "var(--vp-accent-green)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            ready
          </span>
        </div>
        <h1
          style={{
            fontSize: 36,
            fontWeight: 300,
            color: "var(--vp-text-primary)",
            margin: 0,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
          }}
        >
          <span style={{ fontWeight: 600 }}>Praxis</span>
        </h1>
        <p
          style={{
            color: "var(--vp-text-dim)",
            fontSize: 13,
            marginTop: 12,
            fontWeight: 400,
          }}
        >
          Open a project folder to begin
        </p>
      </div>

      {/* Recent Projects */}
      {recentProjects.length > 0 && (
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 400,
            marginBottom: 24,
            animation: "fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
              paddingLeft: 4,
            }}
          >
            <Clock size={12} style={{ color: "var(--vp-text-dim)" }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--vp-text-dim)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Recent Projects
            </span>
          </div>
          <div
            style={{
              maxHeight: 240,
              overflowY: "auto",
              borderRadius: 10,
              border: "1px solid var(--vp-border)",
              background: "transparent",
            }}
          >
            {recentProjects.map((project, _idx) => (
              <div
                key={project.path}
                onClick={() => handleSelectRecent(project)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  cursor: "pointer",
                  background: "transparent",
                  borderRadius: 8,
                  margin: 4,
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--vp-bg-surface)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--vp-text-primary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {project.name}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--vp-text-dim)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginTop: 2,
                    }}
                  >
                    {truncatePath(project.path)}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecentProject(project.path);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: 4,
                    borderRadius: 4,
                    color: "var(--vp-text-dim)",
                    flexShrink: 0,
                    marginLeft: 8,
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--vp-text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--vp-text-dim)";
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: 12,
          animation: "fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both",
        }}
      >
        <button
          onClick={handleOpenFolder}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 36px",
            background: "var(--vp-button-primary-bg)",
            color: "var(--vp-button-primary-text)",
            border: "none",
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            letterSpacing: "-0.01em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          <FolderOpen size={18} />
          Open Project
        </button>

        <button
          onClick={() => setShowCloneModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "16px 36px",
            background: "var(--vp-bg-surface)",
            color: "var(--vp-text-primary)",
            border: "1px solid var(--vp-border)",
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            letterSpacing: "-0.01em",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--vp-text-dim)";
            e.currentTarget.style.background = "var(--vp-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--vp-border)";
            e.currentTarget.style.background = "var(--vp-bg-surface)";
          }}
        >
          <GitBranch size={18} />
          Clone Repository
        </button>
      </div>

      {showCloneModal && (
        <CloneModal
          onClose={() => setShowCloneModal(false)}
          onCloned={handleCloned}
        />
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
