import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMissionStore } from "../../stores/missionStore";
import { useUIStore } from "../../stores/uiStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { invoke } from "../../lib/ipc";
import { getSessionIds } from "../../lib/layout/layoutUtils";
import MissionList from "./MissionList";
import MissionFlowChart from "./MissionFlowChart";
import AgentPicker from "./AgentPicker";
import { Map, CheckCircle2, Circle, Clock, AlertCircle, Workflow, X, Play } from "lucide-react";
import type { MissionStepStatus, MissionStep } from "../../types/mission";

interface MissionBoardProps {
  variant: "full" | "panel";
}

const STATUS_ICONS: Record<MissionStepStatus, typeof Circle> = {
  pending: Circle,
  in_progress: Clock,
  done: CheckCircle2,
  blocked: AlertCircle,
};

const STATUS_COLORS: Record<MissionStepStatus, string> = {
  pending: "#6b7280",
  in_progress: "#60a5fa",
  done: "#4ade80",
  blocked: "#f59e0b",
};

export default function MissionBoard({ variant }: MissionBoardProps) {
  const missions = useMissionStore((s) => s.missions);
  const activeMissionId = useMissionStore((s) => s.activeMissionId);
  const loadMissions = useMissionStore((s) => s.loadMissions);
  const loading = useMissionStore((s) => s.loading);
  const cycleStepStatus = useMissionStore((s) => s.cycleStepStatus);
  const selectedProject = useUIStore((s) => s.selectedProject);

  useEffect(() => {
    if (selectedProject?.path) {
      loadMissions(selectedProject.path);
    }
  }, [selectedProject?.path, loadMissions]);

  const activeMission = useMemo(
    () => missions.find((m) => m.id === activeMissionId) || null,
    [missions, activeMissionId]
  );

  const projectPath = selectedProject?.path || "";

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: "var(--vp-text-faint)", fontSize: 12 }}>
        Loading missions...
      </div>
    );
  }

  /* ─── Panel variant: compact tree ─── */
  if (variant === "panel") {
    return (
      <div className="h-full flex flex-col" style={{ overflow: "hidden" }}>
        <div
          className="flex items-center justify-between px-3 flex-shrink-0"
          style={{ height: 40, borderBottom: "1px solid var(--vp-border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <Workflow size={13} style={{ color: "var(--vp-accent-blue)" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--vp-text-primary)" }}>Missions</span>
          </div>
          <button
            onClick={() => {
              const ui = useUIStore.getState();
              // In widget mode, toggle the mission panel; in split mode, switch to terminal
              if (ui.workspaces.find((w) => w.id === ui.activeWorkspaceId)?.useWidgetMode) {
                ui.setShowMissionPanel(false);
              } else {
                ui.setViewMode("terminal");
              }
            }}
            title="Close"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--vp-text-faint)", padding: 2,
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: "8px 0" }}>
          {missions.length === 0 && (
            <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--vp-text-subtle)", fontSize: 11 }}>
              No missions yet
            </div>
          )}
          {missions.map((mission) => {
            const done = mission.steps.filter((s) => s.status === "done").length;
            const total = mission.steps.length;
            return (
              <div key={mission.id} style={{ marginBottom: 12 }}>
                {/* Mission header */}
                <div className="flex items-center gap-2" style={{ padding: "4px 12px" }}>
                  <Map size={11} style={{ color: "var(--vp-accent-blue)", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--vp-text-secondary)", flex: 1 }}>
                    {mission.title}
                  </span>
                  {total > 0 && (
                    <span style={{ fontSize: 9, color: "var(--vp-text-faint)" }}>
                      {done}/{total}
                    </span>
                  )}
                </div>
                {/* Progress bar */}
                {total > 0 && (
                  <div style={{ margin: "4px 12px 6px", height: 2, borderRadius: 1, background: "var(--vp-bg-surface)", overflow: "hidden" }}>
                    <div style={{
                      width: `${(done / total) * 100}%`, height: "100%",
                      background: done === total ? "var(--vp-accent-green)" : "var(--vp-accent-blue)",
                      borderRadius: 1, transition: "width 0.3s ease",
                    }} />
                  </div>
                )}
                {mission.steps.length === 0 && (
                  <div style={{ padding: "2px 12px 2px 28px", fontSize: 10, color: "var(--vp-text-subtle)" }}>
                    No steps
                  </div>
                )}
                <StepTree steps={mission.steps} parentId={null} depth={0} projectPath={projectPath} missionId={mission.id} cycleStepStatus={cycleStepStatus} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ─── Full variant: list + flowchart ─── */
  return (
    <div className="h-full flex" style={{ overflow: "hidden" }}>
      {/* Left: mission list */}
      <div style={{ width: 220, minWidth: 220, flexShrink: 0 }}>
        <MissionList
          missions={missions}
          activeMissionId={activeMissionId}
          projectPath={projectPath}
        />
      </div>

      {/* Right: flowchart */}
      <div className="flex-1 min-w-0 min-h-0">
        {activeMission ? (
          <MissionFlowChart mission={activeMission} projectPath={projectPath} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center" style={{ color: "var(--vp-text-subtle)", gap: 12, background: "var(--vp-bg-secondary)" }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: "var(--vp-accent-blue-bg)", border: "1px solid var(--vp-accent-blue-bg)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Workflow size={22} style={{ color: "var(--vp-accent-blue)", opacity: 0.4 }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--vp-text-faint)" }}>
                {missions.length === 0 ? "Create your first mission" : "Select a mission"}
              </div>
              <div style={{ fontSize: 11, color: "var(--vp-text-subtle)", marginTop: 4 }}>
                Plan your workflow with branching steps
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepTree({
  steps,
  parentId,
  depth,
  projectPath,
  missionId,
  cycleStepStatus,
}: {
  steps: MissionStep[];
  parentId: string | null;
  depth: number;
  projectPath: string;
  missionId: string;
  cycleStepStatus: (pp: string, mid: string, sid: string) => Promise<void>;
}) {
  const children = steps.filter((s) => s.parentId === parentId);
  return (
    <>
      {children.map((step) => (
        <StepRow
          key={step.id}
          step={step}
          steps={steps}
          depth={depth}
          projectPath={projectPath}
          missionId={missionId}
          cycleStepStatus={cycleStepStatus}
        />
      ))}
    </>
  );
}

function StepRow({
  step,
  steps,
  depth,
  projectPath,
  missionId,
  cycleStepStatus,
}: {
  step: MissionStep;
  steps: MissionStep[];
  depth: number;
  projectPath: string;
  missionId: string;
  cycleStepStatus: (pp: string, mid: string, sid: string) => Promise<void>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const StatusIcon = STATUS_ICONS[step.status];
  const statusColor = STATUS_COLORS[step.status];

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
          playBtnRef.current && !playBtnRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const togglePicker = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (showPicker) {
      setShowPicker(false);
      return;
    }
    const btn = playBtnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setPickerPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 270) });
    }
    setShowPicker(true);
  }, [showPicker]);

  const sendToAgent = useCallback(
    (sessionId: string, workspaceId: string) => {
      const prompt = step.prompt || step.title;
      invoke("write_pty", { id: sessionId, data: prompt + "\n" }).catch(() => {});
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
    <>
      <div
        className="flex items-center"
        style={{
          padding: `3px 12px 3px ${16 + depth * 18}px`,
          gap: 7,
          cursor: "pointer",
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        onClick={() => cycleStepStatus(projectPath, missionId, step.id)}
        title={`Click to change status (${step.status})`}
      >
        <StatusIcon size={11} style={{ color: statusColor, flexShrink: 0 }} />
        <span style={{
          fontSize: 10,
          color: step.status === "done" ? "var(--vp-text-faint)" : "var(--vp-text-secondary)",
          textDecoration: step.status === "done" ? "line-through" : "none",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1,
        }}>
          {step.title}
        </span>
        {step.prompt && step.status !== "done" && (
          <button
            ref={playBtnRef}
            onClick={togglePicker}
            title="Run — send prompt to agent"
            style={{
              width: 18, height: 18, borderRadius: 5,
              background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)",
              color: "#a78bfa", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "all 0.15s", padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.18)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(167,139,250,0.08)"; }}
          >
            <Play size={9} />
          </button>
        )}
        {step.prompt && (
          <span style={{ fontSize: 8, color: "#a78bfa", flexShrink: 0 }}>AI</span>
        )}
      </div>
      {showPicker && pickerPos && createPortal(
        <div ref={pickerRef} style={{ position: "fixed", top: pickerPos.top, left: pickerPos.left, zIndex: 9999 }}>
          <AgentPicker onSelect={sendToAgent} />
        </div>,
        document.body
      )}
      <StepTree
        steps={steps}
        parentId={step.id}
        depth={depth + 1}
        projectPath={projectPath}
        missionId={missionId}
        cycleStepStatus={cycleStepStatus}
      />
    </>
  );
}
