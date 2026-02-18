import { useState } from "react";
import { Play, Square, ChevronDown, ChevronRight } from "lucide-react";
import { useRunnerStore } from "../../stores/runnerStore";
import { useUIStore } from "../../stores/uiStore";

const STATUS_DOT: Record<string, string> = {
  running: "#4ade80",
  stopped: "#6b7280",
  error: "#ef4444",
  idle: "#6b7280",
};

export default function RunnerSidebarSection() {
  const configs = useRunnerStore((s) => s.configs);
  const instances = useRunnerStore((s) => s.instances);
  const startRunner = useRunnerStore((s) => s.startRunner);
  const stopRunner = useRunnerStore((s) => s.stopRunner);
  const setSelectedConfig = useRunnerStore((s) => s.setSelectedConfig);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const setViewMode = useUIStore((s) => s.setViewMode);

  const [collapsed, setCollapsed] = useState(false);

  if (configs.length === 0) return null;

  const workspaceId = activeWorkspaceId || "ws-default";

  const getInstance = (configId: string) =>
    instances.find((i) => i.configId === configId);

  const handleToggle = (e: React.MouseEvent, configId: string) => {
    e.stopPropagation();
    const inst = getInstance(configId);
    if (inst?.status === "running") {
      stopRunner(configId);
    } else {
      startRunner(configId, workspaceId);
    }
  };

  const handleClick = (configId: string) => {
    setSelectedConfig(configId);
    setViewMode("runner");
  };

  return (
    <div style={{ borderTop: "1px solid var(--vp-border-light)", marginTop: 4, paddingTop: 4 }}>
      {/* Section header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "6px 10px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--vp-text-dim)",
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        Runner
        <span style={{
          marginLeft: "auto",
          fontSize: 9,
          color: "var(--vp-text-faint)",
          fontWeight: 400,
        }}>
          {configs.length}
        </span>
      </button>

      {!collapsed && (
        <div style={{ padding: "0 4px 4px" }}>
          {configs.map((config) => {
            const instance = getInstance(config.id);
            const status = instance?.status || "idle";
            const isRunning = status === "running";
            const dotColor = STATUS_DOT[status] || STATUS_DOT.idle;

            return (
              <div
                key={config.id}
                onClick={() => handleClick(config.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 8px",
                  borderRadius: "var(--vp-radius-md)",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {/* Status dot */}
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: dotColor, flexShrink: 0,
                  boxShadow: isRunning ? `0 0 6px ${dotColor}` : "none",
                }} />

                {/* Name */}
                <span style={{
                  flex: 1, minWidth: 0,
                  fontSize: 11, fontWeight: 500,
                  color: "var(--vp-text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {config.name}
                </span>

                {/* Port badges */}
                {instance && instance.ports.length > 0 && instance.ports.slice(0, 2).map((port) => (
                  <span
                    key={port}
                    style={{
                      padding: "0 4px", borderRadius: "var(--vp-radius-xs)",
                      background: "rgba(96,165,250,0.1)",
                      color: "#60a5fa", fontSize: 8, fontWeight: 600,
                      fontFamily: "'JetBrains Mono', monospace",
                      flexShrink: 0,
                    }}
                  >
                    :{port}
                  </span>
                ))}

                {/* Play/Stop button */}
                <button
                  onClick={(e) => handleToggle(e, config.id)}
                  title={isRunning ? "Stop" : "Start"}
                  style={{
                    width: 20, height: 20, borderRadius: "var(--vp-radius-sm)",
                    background: isRunning ? "rgba(239,68,68,0.1)" : "rgba(74,222,128,0.1)",
                    border: isRunning ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(74,222,128,0.3)",
                    color: isRunning ? "#ef4444" : "#4ade80",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    transition: "all 0.15s",
                  }}
                >
                  {isRunning ? <Square size={8} /> : <Play size={8} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
