import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Play, Pencil, Trash2, CheckCircle2, Circle, Clock, AlertCircle, Zap } from "lucide-react";
import type { MissionStep, MissionStepStatus } from "../../types/mission";
import { NODE_WIDTH, NODE_HEIGHT } from "../../lib/mission/layoutEngine";
import AgentPicker from "./AgentPicker";
import { useTerminalStore } from "../../stores/terminalStore";
import { useUIStore } from "../../stores/uiStore";
import { useMissionStore } from "../../stores/missionStore";
import { send } from "../../lib/ipc";
import { getSessionIds } from "../../lib/layout/layoutUtils";

const STATUS_CONFIG: Record<MissionStepStatus, {
  color: string; glow: string; bg: string; border: string;
  icon: typeof Circle; label: string;
}> = {
  pending: {
    color: "#6b7280", glow: "none",
    bg: "var(--vp-bg-surface)", border: "var(--vp-border-subtle)",
    icon: Circle, label: "Pending",
  },
  in_progress: {
    color: "var(--vp-accent-blue)", glow: "0 0 12px var(--vp-accent-blue-border)",
    bg: "var(--vp-accent-blue-bg)", border: "var(--vp-accent-blue-border)",
    icon: Clock, label: "In Progress",
  },
  done: {
    color: "var(--vp-accent-green)", glow: "none",
    bg: "rgba(74,222,128,0.03)", border: "rgba(74,222,128,0.2)",
    icon: CheckCircle2, label: "Done",
  },
  blocked: {
    color: "#f59e0b", glow: "none",
    bg: "rgba(245,158,11,0.04)", border: "rgba(245,158,11,0.2)",
    icon: AlertCircle, label: "Blocked",
  },
};

interface MissionStepNodeProps {
  step: MissionStep;
  projectPath: string;
  onAddChild: (parentId: string) => void;
  onEdit: (step: MissionStep) => void;
  onDelete: (stepId: string) => void;
  onStatusCycle: (stepId: string) => void;
}

export default function MissionStepNode({ step, projectPath, onAddChild, onEdit, onDelete, onStatusCycle }: MissionStepNodeProps) {
  const [hovered, setHovered] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const config = STATUS_CONFIG[step.status];
  const StatusIcon = config.icon;

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handle = (e: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        playBtnRef.current && !playBtnRef.current.contains(e.target as Node)
      ) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showPicker]);

  const togglePicker = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (showPicker) {
      setShowPicker(false);
      return;
    }
    // Calculate position relative to viewport
    const btn = playBtnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setPickerPos({ top: rect.bottom + 4, left: rect.right - 260 });
    }
    setShowPicker(true);
  }, [showPicker]);

  const sendToAgent = useCallback(
    (sessionId: string, workspaceId: string) => {
      const prompt = step.prompt || step.title;
      send("write_pty", { id: sessionId, data: prompt + "\n" });
      const ui = useUIStore.getState();
      const ts = useTerminalStore.getState();
      if (ui.activeWorkspaceId !== workspaceId) ui.setActiveWorkspaceId(workspaceId);
      const vm = ui.viewMode;
      if (vm !== "terminal" && vm !== "split") ui.setViewMode("terminal");
      const groups = ui.terminalGroups[workspaceId] || [];
      for (const gid of groups) {
        const layout = ui.workspaceLayouts[gid];
        if (layout && getSessionIds(layout).includes(sessionId)) {
          ui.setActiveTerminalGroup(workspaceId, gid);
          break;
        }
      }
      ui.setFocusedPane(sessionId);
      ts.setActiveSession(sessionId);
      if (step.status === "pending") {
        useMissionStore.getState().cycleStepStatus(projectPath, step.missionId, step.id);
      }
      setShowPicker(false);
    },
    [step, projectPath]
  );

  return (
    <div
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: hovered ? "var(--vp-bg-surface)" : config.bg,
        border: `1px solid ${hovered ? "var(--vp-border-medium)" : config.border}`,
        borderRadius: 14,
        padding: "10px 14px",
        cursor: "default",
        transition: "all 0.2s ease",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
        boxShadow: hovered
          ? "0 4px 20px rgba(0,0,0,0.4), " + config.glow
          : config.glow,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Status accent line at top */}
      <div style={{
        position: "absolute", top: 0, left: 14, right: 14, height: 2,
        background: config.color, borderRadius: "0 0 2px 2px",
        opacity: step.status === "pending" ? 0.3 : 0.7,
      }} />

      {/* Top row: status icon + title + prompt indicator */}
      <div className="flex items-center gap-2" style={{ minWidth: 0, marginTop: 2 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onStatusCycle(step.id); }}
          title={`${config.label} — click to change`}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: 0, flexShrink: 0, lineHeight: 0,
            transition: "transform 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <StatusIcon size={15} style={{ color: config.color }} />
        </button>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: step.status === "done" ? "var(--vp-text-faint)" : "var(--vp-text-primary)",
            textDecoration: step.status === "done" ? "line-through" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            letterSpacing: "-0.01em",
          }}
        >
          {step.title}
        </div>
        {step.prompt && (
          <div title="Has AI prompt" style={{
            width: 16, height: 16, borderRadius: 4,
            background: "rgba(167,139,250,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Zap size={9} style={{ color: "#a78bfa" }} />
          </div>
        )}
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 10,
          color: "var(--vp-text-dim)",
          lineHeight: 1.4,
          marginTop: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          flex: 1,
        }}
      >
        {step.description || "No description"}
      </div>

      {/* Bottom action bar */}
      <div
        className="flex items-center"
        style={{
          marginTop: 6,
          gap: 3,
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s",
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        {/* Add child */}
        <button
          onClick={(e) => { e.stopPropagation(); onAddChild(step.id); }}
          title="Add branch"
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: "var(--vp-accent-blue-bg)", border: "1px solid var(--vp-accent-blue-border)",
            color: "var(--vp-accent-blue)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-accent-blue-bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--vp-accent-blue-bg)"; }}
        >
          <Plus size={11} />
        </button>

        {/* Send to agent — always visible on hover, sends prompt or title */}
        {step.status !== "done" && (
          <>
            <button
              ref={playBtnRef}
              onClick={togglePicker}
              title={step.prompt ? "Send prompt to agent" : "Send title to agent"}
              style={{
                width: 22, height: 22, borderRadius: 6,
                background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)",
                color: "#a78bfa", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.15)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.08)"; }}
            >
              <Play size={10} />
            </button>
            {/* Portal the AgentPicker to document.body so it's not clipped by SVG foreignObject */}
            {showPicker && pickerPos && createPortal(
              <div
                ref={pickerRef}
                style={{
                  position: "fixed",
                  top: pickerPos.top,
                  left: pickerPos.left,
                  zIndex: 9999,
                }}
              >
                <AgentPicker onSelect={sendToAgent} />
              </div>,
              document.body
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Edit */}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(step); }}
          title="Edit step"
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-subtle)",
            color: "var(--vp-text-muted)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-border-subtle)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface)"; }}
        >
          <Pencil size={10} />
        </button>

        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(step.id); }}
          title="Delete step"
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
            color: "var(--vp-accent-red)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.05)"; }}
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );
}
