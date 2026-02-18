import { useState } from "react";
import { Plus, Play, Square, Trash2 } from "lucide-react";
import type { RunConfig, RunnerInstance } from "../../types/runner";

interface RunnerConfigListProps {
  configs: RunConfig[];
  instances: RunnerInstance[];
  selectedConfigId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onStart: (configId: string) => void;
  onStop: (configId: string) => void;
  onDelete: (configId: string) => void;
}

const STATUS_DOT: Record<string, { color: string; label: string }> = {
  running: { color: "#4ade80", label: "Running" },
  stopped: { color: "#6b7280", label: "Stopped" },
  error: { color: "#ef4444", label: "Error" },
  idle: { color: "#6b7280", label: "Idle" },
};

export default function RunnerConfigList({
  configs, instances, selectedConfigId,
  onSelect, onAdd, onStart, onStop, onDelete,
}: RunnerConfigListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const getInstance = (configId: string) =>
    instances.find((i) => i.configId === configId);

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDelete(id);
  };

  return (
    <div className="h-full flex flex-col" style={{
      borderRight: "1px solid var(--vp-bg-surface-hover)",
      background: "var(--vp-bg-surface)",
    }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3"
        style={{
          height: 44, flexShrink: 0,
          borderBottom: "1px solid var(--vp-bg-surface-hover)",
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, color: "var(--vp-text-dim)",
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          Run Configs
        </span>
        <button
          onClick={onAdd}
          title="New Run Config"
          style={{
            width: 24, height: 24, borderRadius: "var(--vp-radius-md)",
            background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.35)",
            color: "#fb923c", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(251,146,60,0.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(251,146,60,0.12)"; }}
        >
          <Plus size={12} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "4px 0" }}>
        {configs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full" style={{ padding: 20 }}>
            <Play size={28} style={{ color: "var(--vp-text-subtle)", marginBottom: 8, opacity: 0.4 }} />
            <span style={{ fontSize: 12, color: "var(--vp-text-faint)", textAlign: "center" }}>
              No run configs yet
            </span>
            <button
              onClick={onAdd}
              style={{
                marginTop: 12, padding: "6px 14px", borderRadius: "var(--vp-radius-lg)",
                background: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.35)",
                color: "#fb923c", fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(251,146,60,0.2)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(251,146,60,0.12)"; }}
            >
              Create Config
            </button>
          </div>
        )}

        {configs.map((config) => {
          const instance = getInstance(config.id);
          const status = instance?.status || "idle";
          const dot = STATUS_DOT[status] || STATUS_DOT.idle;
          const isActive = config.id === selectedConfigId;
          const isHovered = config.id === hoveredId;
          const isRunning = status === "running";

          return (
            <div
              key={config.id}
              onClick={() => onSelect(config.id)}
              onMouseEnter={() => setHoveredId(config.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                padding: "10px 12px",
                margin: "2px 6px",
                borderRadius: "var(--vp-radius-lg)",
                cursor: "pointer",
                background: isActive
                  ? "rgba(251,146,60,0.08)"
                  : isHovered
                  ? "var(--vp-bg-surface-hover)"
                  : "transparent",
                border: isActive
                  ? "1px solid rgba(251,146,60,0.25)"
                  : "1px solid transparent",
                transition: "all 0.15s",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Status dot */}
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: dot.color, flexShrink: 0,
                    boxShadow: isRunning ? `0 0 6px ${dot.color}` : "none",
                  }} />
                  <span style={{
                    fontSize: 12, fontWeight: 500,
                    color: isActive ? "#fb923c" : "var(--vp-text-primary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {config.name}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1" style={{
                  opacity: isHovered ? 1 : 0,
                  transition: "opacity 0.15s",
                }}>
                  {isRunning ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onStop(config.id); }}
                      title="Stop"
                      style={{
                        width: 22, height: 22, borderRadius: "var(--vp-radius-sm)",
                        background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                        color: "#ef4444", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Square size={10} />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); onStart(config.id); }}
                      title="Start"
                      style={{
                        width: 22, height: 22, borderRadius: "var(--vp-radius-sm)",
                        background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)",
                        color: "#4ade80", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Play size={10} />
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDelete(e, config.id)}
                    title="Delete"
                    style={{
                      width: 22, height: 22, borderRadius: "var(--vp-radius-sm)",
                      background: "transparent", border: "1px solid transparent",
                      color: "var(--vp-text-faint)", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--vp-text-faint)"; }}
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>

              {/* Subtitle: command + ports */}
              <div className="flex items-center gap-2" style={{ marginTop: 4, marginLeft: 15 }}>
                <span style={{
                  fontSize: 10, color: "var(--vp-text-faint)",
                  fontFamily: "'JetBrains Mono', monospace",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {config.command} {config.args.join(" ")}
                </span>
              </div>

              {/* Port badges */}
              {instance && instance.ports.length > 0 && (
                <div className="flex items-center gap-1" style={{ marginTop: 4, marginLeft: 15 }}>
                  {instance.ports.map((port) => (
                    <span
                      key={port}
                      style={{
                        padding: "1px 6px", borderRadius: "var(--vp-radius-sm)",
                        background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)",
                        color: "#60a5fa", fontSize: 9, fontWeight: 600,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      :{port}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
