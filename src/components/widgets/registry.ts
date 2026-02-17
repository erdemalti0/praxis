import type { WidgetDefinition } from "../../types/widget";
import { lazy, type ComponentType } from "react";

export const WIDGET_REGISTRY: WidgetDefinition[] = [
  // Core
  { type: "mission-board", name: "Missions", description: "Mission planner side panel", icon: "Target", category: "core", defaultSize: { w: 0, h: 0 }, minSize: { w: 0, h: 0 }, singleton: true, panelWidget: true },
{ type: "file-explorer", name: "File Explorer", description: "Directory tree browser", icon: "FolderOpen", category: "core", defaultSize: { w: 3, h: 8 }, minSize: { w: 2, h: 4 } },
  { type: "agent-monitor", name: "Agent Monitor", description: "Running AI agents with status", icon: "Cpu", category: "monitoring", defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },

  // Monitoring
  { type: "system-monitor", name: "System Monitor", description: "CPU, RAM, and disk usage gauges", icon: "Activity", category: "monitoring", defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },
  { type: "port-monitor", name: "Port Monitor", description: "Active ports & local dev servers", icon: "Network", category: "monitoring", defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },
  { type: "log-viewer", name: "Log Viewer", description: "Tail log files in real-time", icon: "FileText", category: "monitoring", defaultSize: { w: 6, h: 6 }, minSize: { w: 3, h: 4 } },

  // Development
  { type: "git-status", name: "Git Status", description: "Branch, staged/unstaged changes", icon: "GitBranch", category: "development", defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },
  { type: "diff-viewer", name: "Diff Viewer", description: "Side-by-side diff view", icon: "GitPullRequest", category: "development", defaultSize: { w: 6, h: 8 }, minSize: { w: 3, h: 4 } },
  { type: "markdown-preview", name: "Markdown Preview", description: "Live markdown rendering", icon: "FileCode", category: "development", defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },

  // Productivity
  { type: "notes", name: "Notes", description: "Quick markdown notes per workspace", icon: "StickyNote", category: "productivity", defaultSize: { w: 4, h: 6 }, minSize: { w: 2, h: 4 } },
  { type: "quick-command", name: "Quick Command", description: "Command palette and shortcuts", icon: "Zap", category: "productivity", defaultSize: { w: 3, h: 4 }, minSize: { w: 2, h: 2 } },
  { type: "pomodoro", name: "Pomodoro", description: "Focus timer with session tracking", icon: "Timer", category: "productivity", defaultSize: { w: 3, h: 6 }, minSize: { w: 3, h: 6 } },
  { type: "bookmarks", name: "Bookmarks", description: "URL and file bookmarks collection", icon: "Bookmark", category: "productivity", defaultSize: { w: 3, h: 6 }, minSize: { w: 2, h: 4 } },

  // New widgets
  { type: "prompt-library", name: "Prompt Library", description: "AI prompt collection with categories", icon: "BookOpen", category: "productivity", defaultSize: { w: 4, h: 8 }, minSize: { w: 3, h: 4 } },
];

// Lazy-loaded component map
const WIDGET_COMPONENTS: Record<string, () => Promise<{ default: ComponentType<{ widgetId: string; workspaceId: string; config?: Record<string, any> }> }>> = {
  "terminal": () => import("./core/TerminalWidget"),
  "file-explorer": () => import("./core/FileExplorerWidget"),
  "agent-monitor": () => import("./monitoring/AgentMonitorWidget"),
  "system-monitor": () => import("./monitoring/SystemMonitorWidget"),
  "port-monitor": () => import("./monitoring/PortMonitorWidget"),
  "log-viewer": () => import("./monitoring/LogViewerWidget"),
  "git-status": () => import("./development/GitStatusWidget"),
  "diff-viewer": () => import("./development/DiffViewerWidget"),
  "markdown-preview": () => import("./development/MarkdownPreviewWidget"),
  "notes": () => import("./productivity/NotesWidget"),
  "quick-command": () => import("./productivity/QuickCommandWidget"),
  "pomodoro": () => import("./productivity/PomodoroWidget"),
  "bookmarks": () => import("./productivity/BookmarksWidget"),
  "prompt-library": () => import("./productivity/PromptLibraryWidget"),
};

const lazyCache: Record<string, ComponentType<any>> = {};

export function getWidgetComponent(type: string): ComponentType<{ widgetId: string; workspaceId: string; config?: Record<string, any> }> | null {
  if (lazyCache[type]) return lazyCache[type];
  const loader = WIDGET_COMPONENTS[type];
  if (!loader) return null;
  const LazyComponent = lazy(loader);
  lazyCache[type] = LazyComponent;
  return LazyComponent;
}

export function getWidgetDefinition(type: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find((d) => d.type === type);
}
