import TaskBoard from "../../tasks/TaskBoard";
import type { TasksConfig } from "../../../types/widget";
import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";

export default function TasksWidget({
  widgetId: _widgetId,
  config = {},
}: {
  widgetId: string;
  config?: TasksConfig;
}) {
  const [viewMode, setViewMode] = useState<"kanban" | "list">(config.viewMode ?? "kanban");
  const [filter, setFilter] = useState(config.filter ?? "all");

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex items-center gap-2"
        style={{
          padding: "4px 8px",
          borderBottom: "1px solid var(--vp-bg-surface-hover)",
        }}
      >
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          style={{
            background: "var(--vp-bg-surface-hover)",
            border: "1px solid var(--vp-border-light)",
            borderRadius: "var(--vp-radius-sm)",
            padding: "3px 6px",
            fontSize: 10,
            color: "var(--vp-text-muted)",
            outline: "none",
          }}
        >
          <option value="all">All Tasks</option>
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
        <span style={{ flex: 1 }} />
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("kanban")}
            style={{
              background: viewMode === "kanban" ? "var(--vp-border-light)" : "none",
              border: "none",
              color: viewMode === "kanban" ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
              cursor: "pointer",
              padding: 4,
              borderRadius: "var(--vp-radius-sm)",
            }}
            title="Kanban view"
          >
            <LayoutGrid size={12} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            style={{
              background: viewMode === "list" ? "var(--vp-border-light)" : "none",
              border: "none",
              color: viewMode === "list" ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
              cursor: "pointer",
              padding: 4,
              borderRadius: "var(--vp-radius-sm)",
            }}
            title="List view"
          >
            <List size={12} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <TaskBoard variant={viewMode === "kanban" ? "full" : "panel"} />
      </div>
    </div>
  );
}
