import type { ThemeColors, ThemeDefinition } from "./themes";
import type { TerminalThemeDefinition } from "./terminal/terminalThemes";
import { TERMINAL_COLOR_KEYS } from "./terminal/terminalThemes";

// ─── Types ───

export interface ThemeExportFile {
  type: "app-theme" | "terminal-theme";
  version: number;
  exportedAt: string;
  name: string;
  colors: Record<string, string>;
}

// ─── Validation ───

const APP_THEME_REQUIRED_KEYS: (keyof ThemeColors)[] = [
  "bgPrimary", "bgSecondary", "bgTertiary", "bgSurface", "bgSurfaceHover",
  "bgOverlay", "bgInset", "textPrimary", "textSecondary", "textMuted",
  "textDim", "textFaint", "textSubtle", "borderSubtle", "borderLight",
  "borderMedium", "borderStrong", "borderPanel", "accentBlue", "accentBlueBg",
  "accentBlueBgHover", "accentBlueBorder", "accentBlueGlow", "accentGreen",
  "accentGreenBright", "accentGreenGlow", "accentRed", "accentRedText",
  "accentRedBg", "accentRedBorder", "accentOrange", "accentAmber",
  "scrollbarThumb", "scrollbarHover", "inputBg", "inputBorder",
  "inputBorderFocus", "lineNumber", "codeText", "buttonPrimaryBg",
  "buttonPrimaryText",
];

export function validateThemeExportFile(raw: string): {
  data: ThemeExportFile | null;
  error: string | null;
} {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { data: null, error: "Invalid JSON: " + (e as Error).message };
  }

  if (!parsed || typeof parsed !== "object") {
    return { data: null, error: "Expected a JSON object" };
  }
  if (parsed.type !== "app-theme" && parsed.type !== "terminal-theme") {
    return { data: null, error: 'Invalid file. Expected "type" to be "app-theme" or "terminal-theme".' };
  }
  if (typeof parsed.version !== "number") {
    return { data: null, error: 'Missing "version" field.' };
  }
  if (!parsed.name || typeof parsed.name !== "string") {
    return { data: null, error: 'Missing or invalid "name" field.' };
  }
  if (!parsed.colors || typeof parsed.colors !== "object") {
    return { data: null, error: 'Missing or invalid "colors" field.' };
  }

  const requiredKeys = parsed.type === "app-theme"
    ? APP_THEME_REQUIRED_KEYS
    : TERMINAL_COLOR_KEYS;

  const missingKeys: string[] = [];
  for (const key of requiredKeys) {
    if (typeof parsed.colors[key] !== "string") {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length > 0) {
    const maxShow = 5;
    const shown = missingKeys.slice(0, maxShow).join(", ");
    const more = missingKeys.length > maxShow ? ` ...and ${missingKeys.length - maxShow} more` : "";
    return { data: null, error: `Missing color keys: ${shown}${more}` };
  }

  return { data: parsed as ThemeExportFile, error: null };
}

// ─── Export ───

export function exportAppTheme(theme: ThemeDefinition): ThemeExportFile {
  return {
    type: "app-theme",
    version: 1,
    exportedAt: new Date().toISOString(),
    name: theme.name,
    colors: { ...theme.colors },
  };
}

export function exportTerminalTheme(theme: TerminalThemeDefinition): ThemeExportFile {
  const colors: Record<string, string> = {};
  for (const key of TERMINAL_COLOR_KEYS) {
    colors[key] = (theme.theme[key] as string) || "#000000";
  }
  return {
    type: "terminal-theme",
    version: 1,
    exportedAt: new Date().toISOString(),
    name: theme.name,
    colors,
  };
}

// ─── Import ───

export function importAsAppTheme(data: ThemeExportFile): ThemeDefinition {
  return {
    id: `imported-${Date.now()}`,
    name: data.name,
    builtin: false,
    colors: data.colors as unknown as ThemeColors,
  };
}

export function importAsTerminalTheme(data: ThemeExportFile): TerminalThemeDefinition {
  return {
    id: `imported-term-${Date.now()}`,
    name: data.name,
    theme: data.colors as any,
  };
}

// ─── File I/O (browser-native) ───

export function downloadThemeFile(data: ThemeExportFile): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  a.download = `${safeName}-${data.type}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function openThemeFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}
