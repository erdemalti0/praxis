import { useEffect, useState, useCallback, memo } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { useUIStore } from "../../stores/uiStore";
import { useShallow } from "zustand/shallow";
import TaskCreateDialog from "./TaskCreateDialog";
import TaskCard from "./TaskCard";
import { Plus, Loader2, ListTodo, X } from "lucide-react";
import type { TaskStatus, PraxisTask } from "../../types/session";

const statusSections: { key: TaskStatus; label: string; color: string; icon: string }[] = [
  { key: "todo", label: "To Do", color: "var(--vp-text-muted)", icon: "○" },
  { key: "in_progress", label: "In Progress", color: "var(--vp-accent-blue)", icon: "◑" },
  { key: "done", label: "Done", color: "var(--vp-accent-green)", icon: "●" },
];

interface Props {
  variant: "full" | "panel";
}

function sortByDate(arr: PraxisTask[]) {
  return [...arr].sort((a, b) => b.updatedAt - a.updatedAt);
}

export default memo(function TaskBoard({ variant }: Props) {
  const { selectedProject, setViewMode, setSplitEnabled } = useUIStore(
    useShallow((s) => ({
      selectedProject: s.selectedProject,
      setViewMode: s.setViewMode,
      setSplitEnabled: s.setSplitEnabled,
    }))
  );
  const tasks = useTaskStore((s) => s.tasks);
  const loading = useTaskStore((s) => s.loading);
  const loadTasks = useTaskStore((s) => s.loadTasks);
  const moveTask = useTaskStore((s) => s.moveTask);
  const [showCreate, setShowCreate] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<TaskStatus>>(new Set());
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  useEffect(() => {
    if (selectedProject?.path) {
      loadTasks(selectedProject.path);
    }
  }, [selectedProject?.path, loadTasks]);

  const toggleSection = (key: TaskStatus) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleColumnDragOver = useCallback((e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  }, []);

  const handleColumnDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleColumnDrop = useCallback(
    (e: React.DragEvent, status: TaskStatus) => {
      e.preventDefault();
      setDragOverColumn(null);
      const taskId = e.dataTransfer.getData("application/task-id");
      if (!taskId || !selectedProject?.path) return;
      // Don't move if already in this status
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status === status) return;
      moveTask(selectedProject.path, taskId, status);
    },
    [selectedProject?.path, tasks, moveTask]
  );

  if (!selectedProject) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center gap-2"
        style={{ color: "var(--vp-text-faint)", fontSize: 12 }}
      >
        <ListTodo size={20} style={{ color: "var(--vp-text-subtle)" }} />
        <span>Select a project</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: "var(--vp-text-dim)" }}>
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  /* ───── FULL variant: horizontal kanban ───── */
  if (variant === "full") {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--vp-border-subtle)" }}
        >
          <div className="flex items-center gap-3">
            <ListTodo size={14} style={{ color: "var(--vp-text-muted)" }} />
            <span style={{ color: "var(--vp-text-primary)", fontSize: 13, fontWeight: 600 }}>Tasks</span>
            <span
              style={{
                color: "var(--vp-text-faint)",
                fontSize: 10,
                background: "var(--vp-bg-surface-hover)",
                borderRadius: "var(--vp-radius-xl)",
                padding: "1px 8px",
                fontFamily: "monospace",
              }}
            >
              {tasks.length}
            </span>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5"
            style={{
              background: "var(--vp-bg-surface-hover)",
              border: "1px solid var(--vp-border-medium)",
              borderRadius: "var(--vp-radius-lg)",
              color: "var(--vp-text-primary)",
              fontSize: 12,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--vp-border-light)";
              e.currentTarget.style.borderColor = "var(--vp-border-medium)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
              e.currentTarget.style.borderColor = "var(--vp-border-medium)";
            }}
          >
            <Plus size={13} />
            <span>New Task</span>
          </button>
        </div>

        {/* Kanban columns */}
        <div className="flex-1 flex gap-4 overflow-x-auto p-5" style={{ minHeight: 0 }}>
          {statusSections.map((section) => {
            const sectionTasks = sortByDate(tasks.filter((t) => t.status === section.key));
            const isOver = dragOverColumn === section.key;
            return (
              <div
                key={section.key}
                className="flex flex-col min-w-0"
                style={{
                  flex: "1 1 0",
                  minWidth: 260,
                  background: isOver ? "var(--vp-bg-surface)" : "transparent",
                  borderRadius: "var(--vp-radius-2xl)",
                  transition: "background 0.15s",
                }}
                onDragOver={(e) => handleColumnDragOver(e, section.key)}
                onDragLeave={handleColumnDragLeave}
                onDrop={(e) => handleColumnDrop(e, section.key)}
              >
                {/* Column header */}
                <div
                  className="flex items-center gap-2 px-3 py-2.5 mb-2"
                  style={{
                    background: "var(--vp-bg-surface)",
                    borderRadius: "var(--vp-radius-xl)",
                    border: isOver
                      ? `1px solid ${section.color}40`
                      : "1px solid var(--vp-bg-surface)",
                    transition: "all 0.15s",
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: section.color,
                      boxShadow: `0 0 6px ${section.color}30`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--vp-text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      flex: 1,
                    }}
                  >
                    {section.label}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--vp-text-faint)",
                      background: "var(--vp-bg-surface-hover)",
                      borderRadius: "var(--vp-radius-lg)",
                      padding: "0 6px",
                      fontFamily: "monospace",
                      lineHeight: "18px",
                    }}
                  >
                    {sectionTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto flex flex-col gap-2 px-1 pb-2">
                  {sectionTasks.map((task) => (
                    <TaskCard key={task.id} task={task} projectPath={selectedProject.path} />
                  ))}
                  {sectionTasks.length === 0 && (
                    <div
                      className="flex items-center justify-center py-10"
                      style={{
                        color: "var(--vp-text-subtle)",
                        fontSize: 11,
                        border: isOver
                          ? `2px dashed ${section.color}60`
                          : "1px dashed var(--vp-bg-surface-hover)",
                        borderRadius: "var(--vp-radius-xl)",
                        transition: "all 0.15s",
                        background: isOver ? `${section.color}08` : "transparent",
                      }}
                    >
                      {isOver ? "Drop here" : "No tasks"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {showCreate && (
          <TaskCreateDialog projectPath={selectedProject.path} onClose={() => setShowCreate(false)} />
        )}
      </div>
    );
  }

  /* ───── PANEL variant: vertical compact list ───── */
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--vp-border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <ListTodo size={13} style={{ color: "var(--vp-text-muted)" }} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--vp-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Tasks
          </span>
          <span
            style={{
              fontSize: 10,
              color: "var(--vp-text-faint)",
              background: "var(--vp-bg-surface-hover)",
              borderRadius: "var(--vp-radius-lg)",
              padding: "0 6px",
              fontFamily: "monospace",
            }}
          >
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCreate(true)}
            title="New Task"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--vp-text-faint)",
              padding: 4,
              borderRadius: "var(--vp-radius-md)",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-text-primary)";
              e.currentTarget.style.background = "var(--vp-border-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-faint)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => { setSplitEnabled(false); setViewMode("terminal"); }}
            title="Close task panel"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--vp-text-faint)",
              padding: 4,
              borderRadius: "var(--vp-radius-md)",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-text-primary)";
              e.currentTarget.style.background = "var(--vp-border-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-faint)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto px-2 py-2" style={{ minHeight: 0 }}>
        {statusSections.map((section) => {
          const sectionTasks = sortByDate(tasks.filter((t) => t.status === section.key));
          const isCollapsed = collapsedSections.has(section.key);
          const isOver = dragOverColumn === section.key;

          return (
            <div
              key={section.key}
              className="mb-3"
              onDragOver={(e) => handleColumnDragOver(e, section.key)}
              onDragLeave={handleColumnDragLeave}
              onDrop={(e) => handleColumnDrop(e, section.key)}
              style={{
                background: isOver ? "var(--vp-bg-surface)" : "transparent",
                borderRadius: "var(--vp-radius-lg)",
                transition: "background 0.15s",
                padding: isOver ? 4 : 0,
              }}
            >
              <button
                onClick={() => toggleSection(section.key)}
                className="flex items-center gap-2 px-2 py-1.5 w-full"
                style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: section.color,
                    flexShrink: 0,
                    boxShadow: `0 0 4px ${section.color}30`,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--vp-text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}
                >
                  {section.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--vp-text-faint)",
                    background: "var(--vp-bg-surface-hover)",
                    borderRadius: "var(--vp-radius-lg)",
                    padding: "0 6px",
                    fontFamily: "monospace",
                  }}
                >
                  {sectionTasks.length}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--vp-text-subtle)",
                    marginLeft: "auto",
                    transition: "transform 0.2s",
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  }}
                >
                  ▾
                </span>
              </button>

              {!isCollapsed && (
                <div className="flex flex-col gap-1.5 mt-1">
                  {sectionTasks.map((task) => (
                    <TaskCard key={task.id} task={task} projectPath={selectedProject.path} />
                  ))}
                  {sectionTasks.length === 0 && (
                    <div
                      className="px-3 py-3 text-center"
                      style={{
                        color: isOver ? "var(--vp-text-dim)" : "var(--vp-text-subtle)",
                        fontSize: 11,
                        border: isOver
                          ? `2px dashed ${section.color}60`
                          : "1px dashed var(--vp-bg-surface-hover)",
                        borderRadius: "var(--vp-radius-lg)",
                        background: isOver ? `${section.color}08` : "transparent",
                        transition: "all 0.15s",
                      }}
                    >
                      {isOver ? "Drop here" : "No tasks"}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCreate && (
        <TaskCreateDialog projectPath={selectedProject.path} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
});
