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
  // Syntax highlighting
  syntaxKeyword: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxComment: string;
  syntaxFunction: string;
  syntaxType: string;
  syntaxVariable: string;
  syntaxOperator: string;
  syntaxLiteral: string;
  syntaxRegexp: string;
  syntaxMeta: string;
  syntaxTag: string;
  syntaxAttribute: string;
  syntaxAddition: string;
  syntaxDeletion: string;
  // Extra accents
  accentYellow: string;
  accentPurple: string;
  accentPurpleBg: string;
  // Inline code
  inlineCodeColor: string;
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
    bgSurface: "#111111",
    bgSurfaceHover: "#1a1a1a",
    bgOverlay: "rgba(0,0,0,0.85)",
    bgInset: "#050505",
    textPrimary: "#e0e0e0",
    textSecondary: "#aaaaaa",
    textMuted: "#888888",
    textDim: "#666666",
    textFaint: "#555555",
    textSubtle: "#444444",
    borderSubtle: "#1f1f1f",
    borderLight: "#2a2a2a",
    borderMedium: "#333333",
    borderStrong: "#404040",
    borderPanel: "#555555",
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
    syntaxKeyword: "#c586c0",
    syntaxString: "#ce9178",
    syntaxNumber: "#b5cea8",
    syntaxComment: "#6a9955",
    syntaxFunction: "#dcdcaa",
    syntaxType: "#4ec9b0",
    syntaxVariable: "#9cdcfe",
    syntaxOperator: "#d4d4d4",
    syntaxLiteral: "#569cd6",
    syntaxRegexp: "#d16969",
    syntaxMeta: "#d7ba7d",
    syntaxTag: "#569cd6",
    syntaxAttribute: "#9cdcfe",
    syntaxAddition: "#4ade80",
    syntaxDeletion: "#f87171",
    accentYellow: "#f59e0b",
    accentPurple: "#c9b8fa",
    accentPurpleBg: "rgba(201,184,250,0.08)",
    inlineCodeColor: "#e2b86b",
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
    bgSurface: "#eeeeee",
    bgSurfaceHover: "#e4e4e4",
    bgOverlay: "rgba(255,255,255,0.9)",
    bgInset: "#ebebeb",
    textPrimary: "#1a1a1a",
    textSecondary: "#4a4a4a",
    textMuted: "#6b6b6b",
    textDim: "#8a8a8a",
    textFaint: "#a0a0a0",
    textSubtle: "#b0b0b0",
    borderSubtle: "#e8e8e8",
    borderLight: "#dcdcdc",
    borderMedium: "#d0d0d0",
    borderStrong: "#c0c0c0",
    borderPanel: "#cccccc",
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
    syntaxKeyword: "#af00db",
    syntaxString: "#a31515",
    syntaxNumber: "#098658",
    syntaxComment: "#008000",
    syntaxFunction: "#795e26",
    syntaxType: "#267f99",
    syntaxVariable: "#001080",
    syntaxOperator: "#1a1a1a",
    syntaxLiteral: "#0000ff",
    syntaxRegexp: "#811f3f",
    syntaxMeta: "#e36209",
    syntaxTag: "#800000",
    syntaxAttribute: "#e50000",
    syntaxAddition: "#22c55e",
    syntaxDeletion: "#dc2626",
    accentYellow: "#d97706",
    accentPurple: "#7c3aed",
    accentPurpleBg: "rgba(124,58,237,0.08)",
    inlineCodeColor: "#c7254e",
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
    bgSurface: "#0e1a30",
    bgSurfaceHover: "#132240",
    bgOverlay: "rgba(6,14,30,0.9)",
    bgInset: "#071020",
    textPrimary: "#d4e0f0",
    textSecondary: "#9fb3d0",
    textMuted: "#7a92b5",
    textDim: "#5a7399",
    textFaint: "#4a6080",
    textSubtle: "#3a4f6a",
    borderSubtle: "#121e35",
    borderLight: "#1a2a48",
    borderMedium: "#22365a",
    borderStrong: "#2a4270",
    borderPanel: "#2e4878",
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
    syntaxKeyword: "#d4a0ff",
    syntaxString: "#f0c090",
    syntaxNumber: "#c8e8a0",
    syntaxComment: "#6c9070",
    syntaxFunction: "#e8e0a0",
    syntaxType: "#70d0c0",
    syntaxVariable: "#a0d8f0",
    syntaxOperator: "#c8d8f0",
    syntaxLiteral: "#80b0e0",
    syntaxRegexp: "#e09090",
    syntaxMeta: "#e0c090",
    syntaxTag: "#80b0e0",
    syntaxAttribute: "#a0d8f0",
    syntaxAddition: "#5ce0a0",
    syntaxDeletion: "#ff8a8a",
    accentYellow: "#ffc040",
    accentPurple: "#d0b8ff",
    accentPurpleBg: "rgba(208,184,255,0.08)",
    inlineCodeColor: "#e8c070",
  },
};

export const BUILTIN_THEMES: ThemeDefinition[] = [darkTheme, lightTheme, navyBlurTheme];

function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, "-$1").toLowerCase();
}

/**
 * Derive rgba variants from a hex accent color for bg, hover, border, glow.
 */
function deriveAccentVariants(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    accent: hex,
    bg: `rgba(${r},${g},${b},0.08)`,
    bgHover: `rgba(${r},${g},${b},0.15)`,
    border: `rgba(${r},${g},${b},0.3)`,
    glow: `rgba(${r},${g},${b},0.5)`,
  };
}

export function applyTheme(theme: ThemeDefinition, accentOverride?: string | null): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--vp-${camelToKebab(key)}`, value);
  }

  // Override accent colors if user picked a global accent color
  if (accentOverride) {
    const v = deriveAccentVariants(accentOverride);
    root.style.setProperty("--vp-accent-blue", v.accent);
    root.style.setProperty("--vp-accent-blue-bg", v.bg);
    root.style.setProperty("--vp-accent-blue-bg-hover", v.bgHover);
    root.style.setProperty("--vp-accent-blue-border", v.border);
    root.style.setProperty("--vp-accent-blue-glow", v.glow);
  }

  // Sync xterm terminal colors with the new theme
  // Use dynamic import to avoid circular dependency
  requestAnimationFrame(() => {
    import("./terminal/terminalCache").then(({ refitAllTerminals }) => {
      refitAllTerminals();
    }).catch(() => {});
  });
}

export type BorderStyle = "rounded" | "sharp";

const ROUNDED_RADII: Record<string, string> = {
  "--vp-radius-xs": "3px",
  "--vp-radius-sm": "4px",
  "--vp-radius-md": "6px",
  "--vp-radius-lg": "8px",
  "--vp-radius-xl": "10px",
  "--vp-radius-2xl": "12px",
  "--vp-radius-3xl": "14px",
  "--vp-radius-4xl": "16px",
};

export function applyBorderStyle(style: BorderStyle): void {
  const root = document.documentElement;
  for (const [varName, roundedValue] of Object.entries(ROUNDED_RADII)) {
    root.style.setProperty(varName, style === "sharp" ? "0" : roundedValue);
  }
}

export function getThemeById(id: string, customThemes: ThemeDefinition[] = []): ThemeDefinition {
  const all = [...BUILTIN_THEMES, ...customThemes];
  return all.find((t) => t.id === id) || darkTheme;
}

export function createDefaultThemeColors(): ThemeColors {
  return { ...darkTheme.colors };
}

// --- Density Mode ---
const DENSITY_SCALES: Record<string, Record<string, string>> = {
  compact: {
    "--vp-density-padding-xs": "2px",
    "--vp-density-padding-sm": "4px",
    "--vp-density-padding-md": "6px",
    "--vp-density-padding-lg": "8px",
    "--vp-density-gap": "4px",
    "--vp-density-font-size": "11px",
    "--vp-density-line-height": "1.3",
  },
  comfortable: {
    "--vp-density-padding-xs": "4px",
    "--vp-density-padding-sm": "6px",
    "--vp-density-padding-md": "10px",
    "--vp-density-padding-lg": "14px",
    "--vp-density-gap": "6px",
    "--vp-density-font-size": "12px",
    "--vp-density-line-height": "1.5",
  },
  spacious: {
    "--vp-density-padding-xs": "6px",
    "--vp-density-padding-sm": "8px",
    "--vp-density-padding-md": "14px",
    "--vp-density-padding-lg": "18px",
    "--vp-density-gap": "8px",
    "--vp-density-font-size": "13px",
    "--vp-density-line-height": "1.6",
  },
};

export function applyDensityMode(mode: string): void {
  const vars = DENSITY_SCALES[mode] || DENSITY_SCALES.comfortable;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}

// --- UI Font Size ---
const UI_FONT_SIZES: Record<string, string> = {
  small: "12px",
  normal: "13px",
  large: "14px",
};

export function applyUIFontSize(size: string): void {
  document.documentElement.style.setProperty(
    "--vp-ui-font-size",
    UI_FONT_SIZES[size] || "13px"
  );
}
