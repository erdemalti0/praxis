import { FolderOpen, X, Clock } from "lucide-react";
import { invoke } from "../../lib/ipc";
import { useUIStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ProjectInfo } from "../../types/session";

function truncatePath(fullPath: string): string {
  const segments = fullPath.split("/").filter(Boolean);
  if (segments.length <= 3) return fullPath;
  return ".../" + segments.slice(-3).join("/");
}

export default function ProjectSelect() {
  const setSelectedProject = useUIStore((s) => s.setSelectedProject);
  const recentProjects = useSettingsStore((s) => s.recentProjects);
  const addRecentProject = useSettingsStore((s) => s.addRecentProject);
  const removeRecentProject = useSettingsStore((s) => s.removeRecentProject);

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
            {recentProjects.map((project, idx) => (
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

      {/* Open folder button */}
      <div
        style={{
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
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
