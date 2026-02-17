export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgSurface: string;
  bgSurfaceHover: string;
  bgOverlay: string;
  bgInset: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;
  textFaint: string;
  textSubtle: string;
  borderSubtle: string;
  borderLight: string;
  borderMedium: string;
  borderStrong: string;
  borderPanel: string;
  accentBlue: string;
  accentBlueBg: string;
  accentBlueBgHover: string;
  accentBlueBorder: string;
  accentBlueGlow: string;
  accentGreen: string;
  accentGreenBright: string;
  accentGreenGlow: string;
  accentRed: string;
  accentRedText: string;
  accentRedBg: string;
  accentRedBorder: string;
  accentOrange: string;
  accentAmber: string;
  scrollbarThumb: string;
  scrollbarHover: string;
  inputBg: string;
  inputBorder: string;
  inputBorderFocus: string;
  lineNumber: string;
  codeText: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  builtin: boolean;
  colors: ThemeColors;
}

export const darkTheme: ThemeDefinition = {
  id: "dark",
  name: "Dark",
  builtin: true,
  colors: {
    bgPrimary: "#000000",
    bgSecondary: "#0a0a0a",
    bgTertiary: "#1a1a1a",
    bgSurface: "rgba(255,255,255,0.04)",
    bgSurfaceHover: "rgba(255,255,255,0.08)",
    bgOverlay: "rgba(0,0,0,0.7)",
    bgInset: "#050505",
    textPrimary: "#e0e0e0",
    textSecondary: "#aaaaaa",
    textMuted: "#888888",
    textDim: "#666666",
    textFaint: "#555555",
    textSubtle: "#444444",
    borderSubtle: "rgba(255,255,255,0.08)",
    borderLight: "rgba(255,255,255,0.12)",
    borderMedium: "rgba(255,255,255,0.18)",
    borderStrong: "rgba(255,255,255,0.25)",
    borderPanel: "rgba(255,255,255,0.45)",
    accentBlue: "#60a5fa",
    accentBlueBg: "rgba(96,165,250,0.08)",
    accentBlueBgHover: "rgba(96,165,250,0.15)",
    accentBlueBorder: "rgba(96,165,250,0.3)",
    accentBlueGlow: "rgba(96,165,250,0.5)",
    accentGreen: "#4ade80",
    accentGreenBright: "#22c55e",
    accentGreenGlow: "rgba(74,222,128,0.5)",
    accentRed: "#ef4444",
    accentRedText: "#f87171",
    accentRedBg: "rgba(239,68,68,0.08)",
    accentRedBorder: "rgba(239,68,68,0.15)",
    accentOrange: "#f97316",
    accentAmber: "#f59e0b",
    scrollbarThumb: "#252525",
    scrollbarHover: "#333333",
    inputBg: "#000000",
    inputBorder: "#1e1e1e",
    inputBorderFocus: "#333333",
    lineNumber: "#3a3a3a",
    codeText: "#d4d4d4",
    buttonPrimaryBg: "#ffffff",
    buttonPrimaryText: "#000000",
  },
};

export const lightTheme: ThemeDefinition = {
  id: "light",
  name: "Light",
  builtin: true,
  colors: {
    bgPrimary: "#f5f5f5",
    bgSecondary: "#ffffff",
    bgTertiary: "#e8e8e8",
    bgSurface: "rgba(0,0,0,0.03)",
    bgSurfaceHover: "rgba(0,0,0,0.06)",
    bgOverlay: "rgba(255,255,255,0.8)",
    bgInset: "#ebebeb",
    textPrimary: "#1a1a1a",
    textSecondary: "#4a4a4a",
    textMuted: "#6b6b6b",
    textDim: "#8a8a8a",
    textFaint: "#a0a0a0",
    textSubtle: "#b0b0b0",
    borderSubtle: "rgba(0,0,0,0.06)",
    borderLight: "rgba(0,0,0,0.10)",
    borderMedium: "rgba(0,0,0,0.15)",
    borderStrong: "rgba(0,0,0,0.22)",
    borderPanel: "rgba(0,0,0,0.18)",
    accentBlue: "#3b82f6",
    accentBlueBg: "rgba(59,130,246,0.08)",
    accentBlueBgHover: "rgba(59,130,246,0.12)",
    accentBlueBorder: "rgba(59,130,246,0.25)",
    accentBlueGlow: "rgba(59,130,246,0.4)",
    accentGreen: "#22c55e",
    accentGreenBright: "#16a34a",
    accentGreenGlow: "rgba(34,197,94,0.4)",
    accentRed: "#dc2626",
    accentRedText: "#ef4444",
    accentRedBg: "rgba(220,38,38,0.08)",
    accentRedBorder: "rgba(220,38,38,0.15)",
    accentOrange: "#ea580c",
    accentAmber: "#d97706",
    scrollbarThumb: "#d0d0d0",
    scrollbarHover: "#b0b0b0",
    inputBg: "#ffffff",
    inputBorder: "#d0d0d0",
    inputBorderFocus: "#a0a0a0",
    lineNumber: "#a0a0a0",
    codeText: "#1a1a1a",
    buttonPrimaryBg: "#1a1a1a",
    buttonPrimaryText: "#ffffff",
  },
};

export const navyBlurTheme: ThemeDefinition = {
  id: "navy-blur",
  name: "Navy Blur",
  builtin: true,
  colors: {
    bgPrimary: "#0a1628",
    bgSecondary: "#0f1d32",
    bgTertiary: "#162844",
    bgSurface: "rgba(100,160,255,0.04)",
    bgSurfaceHover: "rgba(100,160,255,0.08)",
    bgOverlay: "rgba(6,14,30,0.8)",
    bgInset: "#071020",
    textPrimary: "#d4e0f0",
    textSecondary: "#9fb3d0",
    textMuted: "#7a92b5",
    textDim: "#5a7399",
    textFaint: "#4a6080",
    textSubtle: "#3a4f6a",
    borderSubtle: "rgba(100,160,255,0.08)",
    borderLight: "rgba(100,160,255,0.15)",
    borderMedium: "rgba(100,160,255,0.22)",
    borderStrong: "rgba(100,160,255,0.30)",
    borderPanel: "rgba(100,160,255,0.35)",
    accentBlue: "#7bb3ff",
    accentBlueBg: "rgba(123,179,255,0.08)",
    accentBlueBgHover: "rgba(123,179,255,0.15)",
    accentBlueBorder: "rgba(123,179,255,0.3)",
    accentBlueGlow: "rgba(123,179,255,0.5)",
    accentGreen: "#5ce0a0",
    accentGreenBright: "#3dd48a",
    accentGreenGlow: "rgba(92,224,160,0.4)",
    accentRed: "#ff6b6b",
    accentRedText: "#ff8a8a",
    accentRedBg: "rgba(255,107,107,0.08)",
    accentRedBorder: "rgba(255,107,107,0.15)",
    accentOrange: "#ffab5c",
    accentAmber: "#ffc040",
    scrollbarThumb: "#1a3050",
    scrollbarHover: "#254060",
    inputBg: "#0c1a2e",
    inputBorder: "#1a3050",
    inputBorderFocus: "#2a4a70",
    lineNumber: "#3a5070",
    codeText: "#c8d8f0",
    buttonPrimaryBg: "#d4e0f0",
    buttonPrimaryText: "#0a1628",
  },
};

export const BUILTIN_THEMES: ThemeDefinition[] = [darkTheme, lightTheme, navyBlurTheme];

function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}

export function applyTheme(theme: ThemeDefinition): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--vp-${camelToKebab(key)}`, value);
  }
  // Sync xterm terminal colors with the new theme
  // Use dynamic import to avoid circular dependency
  requestAnimationFrame(() => {
    import("./terminal/terminalCache").then(({ refitAllTerminals }) => {
      refitAllTerminals();
    }).catch(() => {});
  });
}

export function getThemeById(id: string, customThemes: ThemeDefinition[] = []): ThemeDefinition {
  const all = [...BUILTIN_THEMES, ...customThemes];
  return all.find((t) => t.id === id) || darkTheme;
}

export function createDefaultThemeColors(): ThemeColors {
  return { ...darkTheme.colors };
}
