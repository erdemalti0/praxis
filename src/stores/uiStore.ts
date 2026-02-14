import { create } from "zustand";
import type { HistoryEntry, ProjectInfo } from "../types/session";
import type { DailyStats } from "../types/stats";
import type { TeamConfig } from "../types/session";
import type { LayoutNode } from "../types/layout";
import { loadJsonFile } from "../lib/persistence";

export type ViewMode = "missions" | "terminal" | "split" | "browser" | "editor";

/** Walk a LayoutNode tree and null out all sessionIds (PTY sessions are ephemeral) */
function clearSessionIds(node: LayoutNode): LayoutNode {
  if (node.type === "leaf") return { type: "leaf", sessionId: null };
  return {
    type: "split",
    direction: node.direction,
    ratio: node.ratio,
    children: [clearSessionIds(node.children[0]), clearSessionIds(node.children[1])],
  };
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  useWidgetMode?: boolean;
  emoji?: string;
}

// Soft, eye-friendly workspace colors
const WORKSPACE_COLORS = [
  "#60a5fa", // blue
  "#a78bfa", // purple
  "#34d399", // emerald
  "#fb923c", // orange
  "#f472b6", // pink
  "#38bdf8", // sky
  "#facc15", // yellow
  "#4ade80", // green
];

interface UIState {
  viewMode: ViewMode;
  splitEnabled: boolean;
  sidebarWidth: number;
  bottomPanelHeight: number;
  showSpawnDialog: boolean;
  historyEntries: HistoryEntry[];
  todayStats: DailyStats | null;
  teams: TeamConfig[];
  sidebarCollapsed: boolean;
  draggingTab: string | null;
  terminalMaximized: boolean;
  selectedProject: ProjectInfo | null;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  workspaceLayouts: Record<string, LayoutNode>;
  terminalGroups: Record<string, string[]>;
  activeTerminalGroup: Record<string, string>;
  focusedPaneSessionId: string | null;
  splitSpawnContext: { sessionId: string; direction: "horizontal" | "vertical" } | null;
  draggingPaneSessionId: string | null;
  showWidgetCatalog: boolean;
  showMissionPanel: boolean;
  fullscreenWidgetId: string | null;
  commandPaletteOpen: boolean;
  setViewMode: (mode: ViewMode) => void;
  setSplitEnabled: (enabled: boolean) => void;
  setTerminalMaximized: (maximized: boolean) => void;
  setDraggingTab: (tab: string | null) => void;
  setSidebarWidth: (w: number) => void;
  setBottomPanelHeight: (h: number) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setShowSpawnDialog: (show: boolean) => void;
  setHistoryEntries: (entries: HistoryEntry[]) => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  setTodayStats: (stats: DailyStats | null) => void;
  setTeams: (teams: TeamConfig[]) => void;
  setSelectedProject: (project: ProjectInfo | null) => void;
  addWorkspace: (ws: Omit<Workspace, "color"> & { color?: string }) => void;
  removeWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  setActiveWorkspaceId: (id: string) => void;
  setWorkspaceLayout: (wsId: string, layout: LayoutNode) => void;
  addTerminalGroup: (workspaceId: string) => string;
  removeTerminalGroup: (workspaceId: string, groupId: string) => void;
  setActiveTerminalGroup: (workspaceId: string, groupId: string) => void;
  setFocusedPane: (sessionId: string | null) => void;
  setSplitSpawnContext: (ctx: { sessionId: string; direction: "horizontal" | "vertical" } | null) => void;
  setDraggingPaneSessionId: (sessionId: string | null) => void;
  setShowWidgetCatalog: (show: boolean) => void;
  setShowMissionPanel: (show: boolean) => void;
  toggleMissionPanel: () => void;
  toggleWidgetMode: (workspaceId: string) => void;
  setFullscreenWidgetId: (id: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  reorderWorkspaces: (fromId: string, toId: string) => void;
  setWorkspaceEmoji: (id: string, emoji: string) => void;
  loadUIState: (homeDir: string) => void;
  _uiLoaded: boolean;
}

export const useUIStore = create<UIState>((set) => ({
  viewMode: "terminal",
  splitEnabled: false,
  sidebarWidth: 280,
  bottomPanelHeight: 200,
  showSpawnDialog: false,
  historyEntries: [],
  todayStats: null,
  teams: [],
  sidebarCollapsed: false,
  draggingTab: null,
  terminalMaximized: false,
  selectedProject: null,
  workspaces: [],
  activeWorkspaceId: null,
  workspaceLayouts: {},
  terminalGroups: {},
  activeTerminalGroup: {},
  focusedPaneSessionId: null,
  splitSpawnContext: null,
  draggingPaneSessionId: null,
  showWidgetCatalog: false,
  showMissionPanel: false,
  fullscreenWidgetId: null,
  commandPaletteOpen: false,
  _uiLoaded: false,

  setViewMode: (mode) => set((s) => ({
    viewMode: mode,
    splitEnabled: mode === "split" ? true : s.splitEnabled,
  })),
  setSplitEnabled: (enabled) => set({ splitEnabled: enabled }),
  setTerminalMaximized: (maximized) => set({ terminalMaximized: maximized }),
  setDraggingTab: (tab) => set({ draggingTab: tab }),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setBottomPanelHeight: (h) => set({ bottomPanelHeight: h }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setShowSpawnDialog: (show) => set({ showSpawnDialog: show }),
  setHistoryEntries: (entries) => set({ historyEntries: entries }),
  addHistoryEntry: (entry) =>
    set((state) => ({
      historyEntries: [entry, ...state.historyEntries],
    })),
  setTodayStats: (stats) => set({ todayStats: stats }),
  setTeams: (teams) => set({ teams }),
  setSelectedProject: (project) => set({ selectedProject: project }),
  addWorkspace: (ws) => set((s) => {
    const color = ws.color || WORKSPACE_COLORS[s.workspaces.length % WORKSPACE_COLORS.length];
    const defaultGroupId = `tg-${Date.now()}`;
    return {
      workspaces: [...s.workspaces, { ...ws, color }],
      activeWorkspaceId: ws.id,
      terminalGroups: { ...s.terminalGroups, [ws.id]: [defaultGroupId] },
      activeTerminalGroup: { ...s.activeTerminalGroup, [ws.id]: defaultGroupId },
      workspaceLayouts: { ...s.workspaceLayouts, [defaultGroupId]: { type: "leaf", sessionId: null } },
    };
  }),
  removeWorkspace: (id) => set((s) => {
    const workspaces = s.workspaces.filter((w) => w.id !== id);
    const groupIds = s.terminalGroups[id] || [];
    const newLayouts = { ...s.workspaceLayouts };
    for (const gid of groupIds) delete newLayouts[gid];
    const { [id]: _g, ...newGroups } = s.terminalGroups;
    const { [id]: _a, ...newActiveGroup } = s.activeTerminalGroup;
    return {
      workspaces,
      activeWorkspaceId:
        s.activeWorkspaceId === id
          ? workspaces[workspaces.length - 1]?.id ?? null
          : s.activeWorkspaceId,
      terminalGroups: newGroups,
      activeTerminalGroup: newActiveGroup,
      workspaceLayouts: newLayouts,
    };
  }),
  renameWorkspace: (id, name) => set((s) => ({
    workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)),
  })),
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
  setWorkspaceLayout: (wsId, layout) =>
    set((s) => ({
      workspaceLayouts: { ...s.workspaceLayouts, [wsId]: layout },
    })),
  addTerminalGroup: (workspaceId) => {
    const groupId = `tg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({
      terminalGroups: {
        ...s.terminalGroups,
        [workspaceId]: [...(s.terminalGroups[workspaceId] || []), groupId],
      },
      activeTerminalGroup: { ...s.activeTerminalGroup, [workspaceId]: groupId },
      workspaceLayouts: { ...s.workspaceLayouts, [groupId]: { type: "leaf", sessionId: null } },
    }));
    return groupId;
  },
  removeTerminalGroup: (workspaceId, groupId) => set((s) => {
    const groups = (s.terminalGroups[workspaceId] || []).filter((g) => g !== groupId);
    const { [groupId]: _, ...newLayouts } = s.workspaceLayouts;
    const isActive = s.activeTerminalGroup[workspaceId] === groupId;
    return {
      terminalGroups: { ...s.terminalGroups, [workspaceId]: groups },
      activeTerminalGroup: isActive
        ? { ...s.activeTerminalGroup, [workspaceId]: groups[groups.length - 1] || "" }
        : s.activeTerminalGroup,
      workspaceLayouts: newLayouts,
    };
  }),
  setActiveTerminalGroup: (workspaceId, groupId) => set((s) => ({
    activeTerminalGroup: { ...s.activeTerminalGroup, [workspaceId]: groupId },
  })),
  setFocusedPane: (sessionId) => set({ focusedPaneSessionId: sessionId }),
  setSplitSpawnContext: (ctx) => set({ splitSpawnContext: ctx }),
  setDraggingPaneSessionId: (sessionId) => set({ draggingPaneSessionId: sessionId }),
  setShowWidgetCatalog: (show) => set({ showWidgetCatalog: show }),
  setShowMissionPanel: (show) => set({ showMissionPanel: show }),
  toggleMissionPanel: () => set((s) => ({ showMissionPanel: !s.showMissionPanel })),
  toggleWidgetMode: (workspaceId) => set((s) => ({
    workspaces: s.workspaces.map((w) =>
      w.id === workspaceId ? { ...w, useWidgetMode: !w.useWidgetMode } : w
    ),
  })),
  setFullscreenWidgetId: (id) => set({ fullscreenWidgetId: id }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

  reorderWorkspaces: (fromId, toId) => set((s) => {
    const workspaces = [...s.workspaces];
    const fromIndex = workspaces.findIndex((w) => w.id === fromId);
    const toIndex = workspaces.findIndex((w) => w.id === toId);
    if (fromIndex === -1 || toIndex === -1) return s;
    const [moved] = workspaces.splice(fromIndex, 1);
    workspaces.splice(toIndex, 0, moved);
    return { workspaces };
  }),

  setWorkspaceEmoji: (id, emoji) => set((s) => ({
    workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, emoji } : w)),
  })),

  loadUIState: (homeDir) => {
    const path = `${homeDir}/.praxis/ui-state.json`;
    const data = loadJsonFile(path, {
      sidebarWidth: 280,
      bottomPanelHeight: 200,
      sidebarCollapsed: false,
      viewMode: "terminal" as ViewMode,
      splitEnabled: false,
      workspaces: [] as Workspace[],
      activeWorkspaceId: null as string | null,
      terminalGroups: {} as Record<string, string[]>,
      activeTerminalGroup: {} as Record<string, string>,
      workspaceLayouts: {} as Record<string, LayoutNode>,
    });

    // Restore saved layouts or generate fresh ones
    const terminalGroups: Record<string, string[]> = {};
    const activeTerminalGroup: Record<string, string> = {};
    const workspaceLayouts: Record<string, LayoutNode> = {};

    for (const ws of data.workspaces) {
      const savedGroups = data.terminalGroups?.[ws.id];
      const savedActiveGroup = data.activeTerminalGroup?.[ws.id];

      if (savedGroups && savedGroups.length > 0) {
        // Restore saved layout structure (clear ephemeral sessionIds)
        terminalGroups[ws.id] = savedGroups;
        activeTerminalGroup[ws.id] = savedActiveGroup && savedGroups.includes(savedActiveGroup)
          ? savedActiveGroup
          : savedGroups[0];
        for (const gid of savedGroups) {
          const savedLayout = data.workspaceLayouts?.[gid];
          workspaceLayouts[gid] = savedLayout
            ? clearSessionIds(savedLayout)
            : { type: "leaf", sessionId: null };
        }
      } else {
        // No saved layout — create fresh empty leaf
        const groupId = `tg-restored-${ws.id}-${Date.now()}`;
        terminalGroups[ws.id] = [groupId];
        activeTerminalGroup[ws.id] = groupId;
        workspaceLayouts[groupId] = { type: "leaf", sessionId: null };
      }
    }

    set({
      sidebarWidth: data.sidebarWidth,
      bottomPanelHeight: data.bottomPanelHeight,
      sidebarCollapsed: data.sidebarCollapsed,
      viewMode: data.viewMode,
      splitEnabled: data.splitEnabled,
      workspaces: data.workspaces,
      activeWorkspaceId: data.activeWorkspaceId,
      terminalGroups,
      activeTerminalGroup,
      workspaceLayouts,
      _uiLoaded: true,
    });
  },
}));
