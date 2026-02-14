import { useEffect, useRef } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { useUIStore } from "../stores/uiStore";
import { useWidgetStore } from "../stores/widgetStore";
import { useBrowserStore } from "../stores/browserStore";
import { autoSave, saveJsonFile } from "../lib/persistence";
import { getProjectDataDir } from "../lib/projectSlug";
import type { ViewMode, Workspace } from "../stores/uiStore";

// Keys to persist for each store
const UI_PERSIST_KEYS: (keyof {
  sidebarWidth: number;
  bottomPanelHeight: number;
  sidebarCollapsed: boolean;
  viewMode: ViewMode;
  splitEnabled: boolean;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  terminalGroups: Record<string, string[]>;
  activeTerminalGroup: Record<string, string>;
  workspaceLayouts: Record<string, any>;
})[] = [
  "sidebarWidth",
  "bottomPanelHeight",
  "sidebarCollapsed",
  "viewMode",
  "splitEnabled",
  "workspaces",
  "activeWorkspaceId",
  "terminalGroups",
  "activeTerminalGroup",
  "workspaceLayouts",
];

const BROWSER_PERSIST_KEYS = [
  "tabs",
  "tabGroups",
  "closedTabs",
  "activeBrowserTabId",
] as const;

/**
 * Get project data directory: ~/.praxis/projects/{slug}/
 */
function getProjectDir(): string | null {
  const homeDir = useSettingsStore.getState().homeDir;
  const project = useUIStore.getState().selectedProject;
  if (!homeDir || !project) return null;
  return getProjectDataDir(homeDir, project.path);
}

/**
 * Orchestrates loading persisted state on startup and auto-saving on changes.
 * All data stored under ~/.praxis/ — project folders stay clean.
 * Call once from App.tsx.
 */
export function usePersistence() {
  const homeDir = useSettingsStore((s) => s.homeDir);
  const loaded = useSettingsStore((s) => s.loaded);
  const selectedProject = useUIStore((s) => s.selectedProject);
  const autoSaveSetup = useRef(false);

  // Load global state once homeDir is available
  useEffect(() => {
    if (!loaded || !homeDir) return;

    const uiState = useUIStore.getState();
    if (!uiState._uiLoaded) {
      uiState.loadUIState(homeDir);
    }

    const browserState = useBrowserStore.getState();
    if (!browserState._browserLoaded) {
      browserState.loadBrowserState(homeDir);
    }
  }, [loaded, homeDir]);

  // Load per-project state when project changes
  useEffect(() => {
    if (!selectedProject?.path || !homeDir) return;
    const projectDir = getProjectDataDir(homeDir, selectedProject.path);
    useWidgetStore.getState().loadWidgets(projectDir);
  }, [selectedProject?.path, homeDir]);

  // Set up auto-save subscriptions (once, after settings loaded)
  useEffect(() => {
    if (!loaded || !homeDir || autoSaveSetup.current) return;
    autoSaveSetup.current = true;

    const unsubs = [
      // UI state → ~/.praxis/ui-state.json
      autoSave(
        useUIStore,
        UI_PERSIST_KEYS as any,
        () => `${homeDir}/.praxis/ui-state.json`,
        500,
      ),

      // Widget state → ~/.praxis/projects/{slug}/widgets.json
      autoSave(
        useWidgetStore,
        ["workspaceWidgets", "workspaceLayouts"] as any,
        () => getProjectDir() ? `${getProjectDir()}/widgets.json` : null,
        500,
      ),

      // Browser state → ~/.praxis/browser-state.json
      autoSave(
        useBrowserStore,
        BROWSER_PERSIST_KEYS as any,
        () => `${homeDir}/.praxis/browser-state.json`,
        1000,
      ),
    ];

    return () => unsubs.forEach((u) => u());
  }, [loaded, homeDir]);

  // Flush all state to disk immediately when app is closing
  useEffect(() => {
    const flushAll = () => {
      const home = useSettingsStore.getState().homeDir;
      if (!home) return;

      // Save UI state
      const ui = useUIStore.getState();
      const uiData: Record<string, any> = {};
      for (const k of UI_PERSIST_KEYS) {
        uiData[k] = (ui as any)[k];
      }
      saveJsonFile(`${home}/.praxis/ui-state.json`, uiData);

      // Save browser state
      const browser = useBrowserStore.getState();
      const browserData: Record<string, any> = {};
      for (const k of BROWSER_PERSIST_KEYS) {
        browserData[k] = (browser as any)[k];
      }
      saveJsonFile(`${home}/.praxis/browser-state.json`, browserData);

      // Save widget state
      const projectDir = getProjectDir();
      if (projectDir) {
        const widgets = useWidgetStore.getState();
        saveJsonFile(`${projectDir}/widgets.json`, {
          workspaceWidgets: widgets.workspaceWidgets,
          workspaceLayouts: widgets.workspaceLayouts,
        });
      }

      // Save settings
      useSettingsStore.getState().saveSettings();
    };

    window.addEventListener("beforeunload", flushAll);
    return () => window.removeEventListener("beforeunload", flushAll);
  }, []);
}
