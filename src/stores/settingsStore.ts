import { create } from "zustand";
import { invoke } from "../lib/ipc";
import type { ThemeDefinition, ThemeColors } from "../lib/themes";
import { applyTheme, applyBorderStyle, getThemeById, type BorderStyle } from "../lib/themes";
import { updateAllTerminalThemes } from "../lib/terminal/terminalCache";
import type { TerminalThemeDefinition } from "../lib/terminal/terminalThemes";
import type { ProjectInfo } from "../types/session";
import { registerUserAgentGetter } from "../lib/agentTypes";
import { registerCustomAgentCmds } from "../lib/agents/detector";
import type { FlagOption } from "../types/flags";

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

export type CursorStyle = "block" | "underline" | "bar";
export type ThemeMode = "manual" | "system";
export type DensityMode = "compact" | "comfortable" | "spacious";
export type StartupBehavior = "last-project" | "project-select";

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
  flagFavorites: Record<string, string[]>;
  customFlags: Record<string, FlagOption[]>;

  // Font & Terminal settings
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalLineHeight: number;
  terminalCursorStyle: CursorStyle;
  terminalCursorBlink: boolean;
  terminalScrollback: number;

  // Accent & Auto-Theme
  accentColor: string | null;
  themeMode: ThemeMode;

  // UI Polish
  densityMode: DensityMode;
  sidebarTabOrder: string[];
  hiddenSidebarTabs: string[];
  startupBehavior: StartupBehavior;
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

  toggleFlagFavorite: (agentType: string, flag: string) => void;
  addCustomFlag: (agentType: string, flag: FlagOption) => void;
  removeCustomFlag: (agentType: string, flagStr: string) => void;

  // Font & Terminal
  setTerminalFontSize: (size: number) => void;
  setTerminalFontFamily: (family: string) => void;
  setTerminalLineHeight: (height: number) => void;
  setTerminalCursorStyle: (style: CursorStyle) => void;
  setTerminalCursorBlink: (blink: boolean) => void;
  setTerminalScrollback: (lines: number) => void;

  // Accent & Auto-Theme
  setAccentColor: (color: string | null) => void;
  setThemeMode: (mode: ThemeMode) => void;

  // UI Polish
  setDensityMode: (mode: DensityMode) => void;
  setSidebarTabOrder: (order: string[]) => void;
  setHiddenSidebarTabs: (tabs: string[]) => void;
  setStartupBehavior: (behavior: StartupBehavior) => void;
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
  flagFavorites: {},
  customFlags: {},

  // Font & Terminal
  terminalFontSize: 13,
  terminalFontFamily: "'JetBrains Mono', 'SF Mono', Monaco, Menlo, monospace",
  terminalLineHeight: 1.4,
  terminalCursorStyle: "block" as CursorStyle,
  terminalCursorBlink: false,
  terminalScrollback: 5000,

  // Accent & Auto-Theme
  accentColor: null,
  themeMode: "manual" as ThemeMode,

  // UI Polish
  densityMode: "comfortable" as DensityMode,
  sidebarTabOrder: ["agents", "explorer", "search", "git", "services"],
  hiddenSidebarTabs: [],
  startupBehavior: "project-select" as StartupBehavior,
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
      // Apply theme (with accent color if set)
      const resolvedThemeId = settings.themeMode === "system"
        ? await invoke<string>("get_system_theme").then(
            (sys) => (sys === "dark" ? "dark" : "light")
          ).catch(() => settings.activeThemeId)
        : settings.activeThemeId;
      const theme = getThemeById(resolvedThemeId, settings.customThemes);
      applyTheme(theme, settings.accentColor || null);
      if (resolvedThemeId !== settings.activeThemeId) {
        set({ activeThemeId: resolvedThemeId });
      }
      // Apply border style
      applyBorderStyle(settings.borderStyle || "rounded");
      // Apply terminal theme
      updateAllTerminalThemes(settings.terminalThemeId || "default-dark", settings.customTerminalThemes || []);
      // Apply terminal font/cursor settings
      import("../lib/terminal/terminalCache").then(({ updateAllTerminalOptions }) => {
        updateAllTerminalOptions({
          fontSize: settings.terminalFontSize,
          fontFamily: settings.terminalFontFamily,
          lineHeight: settings.terminalLineHeight,
          cursorStyle: settings.terminalCursorStyle,
          cursorBlink: settings.terminalCursorBlink,
          scrollback: settings.terminalScrollback,
        });
      }).catch(() => {});
      // Apply density mode
      import("../lib/themes").then(({ applyDensityMode }) => {
        applyDensityMode(settings.densityMode || "comfortable");
      }).catch(() => {});
      // Apply custom shortcuts to menu
      if (settings.customShortcuts && Object.keys(settings.customShortcuts).length > 0) {
        invoke("rebuild_menu", { customShortcuts: settings.customShortcuts }).catch(() => {});
      }
      // Listen for system theme changes
      if (settings.themeMode === "system" && typeof window.electronAPI?.on === "function") {
        window.electronAPI.on("system-theme-changed", (mode: string) => {
          const s = get();
          if (s.themeMode === "system") {
            const newThemeId = mode === "dark" ? "dark" : "light";
            const newTheme = getThemeById(newThemeId, s.customThemes);
            applyTheme(newTheme, s.accentColor);
            set({ activeThemeId: newThemeId });
          }
        });
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
      flagFavorites: s.flagFavorites,
      customFlags: s.customFlags,
      terminalFontSize: s.terminalFontSize,
      terminalFontFamily: s.terminalFontFamily,
      terminalLineHeight: s.terminalLineHeight,
      terminalCursorStyle: s.terminalCursorStyle,
      terminalCursorBlink: s.terminalCursorBlink,
      terminalScrollback: s.terminalScrollback,
      accentColor: s.accentColor,
      themeMode: s.themeMode,
      densityMode: s.densityMode,
      sidebarTabOrder: s.sidebarTabOrder,
      hiddenSidebarTabs: s.hiddenSidebarTabs,
      startupBehavior: s.startupBehavior,
    });
  },

  setActiveTheme: (id: string) => {
    const s = get();
    const theme = getThemeById(id, s.customThemes);
    applyTheme(theme, s.accentColor);
    set({ activeThemeId: id });
    // Update Windows titlebar to match theme
    invoke("update_titlebar_overlay", {
      color: theme.colors.bgSecondary,
      symbolColor: theme.colors.textPrimary,
    }).catch(() => {});
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

  toggleFlagFavorite: (agentType, flag) => {
    set((s) => {
      const current = s.flagFavorites[agentType] || [];
      const isFav = current.includes(flag);
      return {
        flagFavorites: {
          ...s.flagFavorites,
          [agentType]: isFav ? current.filter((f) => f !== flag) : [...current, flag],
        },
      };
    });
    debouncedSave(get);
  },

  addCustomFlag: (agentType, flag) => {
    set((s) => {
      const current = s.customFlags[agentType] || [];
      if (current.some((f) => f.flag === flag.flag)) return s;
      return {
        customFlags: {
          ...s.customFlags,
          [agentType]: [...current, { ...flag, isCustom: true }],
        },
      };
    });
    debouncedSave(get);
  },

  removeCustomFlag: (agentType, flagStr) => {
    set((s) => ({
      customFlags: {
        ...s.customFlags,
        [agentType]: (s.customFlags[agentType] || []).filter((f) => f.flag !== flagStr),
      },
    }));
    debouncedSave(get);
  },

  // --- Font & Terminal setters ---
  setTerminalFontSize: (size: number) => {
    set({ terminalFontSize: Math.max(10, Math.min(24, size)) });
    import("../lib/terminal/terminalCache").then(({ updateAllTerminalOptions }) => {
      updateAllTerminalOptions({ fontSize: Math.max(10, Math.min(24, size)) });
    }).catch(() => {});
    debouncedSave(get);
  },

  setTerminalFontFamily: (family: string) => {
    set({ terminalFontFamily: family });
    import("../lib/terminal/terminalCache").then(({ updateAllTerminalOptions }) => {
      updateAllTerminalOptions({ fontFamily: family });
    }).catch(() => {});
    debouncedSave(get);
  },

  setTerminalLineHeight: (height: number) => {
    set({ terminalLineHeight: height });
    import("../lib/terminal/terminalCache").then(({ updateAllTerminalOptions }) => {
      updateAllTerminalOptions({ lineHeight: height });
    }).catch(() => {});
    debouncedSave(get);
  },

  setTerminalCursorStyle: (style: CursorStyle) => {
    set({ terminalCursorStyle: style });
    import("../lib/terminal/terminalCache").then(({ updateAllTerminalOptions }) => {
      updateAllTerminalOptions({ cursorStyle: style });
    }).catch(() => {});
    debouncedSave(get);
  },

  setTerminalCursorBlink: (blink: boolean) => {
    set({ terminalCursorBlink: blink });
    import("../lib/terminal/terminalCache").then(({ updateAllTerminalOptions }) => {
      updateAllTerminalOptions({ cursorBlink: blink });
    }).catch(() => {});
    debouncedSave(get);
  },

  setTerminalScrollback: (lines: number) => {
    set({ terminalScrollback: Math.max(500, Math.min(50000, lines)) });
    import("../lib/terminal/terminalCache").then(({ updateAllTerminalOptions }) => {
      updateAllTerminalOptions({ scrollback: Math.max(500, Math.min(50000, lines)) });
    }).catch(() => {});
    debouncedSave(get);
  },

  // --- Accent & Auto-Theme setters ---
  setAccentColor: (color: string | null) => {
    set({ accentColor: color });
    const s = get();
    const theme = getThemeById(s.activeThemeId, s.customThemes);
    applyTheme(theme, color);
    debouncedSave(get);
  },

  setThemeMode: (mode: ThemeMode) => {
    set({ themeMode: mode });
    if (mode === "system") {
      invoke<string>("get_system_theme").then((sysTheme) => {
        const themeId = sysTheme === "dark" ? "dark" : "light";
        const s = get();
        const theme = getThemeById(themeId, s.customThemes);
        applyTheme(theme, s.accentColor);
        set({ activeThemeId: themeId });
      }).catch(() => {});
    }
    debouncedSave(get);
  },

  // --- UI Polish setters ---
  setDensityMode: (mode: DensityMode) => {
    set({ densityMode: mode });
    import("../lib/themes").then(({ applyDensityMode }) => {
      applyDensityMode(mode);
    }).catch(() => {});
    debouncedSave(get);
  },

  setSidebarTabOrder: (order: string[]) => {
    set({ sidebarTabOrder: order });
    debouncedSave(get);
  },

  setHiddenSidebarTabs: (tabs: string[]) => {
    set({ hiddenSidebarTabs: tabs });
    debouncedSave(get);
  },

  setStartupBehavior: (behavior: StartupBehavior) => {
    set({ startupBehavior: behavior });
    debouncedSave(get);
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
