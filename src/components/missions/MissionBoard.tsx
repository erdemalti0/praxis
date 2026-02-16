import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMissionStore } from "../../stores/missionStore";
import { useUIStore } from "../../stores/uiStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { send } from "../../lib/ipc";
import { getSessionIds } from "../../lib/layout/layoutUtils";
import MissionList from "./MissionList";
import MissionFlowChart from "./MissionFlowChart";
import AgentPicker from "./AgentPicker";
import { Map, CheckCircle2, Circle, Clock, AlertCircle, Workflow, X, Play, ChevronRight, ChevronDown, ChevronsUpDown, GitBranch } from "lucide-react";
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
      <PanelVariant
        missions={missions}
        projectPath={projectPath}
        cycleStepStatus={cycleStepStatus}
      />
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

/* ─── Panel variant component ─── */
function PanelVariant({
  missions,
  projectPath,
  cycleStepStatus,
}: {
  missions: ReturnType<typeof useMissionStore.getState>["missions"];
  projectPath: string;
  cycleStepStatus: (pp: string, mid: string, sid: string) => Promise<void>;
}) {
  // Default: first mission expanded, rest collapsed
  const [collapsedMissions, setCollapsedMissions] = useState<Set<string>>(() => {
    const set = new Set<string>();
    missions.slice(1).forEach((m) => set.add(m.id));
    return set;
  });
  const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set());
  const [allCollapsed, setAllCollapsed] = useState(false);

  const toggleMission = useCallback((id: string) => {
    setCollapsedMissions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleStep = useCallback((id: string) => {
    setCollapsedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allCollapsed) {
      setCollapsedMissions(new Set());
      setCollapsedSteps(new Set());
      setAllCollapsed(false);
    } else {
      setCollapsedMissions(new Set(missions.map((m) => m.id)));
      setAllCollapsed(true);
    }
  }, [allCollapsed, missions]);

  return (
    <div className="h-full flex flex-col" style={{ overflow: "hidden" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 flex-shrink-0"
        style={{ height: 40, borderBottom: "1px solid var(--vp-border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <Workflow size={13} style={{ color: "var(--vp-accent-blue)" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--vp-text-primary)" }}>Missions</span>
        </div>
        <div className="flex items-center gap-1">
          {missions.length > 0 && (
            <button
              onClick={toggleAll}
              title={allCollapsed ? "Expand all" : "Collapse all"}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--vp-text-faint)", padding: 2,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 4, transition: "color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--vp-text-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--vp-text-faint)"; }}
            >
              <ChevronsUpDown size={13} />
            </button>
          )}
          <button
            onClick={() => {
              const ui = useUIStore.getState();
              ui.setViewMode("terminal");
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
      </div>

      {/* Mission list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "4px 0" }}>
        {missions.length === 0 && (
          <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--vp-text-subtle)", fontSize: 11 }}>
            No missions yet
          </div>
        )}
        {missions.map((mission, idx) => {
          const done = mission.steps.filter((s) => s.status === "done").length;
          const total = mission.steps.length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const isCollapsed = collapsedMissions.has(mission.id);

          return (
            <div key={mission.id} style={{
              borderBottom: idx < missions.length - 1 ? "1px solid var(--vp-border-subtle)" : "none",
              paddingBottom: isCollapsed ? 0 : 6,
            }}>
              {/* Mission header — clickable to toggle */}
              <div
                className="flex items-center gap-1.5"
                onClick={() => toggleMission(mission.id)}
                style={{
                  padding: "8px 10px",
                  cursor: "pointer",
                  transition: "background 0.1s",
                  borderLeft: "3px solid transparent",
                  borderLeftColor: !isCollapsed ? "var(--vp-accent-blue)" : "transparent",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {/* Chevron */}
                {isCollapsed
                  ? <ChevronRight size={12} style={{ color: "var(--vp-text-faint)", flexShrink: 0 }} />
                  : <ChevronDown size={12} style={{ color: "var(--vp-accent-blue)", flexShrink: 0 }} />
                }
                <Map size={11} style={{ color: "var(--vp-accent-blue)", flexShrink: 0 }} />
                <span style={{
                  fontSize: 11, fontWeight: 600, flex: 1, minWidth: 0,
                  color: isCollapsed ? "var(--vp-text-muted)" : "var(--vp-text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {mission.title}
                </span>
                {total > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 600, flexShrink: 0,
                    padding: "1px 6px", borderRadius: 8,
                    background: pct === 100 ? "rgba(74,222,128,0.12)" : "rgba(96,165,250,0.1)",
                    color: pct === 100 ? "var(--vp-accent-green)" : "var(--vp-accent-blue)",
                  }}>
                    {done}/{total}
                  </span>
                )}
              </div>

              {/* Progress bar — always visible */}
              {total > 0 && (
                <div style={{ margin: "0 12px 4px 28px", height: 2, borderRadius: 1, background: "var(--vp-bg-surface)", overflow: "hidden" }}>
                  <div style={{
                    width: `${pct}%`, height: "100%",
                    background: pct === 100
                      ? "linear-gradient(90deg, var(--vp-accent-green), #22c55e)"
                      : "linear-gradient(90deg, var(--vp-accent-blue), #3b82f6)",
                    borderRadius: 1, transition: "width 0.3s ease",
                  }} />
                </div>
              )}

              {/* Steps — collapsible */}
              {!isCollapsed && (
                <>
                  {mission.steps.length === 0 && (
                    <div style={{ padding: "2px 12px 2px 32px", fontSize: 10, color: "var(--vp-text-subtle)" }}>
                      No steps
                    </div>
                  )}
                  <StepTree
                    steps={mission.steps}
                    parentId={null}
                    depth={0}
                    projectPath={projectPath}
                    missionId={mission.id}
                    cycleStepStatus={cycleStepStatus}
                    collapsedSteps={collapsedSteps}
                    toggleStep={toggleStep}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Step tree for panel variant ─── */
function StepTree({
  steps,
  parentId,
  depth,
  projectPath,
  missionId,
  cycleStepStatus,
  collapsedSteps,
  toggleStep,
}: {
  steps: MissionStep[];
  parentId: string | null;
  depth: number;
  projectPath: string;
  missionId: string;
  cycleStepStatus: (pp: string, mid: string, sid: string) => Promise<void>;
  collapsedSteps: Set<string>;
  toggleStep: (id: string) => void;
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
          collapsedSteps={collapsedSteps}
          toggleStep={toggleStep}
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
  collapsedSteps,
  toggleStep,
}: {
  step: MissionStep;
  steps: MissionStep[];
  depth: number;
  projectPath: string;
  missionId: string;
  cycleStepStatus: (pp: string, mid: string, sid: string) => Promise<void>;
  collapsedSteps: Set<string>;
  toggleStep: (id: string) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const StatusIcon = STATUS_ICONS[step.status];
  const statusColor = STATUS_COLORS[step.status];
  const hasChildren = steps.some((s) => s.parentId === step.id);
  const isCollapsed = collapsedSteps.has(step.id);

  // Resolve dependency names
  const depNames = useMemo(() => {
    if (!step.dependencies || step.dependencies.length === 0) return [];
    return step.dependencies
      .map((depId) => steps.find((s) => s.id === depId)?.title)
      .filter(Boolean) as string[];
  }, [step.dependencies, steps]);

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

  const leftPad = 14 + depth * 16;

  return (
    <>
      <div style={{ position: "relative" }}>
        {/* Vertical guide line for nested items */}
        {depth > 0 && (
          <div style={{
            position: "absolute", left: 14 + (depth - 1) * 16 + 5, top: 0, bottom: 0,
            width: 1, background: "var(--vp-border-subtle)", opacity: 0.5,
          }} />
        )}
        <div
          className="flex items-center"
          style={{
            padding: `5px 10px 5px ${leftPad}px`,
            gap: 6,
            cursor: "pointer",
            transition: "background 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          onClick={() => cycleStepStatus(projectPath, missionId, step.id)}
          title={`Click to change status (${step.status})`}
        >
          {/* Chevron for parent steps */}
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleStep(step.id); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: 0, flexShrink: 0, lineHeight: 0,
                color: "var(--vp-text-faint)",
              }}
            >
              {isCollapsed
                ? <ChevronRight size={10} />
                : <ChevronDown size={10} />
              }
            </button>
          ) : (
            <span style={{ width: 10, flexShrink: 0 }} />
          )}
          <StatusIcon size={11} style={{ color: statusColor, flexShrink: 0 }} />
          <span style={{
            fontSize: 11,
            color: step.status === "done" ? "var(--vp-text-faint)" : "var(--vp-text-secondary)",
            textDecoration: step.status === "done" ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1,
            fontWeight: hasChildren ? 600 : 400,
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
            <span style={{ fontSize: 8, color: "#a78bfa", flexShrink: 0, fontWeight: 600 }}>AI</span>
          )}
        </div>
        {/* Dependency indicator */}
        {depNames.length > 0 && (
          <div
            className="flex items-center gap-1"
            style={{
              padding: `1px 10px 3px ${leftPad + 22}px`,
              overflow: "hidden",
            }}
            title={`Depends on: ${depNames.join(", ")}`}
          >
            <GitBranch size={8} style={{ color: "var(--vp-accent-blue)", flexShrink: 0, opacity: 0.6, transform: "rotate(180deg)" }} />
            <span style={{
              fontSize: 9, color: "var(--vp-text-faint)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {depNames.join(", ")}
            </span>
          </div>
        )}
      </div>
      {showPicker && pickerPos && createPortal(
        <div ref={pickerRef} style={{ position: "fixed", top: pickerPos.top, left: pickerPos.left, zIndex: 9999 }}>
          <AgentPicker onSelect={sendToAgent} />
        </div>,
        document.body
      )}
      {!isCollapsed && (
        <StepTree
          steps={steps}
          parentId={step.id}
          depth={depth + 1}
          projectPath={projectPath}
          missionId={missionId}
          cycleStepStatus={cycleStepStatus}
          collapsedSteps={collapsedSteps}
          toggleStep={toggleStep}
        />
      )}
    </>
  );
}
