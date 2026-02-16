import { isMac } from "./platform";

export interface ShortcutDef {
  id: string;
  label: string;
  category: ShortcutCategory;
  defaultKey: string; // Electron accelerator format: "CmdOrCtrl+K"
}

export type ShortcutCategory =
  | "General"
  | "Views"
  | "Sidebar"
  | "Terminal"
  | "Browser"
  | "Workspace"
  | "Git";

export const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  "General",
  "Views",
  "Sidebar",
  "Terminal",
  "Browser",
  "Workspace",
  "Git",
];

export const ALL_SHORTCUTS: ShortcutDef[] = [
  // General
  { id: "command-palette", label: "Command Palette", category: "General", defaultKey: "CmdOrCtrl+K" },
  { id: "settings", label: "Settings", category: "General", defaultKey: "CmdOrCtrl+," },
  { id: "toggle-sidebar", label: "Toggle Sidebar", category: "General", defaultKey: "CmdOrCtrl+B" },
  { id: "fullscreen-terminal", label: "Fullscreen Terminal", category: "General", defaultKey: "CmdOrCtrl+Shift+F" },
  { id: "mission-panel", label: "Mission Panel", category: "General", defaultKey: "CmdOrCtrl+Shift+M" },
  { id: "find", label: "Find", category: "General", defaultKey: "CmdOrCtrl+F" },

  // Views
  { id: "view-terminal", label: "Terminal View", category: "Views", defaultKey: "CmdOrCtrl+1" },
  { id: "view-widgets", label: "Widget View", category: "Views", defaultKey: "CmdOrCtrl+2" },
  { id: "view-split", label: "Split View", category: "Views", defaultKey: "CmdOrCtrl+3" },
  { id: "view-browser", label: "Browser View", category: "Views", defaultKey: "CmdOrCtrl+4" },

  // Sidebar
  { id: "sidebar-agents", label: "Agents Panel", category: "Sidebar", defaultKey: "CmdOrCtrl+Shift+A" },
  { id: "sidebar-explorer", label: "Explorer Panel", category: "Sidebar", defaultKey: "CmdOrCtrl+Shift+E" },
  { id: "sidebar-search", label: "Search Panel", category: "Sidebar", defaultKey: "CmdOrCtrl+Shift+H" },
  { id: "sidebar-git", label: "Git Panel", category: "Sidebar", defaultKey: "CmdOrCtrl+Shift+G" },
  { id: "sidebar-services", label: "Services Panel", category: "Sidebar", defaultKey: "CmdOrCtrl+Shift+U" },

  // Terminal
  { id: "new-terminal", label: "New Terminal", category: "Terminal", defaultKey: "CmdOrCtrl+T" },
  { id: "close-terminal", label: "Close Terminal", category: "Terminal", defaultKey: "CmdOrCtrl+W" },
  { id: "split-right", label: "Split Right", category: "Terminal", defaultKey: "CmdOrCtrl+D" },
  { id: "split-down", label: "Split Down", category: "Terminal", defaultKey: "CmdOrCtrl+Shift+D" },
  { id: "next-terminal-group", label: "Next Group", category: "Terminal", defaultKey: "CmdOrCtrl+Shift+]" },
  { id: "prev-terminal-group", label: "Previous Group", category: "Terminal", defaultKey: "CmdOrCtrl+Shift+[" },

  // Browser
  { id: "browser-url", label: "Focus URL Bar", category: "Browser", defaultKey: "CmdOrCtrl+L" },
  { id: "browser-reload", label: "Reload Page", category: "Browser", defaultKey: "CmdOrCtrl+R" },
  { id: "browser-hard-reload", label: "Hard Reload", category: "Browser", defaultKey: "CmdOrCtrl+Shift+R" },
  { id: "browser-back", label: "Go Back", category: "Browser", defaultKey: "CmdOrCtrl+[" },
  { id: "browser-forward", label: "Go Forward", category: "Browser", defaultKey: "CmdOrCtrl+]" },
  { id: "browser-devtools", label: "Browser DevTools", category: "Browser", defaultKey: "CmdOrCtrl+Shift+I" },

  // Workspace
  { id: "new-workspace", label: "New Workspace", category: "Workspace", defaultKey: "CmdOrCtrl+N" },
  { id: "switch-project", label: "Switch Project", category: "Workspace", defaultKey: "CmdOrCtrl+O" },
  { id: "open-new-window", label: "Open in New Window", category: "Workspace", defaultKey: "CmdOrCtrl+Shift+O" },
  { id: "clone-repository", label: "Clone Repository", category: "Workspace", defaultKey: "CmdOrCtrl+Shift+C" },

  // Git
  { id: "git-pull", label: "Git Pull", category: "Git", defaultKey: "" },
  { id: "git-push", label: "Git Push", category: "Git", defaultKey: "" },
  { id: "git-commit", label: "Git Commit", category: "Git", defaultKey: "" },
  { id: "git-stash", label: "Git Stash", category: "Git", defaultKey: "" },
  { id: "git-stash-pop", label: "Git Stash Pop", category: "Git", defaultKey: "" },
  { id: "git-refresh", label: "Refresh Git Status", category: "Git", defaultKey: "" },
];

/** Get the effective shortcut key for a given shortcut ID */
export function getShortcutKey(id: string, customShortcuts: Record<string, string>): string {
  if (customShortcuts[id] !== undefined) return customShortcuts[id];
  const def = ALL_SHORTCUTS.find((s) => s.id === id);
  return def?.defaultKey || "";
}

/** Format an Electron accelerator string for display: "CmdOrCtrl+Shift+K" → "Cmd+⇧+K" or "Ctrl+⇧+K" */
export function formatShortcut(accelerator: string): string {
  if (!accelerator) return "";
  const mod = isMac() ? "Cmd" : "Ctrl";
  return accelerator
    .replace(/CmdOrCtrl/g, mod)
    .replace(/Shift/g, "⇧")
    .replace(/Alt/g, isMac() ? "⌥" : "Alt")
    .replace(/Meta/g, isMac() ? "Cmd" : "Win");
}

/** Convert a KeyboardEvent to Electron accelerator format */
export function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const key = e.key;
  // Ignore standalone modifier keys
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return null;

  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CmdOrCtrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  // Normalize key names
  const keyMap: Record<string, string> = {
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    " ": "Space", Escape: "Escape", Enter: "Enter", Backspace: "Backspace",
    Delete: "Delete", Tab: "Tab",
    "[": "[", "]": "]", ",": ",", ".": ".", "/": "/", "\\": "\\",
    ";": ";", "'": "'", "`": "`", "-": "-", "=": "=",
  };

  const normalizedKey = keyMap[key] || (key.length === 1 ? key.toUpperCase() : key);
  parts.push(normalizedKey);

  return parts.join("+");
}

/** Check if a shortcut conflicts with another one */
export function findConflict(
  newKey: string,
  excludeId: string,
  customShortcuts: Record<string, string>
): ShortcutDef | null {
  if (!newKey) return null;
  for (const def of ALL_SHORTCUTS) {
    if (def.id === excludeId) continue;
    const currentKey = getShortcutKey(def.id, customShortcuts);
    if (currentKey === newKey) return def;
  }
  return null;
}

/** Build a map of shortcut ID → accelerator for the menu system */
export function buildAcceleratorMap(customShortcuts: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const def of ALL_SHORTCUTS) {
    map[def.id] = getShortcutKey(def.id, customShortcuts);
  }
  return map;
}
