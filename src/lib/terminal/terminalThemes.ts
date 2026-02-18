import type { ITheme } from "@xterm/xterm";

export interface TerminalThemeDefinition {
  id: string;
  name: string;
  theme: ITheme;
}

const defaultDark: TerminalThemeDefinition = {
  id: "default-dark",
  name: "Default Dark",
  theme: {
    background: "#000000",
    foreground: "#e0e0e0",
    cursor: "#ffffff",
    cursorAccent: "#000000",
    selectionBackground: "#333333",
    black: "#333333",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#facc15",
    blue: "#a0a0a0",
    magenta: "#a78bfa",
    cyan: "#67e8f9",
    white: "#d4d4d4",
    brightBlack: "#525252",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde68a",
    brightBlue: "#d4d4d4",
    brightMagenta: "#c4b5fd",
    brightCyan: "#a5f3fc",
    brightWhite: "#ffffff",
  },
};

const dracula: TerminalThemeDefinition = {
  id: "dracula",
  name: "Dracula",
  theme: {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    cursorAccent: "#282a36",
    selectionBackground: "#44475a",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },
};

const monokai: TerminalThemeDefinition = {
  id: "monokai",
  name: "Monokai",
  theme: {
    background: "#272822",
    foreground: "#f8f8f2",
    cursor: "#f8f8f0",
    cursorAccent: "#272822",
    selectionBackground: "#49483e",
    black: "#272822",
    red: "#f92672",
    green: "#a6e22e",
    yellow: "#f4bf75",
    blue: "#66d9ef",
    magenta: "#ae81ff",
    cyan: "#a1efe4",
    white: "#f8f8f2",
    brightBlack: "#75715e",
    brightRed: "#f92672",
    brightGreen: "#a6e22e",
    brightYellow: "#f4bf75",
    brightBlue: "#66d9ef",
    brightMagenta: "#ae81ff",
    brightCyan: "#a1efe4",
    brightWhite: "#f9f8f5",
  },
};

const solarizedDark: TerminalThemeDefinition = {
  id: "solarized-dark",
  name: "Solarized Dark",
  theme: {
    background: "#002b36",
    foreground: "#839496",
    cursor: "#93a1a1",
    cursorAccent: "#002b36",
    selectionBackground: "#073642",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
};

const solarizedLight: TerminalThemeDefinition = {
  id: "solarized-light",
  name: "Solarized Light",
  theme: {
    background: "#fdf6e3",
    foreground: "#657b83",
    cursor: "#586e75",
    cursorAccent: "#fdf6e3",
    selectionBackground: "#eee8d5",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#002b36",
    brightRed: "#cb4b16",
    brightGreen: "#586e75",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3",
  },
};

const nord: TerminalThemeDefinition = {
  id: "nord",
  name: "Nord",
  theme: {
    background: "#2e3440",
    foreground: "#d8dee9",
    cursor: "#d8dee9",
    cursorAccent: "#2e3440",
    selectionBackground: "#434c5e",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4",
  },
};

const oneDark: TerminalThemeDefinition = {
  id: "one-dark",
  name: "One Dark",
  theme: {
    background: "#282c34",
    foreground: "#abb2bf",
    cursor: "#528bff",
    cursorAccent: "#282c34",
    selectionBackground: "#3e4451",
    black: "#282c34",
    red: "#e06c75",
    green: "#98c379",
    yellow: "#e5c07b",
    blue: "#61afef",
    magenta: "#c678dd",
    cyan: "#56b6c2",
    white: "#abb2bf",
    brightBlack: "#5c6370",
    brightRed: "#e06c75",
    brightGreen: "#98c379",
    brightYellow: "#e5c07b",
    brightBlue: "#61afef",
    brightMagenta: "#c678dd",
    brightCyan: "#56b6c2",
    brightWhite: "#ffffff",
  },
};

const gruvboxDark: TerminalThemeDefinition = {
  id: "gruvbox-dark",
  name: "Gruvbox Dark",
  theme: {
    background: "#282828",
    foreground: "#ebdbb2",
    cursor: "#ebdbb2",
    cursorAccent: "#282828",
    selectionBackground: "#504945",
    black: "#282828",
    red: "#cc241d",
    green: "#98971a",
    yellow: "#d79921",
    blue: "#458588",
    magenta: "#b16286",
    cyan: "#689d6a",
    white: "#a89984",
    brightBlack: "#928374",
    brightRed: "#fb4934",
    brightGreen: "#b8bb26",
    brightYellow: "#fabd2f",
    brightBlue: "#83a598",
    brightMagenta: "#d3869b",
    brightCyan: "#8ec07c",
    brightWhite: "#ebdbb2",
  },
};

export const BUILTIN_TERMINAL_THEMES: TerminalThemeDefinition[] = [
  defaultDark,
  dracula,
  monokai,
  solarizedDark,
  solarizedLight,
  nord,
  oneDark,
  gruvboxDark,
];

/** Editable color keys exposed in the terminal theme editor */
export const TERMINAL_COLOR_KEYS = [
  "background", "foreground", "cursor", "selectionBackground",
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
] as const;

export type TerminalColorKey = (typeof TERMINAL_COLOR_KEYS)[number];

export const TERMINAL_COLOR_LABELS: Record<string, string> = {
  background: "Background", foreground: "Foreground", cursor: "Cursor", selectionBackground: "Selection",
  black: "Black", red: "Red", green: "Green", yellow: "Yellow",
  blue: "Blue", magenta: "Magenta", cyan: "Cyan", white: "White",
  brightBlack: "Bright Black", brightRed: "Bright Red", brightGreen: "Bright Green", brightYellow: "Bright Yellow",
  brightBlue: "Bright Blue", brightMagenta: "Bright Magenta", brightCyan: "Bright Cyan", brightWhite: "Bright White",
};

export const TERMINAL_COLOR_GROUPS: { label: string; keys: TerminalColorKey[] }[] = [
  { label: "General", keys: ["background", "foreground", "cursor", "selectionBackground"] },
  { label: "Normal Colors", keys: ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] },
  { label: "Bright Colors", keys: ["brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"] },
];

export function createDefaultTerminalColors(): Record<TerminalColorKey, string> {
  const t = defaultDark.theme;
  const result: Record<string, string> = {};
  for (const key of TERMINAL_COLOR_KEYS) {
    result[key] = (t[key] as string) || "#000000";
  }
  return result as Record<TerminalColorKey, string>;
}

export function getTerminalThemeById(id: string, customTerminalThemes: TerminalThemeDefinition[] = []): TerminalThemeDefinition {
  const all = [...BUILTIN_TERMINAL_THEMES, ...customTerminalThemes];
  return all.find((t) => t.id === id) || defaultDark;
}
