import { create } from "zustand";
import { invoke } from "../lib/ipc";
import type { ThemeDefinition, ThemeColors } from "../lib/themes";
import { applyTheme, applyBorderStyle, getThemeById, type BorderStyle } from "../lib/themes";
import { updateAllTerminalThemes } from "../lib/terminal/terminalCache";
import type { TerminalThemeDefinition } from "../lib/terminal/terminalThemes";
import type { ProjectInfo } from "../types/session";
import { registerUserAgentGetter } from "../lib/agentTypes";
import { registerCustomAgentCmds } from "../lib/agents/detector";

export interface UserAgent {
  id: string;
  label: string;
  cmd: string;
  args: string[];
  type: string;
  color: string;
  logoEmoji?: string;
  flags: Array<{
    flag: string;
    label: string;
    description: string;
    hasValue?: boolean;
    placeholder?: string;
  }>;
}

export interface PersistedWorkspace {
  id: string;
  name: string;
  color: string;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  createdAt: number;
  mode: "widget" | "terminal";
  // Widget mode snapshot
  widgets: { type: string; x: number; y: number; w: number; h: number; config?: Record<string, any> }[];
  // Terminal mode snapshot (split structure)
  terminalLayout?: any; // LayoutNode
  terminalGroupCount?: number;
}

interface PersistedSettings {
  activeThemeId: string;
  terminalThemeId: string;
  customThemes: ThemeDefinition[];
  customTerminalThemes: TerminalThemeDefinition[];
  userAgents: UserAgent[];
  savedWorkspaces: PersistedWorkspace[];
  recentProjects: ProjectInfo[];
  recentSpawns: Array<{ agentType: string; flags: Record<string, string | boolean>; timestamp: number }>;
  onboardingDone: boolean;
  cliEnabled: boolean;
  workspaceTemplates: WorkspaceTemplate[];
  customShortcuts: Record<string, string>;
  borderStyle: BorderStyle;
}

interface SettingsState extends PersistedSettings {
  loaded: boolean;
  homeDir: string;
  showSettingsPanel: boolean;

  loadSettings: () => Promise<void>;
  saveSettings: () => void;

  setActiveTheme: (id: string) => void;
  addCustomTheme: (theme: ThemeDefinition) => void;
  removeCustomTheme: (id: string) => void;
  updateCustomTheme: (id: string, colors: Partial<ThemeColors>) => void;

  addUserAgent: (agent: UserAgent) => void;
  removeUserAgent: (id: string) => void;
  updateUserAgent: (id: string, updates: Partial<UserAgent>) => void;

  saveWorkspaces: (workspaces: PersistedWorkspace[]) => void;

  addRecentProject: (project: ProjectInfo) => void;
  removeRecentProject: (path: string) => void;

  addRecentSpawn: (agentType: string, flags: Record<string, string | boolean>) => void;

  setOnboardingDone: (done: boolean) => void;
  setCliEnabled: (enabled: boolean) => void;
  setShowSettingsPanel: (show: boolean) => void;

  addTemplate: (template: WorkspaceTemplate) => void;
  deleteTemplate: (id: string) => void;
  renameTemplate: (id: string, name: string) => void;

  setTerminalTheme: (id: string) => void;
  addCustomTerminalTheme: (theme: TerminalThemeDefinition) => void;
  removeCustomTerminalTheme: (id: string) => void;
  updateCustomTerminalTheme: (id: string, colors: Record<string, string>) => void;

  setBorderStyle: (style: BorderStyle) => void;

  setCustomShortcut: (id: string, key: string) => void;
  resetShortcut: (id: string) => void;
  resetAllShortcuts: () => void;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  activeThemeId: "dark",
  terminalThemeId: "default-dark",
  customThemes: [],
  customTerminalThemes: [],
  userAgents: [],
  savedWorkspaces: [],
  recentProjects: [],
  recentSpawns: [],
  onboardingDone: false,
  cliEnabled: false,
  workspaceTemplates: [],
  customShortcuts: {},
  borderStyle: "rounded" as BorderStyle,
};

function getSettingsPath(homeDir: string): string {
  return `${homeDir}/.praxis/settings.json`;
}

function readSettingsFile(homeDir: string): PersistedSettings {
  try {
    const path = getSettingsPath(homeDir);
    if (typeof window.electronAPI.fileExists === "function" && window.electronAPI.fileExists(path)) {
      const raw = window.electronAPI.readFileSync(path);
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function writeSettingsFile(homeDir: string, settings: PersistedSettings): void {
  try {
    const path = getSettingsPath(homeDir);
    window.electronAPI.writeFileSync(path, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("Failed to save settings:", err);
  }
}

// Debounced save — coalesces rapid state changes into a single disk write
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSave(get: () => SettingsState) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    get().saveSettings();
  }, 300);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  loaded: false,
  homeDir: "",
  showSettingsPanel: false,

  loadSettings: async () => {
    try {
      const homeDir = await invoke<string>("get_home_dir");
      const settings = readSettingsFile(homeDir);
      set({ ...settings, homeDir, loaded: true });
      const theme = getThemeById(settings.activeThemeId, settings.customThemes);
      applyTheme(theme);
      // Apply border style
      applyBorderStyle(settings.borderStyle || "rounded");
      // Apply terminal theme
      updateAllTerminalThemes(settings.terminalThemeId || "default-dark", settings.customTerminalThemes || []);
      // Apply custom shortcuts to menu
      if (settings.customShortcuts && Object.keys(settings.customShortcuts).length > 0) {
        invoke("rebuild_menu", { customShortcuts: settings.customShortcuts }).catch(() => {});
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      set({ loaded: true });
    }
  },

  saveSettings: async () => {
    const s = get();
    let homeDir = s.homeDir;
    if (!homeDir) {
      try {
        homeDir = await invoke<string>("get_home_dir");
        set({ homeDir });
      } catch { return; }
    }
    writeSettingsFile(homeDir, {
      activeThemeId: s.activeThemeId,
      terminalThemeId: s.terminalThemeId,
      customThemes: s.customThemes,
      customTerminalThemes: s.customTerminalThemes,
      userAgents: s.userAgents,
      savedWorkspaces: s.savedWorkspaces,
      recentProjects: s.recentProjects,
      recentSpawns: s.recentSpawns,
      onboardingDone: s.onboardingDone,
      cliEnabled: s.cliEnabled,
      workspaceTemplates: s.workspaceTemplates,
      customShortcuts: s.customShortcuts,
      borderStyle: s.borderStyle,
    });
  },

  setActiveTheme: (id: string) => {
    const s = get();
    const theme = getThemeById(id, s.customThemes);
    applyTheme(theme);
    set({ activeThemeId: id });
    debouncedSave(get);
  },

  addCustomTheme: (theme: ThemeDefinition) => {
    set((s) => ({ customThemes: [...s.customThemes, theme] }));
    debouncedSave(get);
  },

  removeCustomTheme: (id: string) => {
    const s = get();
    set({ customThemes: s.customThemes.filter((t) => t.id !== id) });
    if (s.activeThemeId === id) {
      get().setActiveTheme("dark");
    }
    debouncedSave(get);
  },

  updateCustomTheme: (id: string, colors: Partial<ThemeColors>) => {
    set((s) => ({
      customThemes: s.customThemes.map((t) =>
        t.id === id ? { ...t, colors: { ...t.colors, ...colors } } : t
      ),
    }));
    const s = get();
    if (s.activeThemeId === id) {
      const theme = getThemeById(id, s.customThemes);
      applyTheme(theme);
    }
    debouncedSave(get);
  },

  addUserAgent: (agent: UserAgent) => {
    set((s) => ({ userAgents: [...s.userAgents, agent] }));
    debouncedSave(get);
  },

  removeUserAgent: (id: string) => {
    set((s) => ({ userAgents: s.userAgents.filter((a) => a.id !== id) }));
    debouncedSave(get);
  },

  updateUserAgent: (id: string, updates: Partial<UserAgent>) => {
    set((s) => ({
      userAgents: s.userAgents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }));
    debouncedSave(get);
  },

  saveWorkspaces: (workspaces: PersistedWorkspace[]) => {
    set({ savedWorkspaces: workspaces });
    debouncedSave(get);
  },

  addRecentProject: (project: ProjectInfo) => {
    set((s) => ({
      recentProjects: [project, ...s.recentProjects.filter((p) => p.path !== project.path)].slice(0, 10),
    }));
    debouncedSave(get);
  },

  removeRecentProject: (path: string) => {
    set((s) => ({
      recentProjects: s.recentProjects.filter((p) => p.path !== path),
    }));
    debouncedSave(get);
  },

  addRecentSpawn: (agentType: string, flags: Record<string, string | boolean>) => {
    set((s) => ({
      recentSpawns: [
        { agentType, flags, timestamp: Date.now() },
        ...s.recentSpawns.filter((r) => r.agentType !== agentType || JSON.stringify(r.flags) !== JSON.stringify(flags)),
      ].slice(0, 5),
    }));
    debouncedSave(get);
  },

  setOnboardingDone: (done: boolean) => {
    set({ onboardingDone: done });
    debouncedSave(get);
  },
  setCliEnabled: (enabled: boolean) => {
    set({ cliEnabled: enabled });
    debouncedSave(get);
  },
  setShowSettingsPanel: (show: boolean) => set({ showSettingsPanel: show }),

  addTemplate: (template) => {
    set((s) => ({ workspaceTemplates: [...s.workspaceTemplates, template] }));
    debouncedSave(get);
  },

  deleteTemplate: (id) => {
    set((s) => ({ workspaceTemplates: s.workspaceTemplates.filter((t) => t.id !== id) }));
    debouncedSave(get);
  },

  renameTemplate: (id, name) => {
    set((s) => ({
      workspaceTemplates: s.workspaceTemplates.map((t) => (t.id === id ? { ...t, name } : t)),
    }));
    debouncedSave(get);
  },

  setTerminalTheme: (id: string) => {
    const s = get();
    updateAllTerminalThemes(id, s.customTerminalThemes);
    set({ terminalThemeId: id });
    debouncedSave(get);
  },

  addCustomTerminalTheme: (theme: TerminalThemeDefinition) => {
    set((s) => ({ customTerminalThemes: [...s.customTerminalThemes, theme] }));
    debouncedSave(get);
  },

  removeCustomTerminalTheme: (id: string) => {
    const s = get();
    set({ customTerminalThemes: s.customTerminalThemes.filter((t) => t.id !== id) });
    if (s.terminalThemeId === id) {
      get().setTerminalTheme("default-dark");
    }
    debouncedSave(get);
  },

  updateCustomTerminalTheme: (id: string, colors: Record<string, string>) => {
    set((s) => ({
      customTerminalThemes: s.customTerminalThemes.map((t) =>
        t.id === id ? { ...t, theme: { ...t.theme, ...colors } } : t
      ),
    }));
    const s = get();
    if (s.terminalThemeId === id) {
      updateAllTerminalThemes(id, s.customTerminalThemes);
    }
    debouncedSave(get);
  },

  setBorderStyle: (style: BorderStyle) => {
    applyBorderStyle(style);
    set({ borderStyle: style });
    debouncedSave(get);
  },

  setCustomShortcut: (id, key) => {
    set((s) => ({ customShortcuts: { ...s.customShortcuts, [id]: key } }));
    debouncedSave(get);
    // Notify main process to rebuild menu with new shortcuts
    invoke("rebuild_menu", { customShortcuts: get().customShortcuts }).catch(() => {});
  },

  resetShortcut: (id) => {
    set((s) => {
      const next = { ...s.customShortcuts };
      delete next[id];
      return { customShortcuts: next };
    });
    debouncedSave(get);
    invoke("rebuild_menu", { customShortcuts: get().customShortcuts }).catch(() => {});
  },

  resetAllShortcuts: () => {
    set({ customShortcuts: {} });
    debouncedSave(get);
    invoke("rebuild_menu", { customShortcuts: {} }).catch(() => {});
  },
}));

// Register user agent getter so agentTypes.ts can look up custom agents without circular imports
registerUserAgentGetter(() => useSettingsStore.getState().userAgents);

// Keep detector's custom agent commands in sync
useSettingsStore.subscribe((state) => {
  registerCustomAgentCmds(state.userAgents.map((a) => ({ cmd: a.cmd, type: a.type })));
});
// Initial sync
registerCustomAgentCmds(useSettingsStore.getState().userAgents.map((a) => ({ cmd: a.cmd, type: a.type })));
