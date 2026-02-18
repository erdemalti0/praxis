import { create } from "zustand";
import type { HistoryEntry, ProjectInfo } from "../types/session";
import type { DailyStats } from "../types/stats";
import type { TeamConfig } from "../types/session";
import type { LayoutNode } from "../types/layout";
import { loadJsonFile } from "../lib/persistence";
import { removePaneAndCollapse, addSessionToLayout } from "../lib/layout/layoutUtils";

export type ViewMode = "missions" | "terminal" | "split" | "browser" | "editor" | "runner";
export type SidebarTab = "agents" | "explorer" | "search" | "git" | "services";

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
  showCustomizePanel: boolean;
  widgetDividerRatio: number;
  topPaneContent: "terminal" | "widgets";
  showMissionPanel: boolean;
  fullscreenWidgetId: string | null;
  commandPaletteOpen: boolean;
  activeSidebarTab: SidebarTab;
  setActiveSidebarTab: (tab: SidebarTab) => void;
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
  setShowCustomizePanel: (show: boolean) => void;
  setWidgetDividerRatio: (ratio: number) => void;
  setTopPaneContent: (content: "terminal" | "widgets") => void;
  swapPanes: () => void;
  setShowMissionPanel: (show: boolean) => void;
  toggleMissionPanel: () => void;
  setFullscreenWidgetId: (id: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  moveSessionToGroup: (sessionId: string, sourceGroupId: string, targetGroupId: string) => void;
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
  showCustomizePanel: false,
  widgetDividerRatio: 0.7,
  topPaneContent: "terminal" as "terminal" | "widgets",
  showMissionPanel: false,
  fullscreenWidgetId: null,
  commandPaletteOpen: false,
  activeSidebarTab: "agents",
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
    const defaultGroupId = `tg-${ws.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
  setShowCustomizePanel: (show) => set({ showCustomizePanel: show, showWidgetCatalog: show }),
  setWidgetDividerRatio: (ratio) => set({ widgetDividerRatio: Math.max(0.2, Math.min(0.8, ratio)) }),
  setTopPaneContent: (content) => set({ topPaneContent: content }),
  swapPanes: () => set((s) => ({ topPaneContent: s.topPaneContent === "terminal" ? "widgets" : "terminal" })),
  setShowMissionPanel: (show) => set({ showMissionPanel: show }),
  toggleMissionPanel: () => set((s) => ({ showMissionPanel: !s.showMissionPanel })),
  setFullscreenWidgetId: (id) => set({ fullscreenWidgetId: id }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab, sidebarCollapsed: false }),

  moveSessionToGroup: (sessionId, sourceGroupId, targetGroupId) => set((s) => {
    if (sourceGroupId === targetGroupId) return s;

    const sourceLayout = s.workspaceLayouts[sourceGroupId];
    const targetLayout = s.workspaceLayouts[targetGroupId];
    if (!sourceLayout || !targetLayout) return s;

    // Remove from source, add to target
    const newSourceLayout = removePaneAndCollapse(sourceLayout, sessionId);
    const newTargetLayout = addSessionToLayout(targetLayout, sessionId);

    const newLayouts = {
      ...s.workspaceLayouts,
      [sourceGroupId]: newSourceLayout,
      [targetGroupId]: newTargetLayout,
    };

    // Check if source group is now empty (single null leaf) and should be removed
    const sourceIsEmpty = newSourceLayout.type === "leaf" && !newSourceLayout.sessionId;
    let newTerminalGroups = s.terminalGroups;
    let newActiveTerminalGroup = s.activeTerminalGroup;

    if (sourceIsEmpty) {
      // Find which workspace owns the source group
      const sourceWsId = Object.entries(s.terminalGroups).find(
        ([, groups]) => groups.includes(sourceGroupId)
      )?.[0];

      if (sourceWsId) {
        const wsGroups = s.terminalGroups[sourceWsId] || [];
        if (wsGroups.length > 1) {
          // Remove the empty source group
          const filteredGroups = wsGroups.filter((g) => g !== sourceGroupId);
          delete newLayouts[sourceGroupId];
          newTerminalGroups = { ...newTerminalGroups, [sourceWsId]: filteredGroups };
          if (s.activeTerminalGroup[sourceWsId] === sourceGroupId) {
            newActiveTerminalGroup = {
              ...newActiveTerminalGroup,
              [sourceWsId]: filteredGroups[filteredGroups.length - 1] || "",
            };
          }
        }
      }
    }

    return {
      workspaceLayouts: newLayouts,
      terminalGroups: newTerminalGroups,
      activeTerminalGroup: newActiveTerminalGroup,
    };
  }),

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

    // Track which groupIds have already been claimed by a workspace
    // to detect and fix collisions from the old Date.now()-only ID bug
    const claimedGroupIds = new Set<string>();

    for (const ws of data.workspaces) {
      const savedGroups = data.terminalGroups?.[ws.id];
      const savedActiveGroup = data.activeTerminalGroup?.[ws.id];

      if (savedGroups && savedGroups.length > 0) {
        // Check for group ID collisions — if another workspace already claimed
        // any of these group IDs, generate fresh ones for this workspace
        const hasCollision = savedGroups.some((gid) => claimedGroupIds.has(gid));

        if (hasCollision) {
          // Collision detected — create fresh group for this workspace
          const freshGroupId = `tg-${ws.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          terminalGroups[ws.id] = [freshGroupId];
          activeTerminalGroup[ws.id] = freshGroupId;
          workspaceLayouts[freshGroupId] = { type: "leaf", sessionId: null };
          claimedGroupIds.add(freshGroupId);
        } else {
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
            claimedGroupIds.add(gid);
          }
        }
      } else {
        // No saved layout — create fresh empty leaf
        const groupId = `tg-${ws.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        terminalGroups[ws.id] = [groupId];
        activeTerminalGroup[ws.id] = groupId;
        workspaceLayouts[groupId] = { type: "leaf", sessionId: null };
        claimedGroupIds.add(groupId);
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
