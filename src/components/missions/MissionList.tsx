import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Trash2, Map, Download, Upload } from "lucide-react";
import type { Mission } from "../../types/mission";
import { useMissionStore } from "../../stores/missionStore";
import { useConfirmStore } from "../../stores/confirmStore";
import MissionCreateDialog from "./MissionCreateDialog";
import MissionExportImportDialog from "./MissionExportImportDialog";

interface MissionListProps {
  missions: Mission[];
  activeMissionId: string | null;
  projectPath: string;
}

export default function MissionList({ missions, activeMissionId, projectPath }: MissionListProps) {
  const setActiveMission = useMissionStore((s) => s.setActiveMission);
  const addMission = useMissionStore((s) => s.addMission);
  const deleteMission = useMissionStore((s) => s.deleteMission);
  const [showCreate, setShowCreate] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showExportImport, setShowExportImport] = useState(false);
  const [exportImportTab, setExportImportTab] = useState<"export" | "import">("export");

  const handleCreate = async (title: string, description: string) => {
    await addMission(projectPath, title, description);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    useConfirmStore.getState().showConfirm("Delete Mission", "Delete this mission and all its steps?", () => {
      deleteMission(projectPath, id);
    }, { danger: true });
  };

  const getProgress = (mission: Mission) => {
    if (mission.steps.length === 0) return null;
    const done = mission.steps.filter((s) => s.status === "done").length;
    return { done, total: mission.steps.length, pct: Math.round((done / mission.steps.length) * 100) };
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
          Missions
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setExportImportTab("import"); setShowExportImport(true); }}
            title="Import Mission"
            style={{
              width: 24, height: 24, borderRadius: "var(--vp-radius-md)",
              background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-light)",
              color: "var(--vp-text-muted)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--vp-text-primary)"; e.currentTarget.style.borderColor = "var(--vp-border-medium)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--vp-text-muted)"; e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
          >
            <Upload size={11} />
          </button>
          {missions.length > 0 && (
            <button
              onClick={() => { setExportImportTab("export"); setShowExportImport(true); }}
              title="Export Missions"
              style={{
                width: 24, height: 24, borderRadius: "var(--vp-radius-md)",
                background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-light)",
                color: "var(--vp-text-muted)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--vp-text-primary)"; e.currentTarget.style.borderColor = "var(--vp-border-medium)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--vp-text-muted)"; e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
            >
              <Download size={11} />
            </button>
          )}
          <button
            onClick={() => setShowCreate(true)}
            title="New Mission"
            style={{
              width: 24, height: 24, borderRadius: "var(--vp-radius-md)",
              background: "var(--vp-accent-blue-bg)", border: "1px solid var(--vp-accent-blue-border)",
              color: "var(--vp-accent-blue)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-accent-blue-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--vp-accent-blue-bg)"; }}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Mission list */}
      <MissionVirtualList
        missions={missions}
        activeMissionId={activeMissionId}
        hoveredId={hoveredId}
        setHoveredId={setHoveredId}
        setActiveMission={setActiveMission}
        handleDelete={handleDelete}
        getProgress={getProgress}
      />

      <MissionCreateDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
      />

      <MissionExportImportDialog
        open={showExportImport}
        onClose={() => setShowExportImport(false)}
        missions={missions}
        projectPath={projectPath}
        initialTab={exportImportTab}
      />
    </div>
  );
}

/* ── Virtualized mission list ── */
const MISSION_ROW_HEIGHT = 58; // estimated px per mission row

function MissionVirtualList({
  missions,
  activeMissionId,
  hoveredId,
  setHoveredId,
  setActiveMission,
  handleDelete,
  getProgress,
}: {
  missions: Mission[];
  activeMissionId: string | null;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  setActiveMission: (id: string) => void;
  handleDelete: (e: React.MouseEvent, id: string) => void;
  getProgress: (m: Mission) => { done: number; total: number; pct: number } | null;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: missions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => MISSION_ROW_HEIGHT,
    overscan: 5,
  });

  if (missions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{
        padding: "32px 12px", textAlign: "center", color: "var(--vp-text-subtle)", gap: 8,
      }}>
        <Map size={20} style={{ color: "var(--vp-text-subtle)" }} />
        <span style={{ fontSize: 11, color: "var(--vp-text-subtle)" }}>No missions yet</span>
        <span style={{ fontSize: 10, color: "var(--vp-text-subtle)" }}>Create one to get started</span>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto" style={{ padding: "6px 0" }}>
      <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const mission = missions[virtualRow.index];
          const isActive = mission.id === activeMissionId;
          const isHovered = mission.id === hoveredId;
          const progress = getProgress(mission);
          return (
            <div
              key={mission.id}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                onClick={() => setActiveMission(mission.id)}
                onMouseEnter={() => setHoveredId(mission.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  padding: "10px 12px",
                  margin: "2px 6px",
                  borderRadius: "var(--vp-radius-xl)",
                  background: isActive
                    ? "var(--vp-accent-blue-bg)"
                    : isHovered
                      ? "var(--vp-bg-surface)"
                      : "transparent",
                  border: isActive
                    ? "1px solid var(--vp-accent-blue-border)"
                    : "1px solid transparent",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  position: "relative",
                }}
              >
                <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                  <Map size={13} style={{
                    color: isActive ? "var(--vp-accent-blue)" : "var(--vp-text-subtle)",
                    flexShrink: 0,
                    transition: "color 0.15s",
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600,
                      color: isActive ? "var(--vp-text-primary)" : "var(--vp-text-muted)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {mission.title}
                    </div>
                    {mission.description && (
                      <div style={{
                        fontSize: 9, color: "var(--vp-text-subtle)", marginTop: 2,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {mission.description}
                      </div>
                    )}
                  </div>
                  {isHovered && (
                    <button
                      onClick={(e) => handleDelete(e, mission.id)}
                      title="Delete mission"
                      style={{
                        width: 20, height: 20, borderRadius: "var(--vp-radius-sm)",
                        background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
                        color: "var(--vp-accent-red)", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
                {progress && (
                  <div style={{ marginTop: 8 }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
                      <span style={{ fontSize: 9, color: "var(--vp-text-faint)" }}>
                        {progress.done}/{progress.total} steps
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        color: progress.pct === 100 ? "var(--vp-accent-green)" : "var(--vp-text-faint)",
                      }}>
                        {progress.pct}%
                      </span>
                    </div>
                    <div style={{
                      width: "100%", height: 3, borderRadius: "var(--vp-radius-xs)",
                      background: "var(--vp-bg-surface)",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${progress.pct}%`,
                        height: "100%", borderRadius: "var(--vp-radius-xs)",
                        background: progress.pct === 100
                          ? "linear-gradient(90deg, var(--vp-accent-green), #22c55e)"
                          : "linear-gradient(90deg, var(--vp-accent-blue), #3b82f6)",
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
