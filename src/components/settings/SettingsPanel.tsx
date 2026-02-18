import { useState, useCallback, useEffect } from "react";
import { X, Palette, Bot, Layout, Plus, Trash2, Edit3, Check, Settings, Keyboard, RotateCcw, Download, Upload } from "lucide-react";
import { useSettingsStore, type UserAgent } from "../../stores/settingsStore";
import { useConfirmStore } from "../../stores/confirmStore";
import { BUILTIN_THEMES, createDefaultThemeColors, type ThemeDefinition, type ThemeColors } from "../../lib/themes";
import {
  BUILTIN_TERMINAL_THEMES,
  TERMINAL_COLOR_GROUPS,
  TERMINAL_COLOR_LABELS,
  createDefaultTerminalColors,
  type TerminalThemeDefinition,
} from "../../lib/terminal/terminalThemes";
import { useUIStore } from "../../stores/uiStore";
import {
  exportAppTheme,
  exportTerminalTheme,
  importAsAppTheme,
  importAsTerminalTheme,
  downloadThemeFile,
  openThemeFile,
  validateThemeExportFile,
} from "../../lib/themeExportImport";
import { invoke } from "../../lib/ipc";
import {
  ALL_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  formatShortcut,
  getShortcutKey,
  keyEventToAccelerator,
  findConflict,
} from "../../lib/shortcuts";

type SettingsTab = "general" | "themes" | "agents" | "workspaces" | "shortcuts";

const TABS: { id: SettingsTab; label: string; icon: typeof Palette }[] = [
  { id: "general", label: "General", icon: Settings },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "themes", label: "Themes", icon: Palette },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "workspaces", label: "Workspaces", icon: Layout },
];

const COLOR_TOKEN_GROUPS: { label: string; keys: (keyof ThemeColors)[] }[] = [
  { label: "Backgrounds", keys: ["bgPrimary", "bgSecondary", "bgTertiary", "bgSurface", "bgSurfaceHover", "bgOverlay"] },
  { label: "Text", keys: ["textPrimary", "textSecondary", "textMuted", "textDim", "textFaint", "textSubtle"] },
  { label: "Borders", keys: ["borderSubtle", "borderLight", "borderMedium", "borderStrong", "borderPanel"] },
  { label: "Accents", keys: ["accentBlue", "accentGreen", "accentRed", "accentOrange"] },
  { label: "Input", keys: ["inputBg", "inputBorder", "inputBorderFocus", "scrollbarThumb", "scrollbarHover"] },
];

const TOKEN_LABELS: Record<string, string> = {
  bgPrimary: "Primary BG", bgSecondary: "Secondary BG", bgTertiary: "Tertiary BG",
  bgSurface: "Surface", bgSurfaceHover: "Surface Hover", bgOverlay: "Overlay",
  textPrimary: "Primary", textSecondary: "Secondary", textMuted: "Muted",
  textDim: "Dim", textFaint: "Faint", textSubtle: "Subtle",
  borderSubtle: "Subtle", borderLight: "Light", borderMedium: "Medium",
  borderStrong: "Strong", borderPanel: "Panel",
  accentBlue: "Blue", accentGreen: "Green", accentRed: "Red", accentOrange: "Orange",
  inputBg: "Input BG", inputBorder: "Input Border", inputBorderFocus: "Input Focus",
  scrollbarThumb: "Scrollbar", scrollbarHover: "Scrollbar Hover",
};

const AGENT_COLORS = [
  "#f97316", "#60a5fa", "#a78bfa", "#38bdf8", "#f472b6",
  "#4ade80", "#facc15", "#ef4444", "#34d399", "#888888",
];

export default function SettingsPanel() {
  const show = useSettingsStore((s) => s.showSettingsPanel);
  const setShow = useSettingsStore((s) => s.setShowSettingsPanel);

  const borderStyle = useSettingsStore((s) => s.borderStyle);
  const setBorderStyle = useSettingsStore((s) => s.setBorderStyle);

  const activeThemeId = useSettingsStore((s) => s.activeThemeId);
  const customThemes = useSettingsStore((s) => s.customThemes);
  const setActiveTheme = useSettingsStore((s) => s.setActiveTheme);
  const addCustomTheme = useSettingsStore((s) => s.addCustomTheme);
  const removeCustomTheme = useSettingsStore((s) => s.removeCustomTheme);
  const updateCustomTheme = useSettingsStore((s) => s.updateCustomTheme);

  const terminalThemeId = useSettingsStore((s) => s.terminalThemeId);
  const setTerminalTheme = useSettingsStore((s) => s.setTerminalTheme);
  const customTerminalThemes = useSettingsStore((s) => s.customTerminalThemes);
  const addCustomTerminalTheme = useSettingsStore((s) => s.addCustomTerminalTheme);
  const removeCustomTerminalTheme = useSettingsStore((s) => s.removeCustomTerminalTheme);
  const updateCustomTerminalTheme = useSettingsStore((s) => s.updateCustomTerminalTheme);

  const userAgents = useSettingsStore((s) => s.userAgents);
  const addUserAgent = useSettingsStore((s) => s.addUserAgent);
  const removeUserAgent = useSettingsStore((s) => s.removeUserAgent);


  const savedWorkspaces = useSettingsStore((s) => s.savedWorkspaces);
  const saveWorkspaces = useSettingsStore((s) => s.saveWorkspaces);

  const cliEnabled = useSettingsStore((s) => s.cliEnabled);
  const setCliEnabled = useSettingsStore((s) => s.setCliEnabled);
  const [cliToggling, setCliToggling] = useState(false);
  const [cliError, setCliError] = useState<string | null>(null);

  const customShortcuts = useSettingsStore((s) => s.customShortcuts);
  const setCustomShortcut = useSettingsStore((s) => s.setCustomShortcut);
  const resetShortcut = useSettingsStore((s) => s.resetShortcut);
  const resetAllShortcuts = useSettingsStore((s) => s.resetAllShortcuts);

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [editingTheme, setEditingTheme] = useState<ThemeDefinition | null>(null);
  const [editingTerminalTheme, setEditingTerminalTheme] = useState<TerminalThemeDefinition | null>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [newAgent, setNewAgent] = useState<Partial<UserAgent>>({ label: "", cmd: "", color: "#60a5fa", args: [], flags: [] });
  const [recordingShortcutId, setRecordingShortcutId] = useState<string | null>(null);
  const [shortcutConflict, setShortcutConflict] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const close = useCallback(() => setShow(false), [setShow]);

  // Shortcut recording keydown handler — must be before conditional return
  useEffect(() => {
    if (!recordingShortcutId || !show) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Escape cancels recording
      if (e.key === "Escape") {
        setRecordingShortcutId(null);
        setShortcutConflict(null);
        return;
      }

      // Backspace/Delete clears the shortcut
      if (e.key === "Backspace" || e.key === "Delete") {
        resetShortcut(recordingShortcutId);
        setRecordingShortcutId(null);
        setShortcutConflict(null);
        return;
      }

      const accel = keyEventToAccelerator(e);
      if (!accel) return; // modifier-only press

      const conflict = findConflict(accel, recordingShortcutId, customShortcuts);
      if (conflict) {
        setShortcutConflict(`Conflicts with "${conflict.label}"`);
        return;
      }

      setCustomShortcut(recordingShortcutId, accel);
      setRecordingShortcutId(null);
      setShortcutConflict(null);
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recordingShortcutId, customShortcuts, setCustomShortcut, show]);

  if (!show) return null;

  /* ── Shortcuts Tab ── */
  const renderShortcutsTab = () => (
    <div className="space-y-5">
      {SHORTCUT_CATEGORIES.map((category) => {
        const shortcuts = ALL_SHORTCUTS.filter((s) => s.category === category);
        if (shortcuts.length === 0) return null;

        return (
          <div key={category}>
            <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {category}
            </label>
            <div style={{ marginTop: 8 }}>
              {shortcuts.map((shortcut) => {
                const currentKey = getShortcutKey(shortcut.id, customShortcuts);
                const isCustom = customShortcuts[shortcut.id] !== undefined;
                const isRecording = recordingShortcutId === shortcut.id;

                return (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between"
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--vp-radius-lg)",
                      marginBottom: 2,
                      background: isRecording ? "var(--vp-bg-surface-hover)" : "transparent",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => { if (!isRecording) e.currentTarget.style.background = "var(--vp-bg-surface)"; }}
                    onMouseLeave={(e) => { if (!isRecording) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 12, color: "var(--vp-text-primary)", fontWeight: 400 }}>
                      {shortcut.label}
                    </span>
                    <div className="flex items-center gap-2">
                      {isRecording ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--vp-accent-blue)",
                              fontWeight: 500,
                              padding: "3px 10px",
                              background: "var(--vp-bg-surface)",
                              border: "1px solid var(--vp-accent-blue)",
                              borderRadius: "var(--vp-radius-md)",
                              animation: "pulse 1.5s ease-in-out infinite",
                            }}
                          >
                            Press shortcut...
                          </span>
                          {shortcutConflict && (
                            <span style={{ fontSize: 10, color: "var(--vp-accent-red)", marginTop: 4 }}>
                              {shortcutConflict}
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setRecordingShortcutId(shortcut.id);
                            setShortcutConflict(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "3px 10px",
                            background: "var(--vp-bg-surface)",
                            border: "1px solid var(--vp-border-subtle)",
                            borderRadius: "var(--vp-radius-md)",
                            cursor: "pointer",
                            fontSize: 11,
                            fontFamily: "monospace",
                            color: currentKey ? "var(--vp-text-primary)" : "var(--vp-text-dim)",
                            fontWeight: isCustom ? 600 : 400,
                            transition: "all 0.15s",
                          }}
                        >
                          {currentKey ? formatShortcut(currentKey) : "—"}
                        </button>
                      )}
                      {isCustom && !isRecording && (
                        <button
                          onClick={() => resetShortcut(shortcut.id)}
                          title="Reset to default"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: 3,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--vp-text-dim)",
                            borderRadius: "var(--vp-radius-sm)",
                            transition: "color 0.15s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-accent-blue)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-dim)")}
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {Object.keys(customShortcuts).length > 0 && (
        <div style={{ borderTop: "1px solid var(--vp-border-subtle)", paddingTop: 16, marginTop: 8 }}>
          <button
            onClick={resetAllShortcuts}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: "var(--vp-radius-lg)",
              background: "transparent",
              border: "1px solid var(--vp-border-light)",
              color: "var(--vp-accent-red)",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <RotateCcw size={13} />
            Reset All to Defaults
          </button>
        </div>
      )}
    </div>
  );

  /* ── General Tab ── */
  const handleCliToggle = async () => {
    setCliToggling(true);
    setCliError(null);
    try {
      if (cliEnabled) {
        const result = await invoke<{ success: boolean; error?: string }>("uninstall_cli");
        if (result.success) {
          setCliEnabled(false);
        } else {
          setCliError(result.error || "Failed to uninstall CLI");
        }
      } else {
        const result = await invoke<{ success: boolean; error?: string }>("install_cli");
        if (result.success) {
          setCliEnabled(true);
        } else {
          setCliError(result.error || "Failed to install CLI");
        }
      }
    } catch (err: any) {
      setCliError(err?.message || "Failed to toggle CLI");
    } finally {
      setCliToggling(false);
    }
  };

  const renderGeneralTab = () => (
    <div className="space-y-5">
      <div>
        <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Terminal Integration
        </label>
        <div
          className="flex items-center justify-between"
          style={{
            padding: "14px 16px", borderRadius: "var(--vp-radius-xl)", marginTop: 10,
            border: "1px solid var(--vp-border-subtle)",
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: "var(--vp-text-primary)", fontWeight: 500 }}>
              Terminal Command
            </div>
            <div style={{ fontSize: 11, color: "var(--vp-text-dim)", marginTop: 2 }}>
              Use <code style={{ background: "var(--vp-bg-surface-hover)", padding: "1px 5px", borderRadius: "var(--vp-radius-sm)", fontSize: 11 }}>praxis .</code> to open projects from terminal
            </div>
          </div>
          <button
            onClick={handleCliToggle}
            disabled={cliToggling}
            style={{
              width: 44, height: 24, borderRadius: "var(--vp-radius-2xl)", border: "none",
              background: cliEnabled ? "var(--vp-accent-blue)" : "var(--vp-bg-surface-hover)",
              cursor: cliToggling ? "wait" : "pointer",
              position: "relative", transition: "background 0.2s",
              opacity: cliToggling ? 0.6 : 1,
            }}
          >
            <div
              style={{
                width: 18, height: 18, borderRadius: "50%",
                background: "#fff",
                position: "absolute", top: 3,
                left: cliEnabled ? 23 : 3,
                transition: "left 0.2s",
              }}
            />
          </button>
        </div>
        {cliError && (
          <div style={{ fontSize: 11, color: "var(--vp-accent-red)", marginTop: 8, padding: "0 16px" }}>
            {cliError}
          </div>
        )}
      </div>
    </div>
  );

  /* ── Theme Tab ── */
  const renderThemesTab = () => (
    <div className="space-y-5">
      {/* Border Style */}
      <div>
        <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Border Style
        </label>
        <div className="flex gap-3 mt-3">
          {(["rounded", "sharp"] as const).map((style) => {
            const isActive = (borderStyle || "rounded") === style;
            return (
              <button
                key={style}
                onClick={() => setBorderStyle(style)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: "14px 20px",
                  border: `2px solid ${isActive ? "var(--vp-accent-blue)" : "var(--vp-border-subtle)"}`,
                  borderRadius: style === "sharp" ? 0 : 12,
                  background: isActive ? "var(--vp-accent-blue-bg)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  flex: 1,
                }}
              >
                {/* Preview */}
                <div style={{
                  width: "100%", height: 32, display: "flex", gap: 6, alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    width: 40, height: 24,
                    borderRadius: style === "sharp" ? 0 : 8,
                    background: "var(--vp-bg-surface-hover)",
                    border: "1px solid var(--vp-border-light)",
                  }} />
                  <div style={{
                    width: 24, height: 24,
                    borderRadius: style === "sharp" ? 0 : 6,
                    background: "var(--vp-bg-surface-hover)",
                    border: "1px solid var(--vp-border-light)",
                  }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--vp-text-primary)", fontWeight: isActive ? 600 : 400 }}>
                  {style === "rounded" ? "Rounded" : "Sharp"}
                </span>
                {isActive && (
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--vp-accent-blue)" }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Built-in themes */}
      <div>
        <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Built-in Themes
        </label>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {BUILTIN_THEMES.map((theme) => {
            const isActive = activeThemeId === theme.id;
            return (
              <div key={theme.id} style={{ position: "relative" }}>
                <button
                  onClick={() => setActiveTheme(theme.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    padding: "14px 12px",
                    border: `2px solid ${isActive ? "var(--vp-accent-blue)" : "var(--vp-border-subtle)"}`,
                    borderRadius: "var(--vp-radius-2xl)",
                    background: isActive ? "var(--vp-accent-blue-bg)" : "transparent",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    width: "100%",
                  }}
                >
                  {/* Preview swatch */}
                  <div style={{
                    width: "100%", height: 36, borderRadius: "var(--vp-radius-lg)",
                    background: theme.colors.bgPrimary,
                    border: `1px solid ${theme.colors.borderLight}`,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.colors.accentBlue }} />
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.colors.accentGreen }} />
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.colors.accentOrange }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--vp-text-primary)", fontWeight: isActive ? 600 : 400 }}>
                    {theme.name}
                  </span>
                  {isActive && (
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--vp-accent-blue)" }} />
                  )}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadThemeFile(exportAppTheme(theme)); }}
                  title={`Export ${theme.name}`}
                  style={{
                    position: "absolute", top: 6, right: 6,
                    padding: 3, borderRadius: "var(--vp-radius-sm)",
                    background: "var(--vp-bg-surface-hover)", border: "none", cursor: "pointer",
                    color: "var(--vp-text-faint)", display: "flex", alignItems: "center",
                    opacity: 0.5, transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
                >
                  <Download size={10} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Terminal themes */}
      <div>
        <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Terminal Theme
        </label>
        <div className="grid grid-cols-4 gap-2 mt-3">
          {BUILTIN_TERMINAL_THEMES.map((tt) => {
            const isActive = terminalThemeId === tt.id;
            const t = tt.theme;
            return (
              <div key={tt.id} style={{ position: "relative" }}>
                <button
                  onClick={() => setTerminalTheme(tt.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 8px",
                    border: `2px solid ${isActive ? "var(--vp-accent-blue)" : "var(--vp-border-subtle)"}`,
                    borderRadius: "var(--vp-radius-xl)",
                    background: isActive ? "var(--vp-accent-blue-bg)" : "transparent",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    width: "100%",
                  }}
                >
                  {/* Mini terminal preview */}
                  <div style={{
                    width: "100%", height: 32, borderRadius: "var(--vp-radius-md)",
                    background: t.background,
                    border: "1px solid var(--vp-border-light)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                    padding: "0 6px",
                    overflow: "hidden",
                  }}>
                    <span style={{ fontSize: 8, color: t.green, fontFamily: "monospace", whiteSpace: "nowrap" }}>$</span>
                    <span style={{ fontSize: 7, color: t.foreground, fontFamily: "monospace", whiteSpace: "nowrap", opacity: 0.7 }}>~/code</span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: t.red }} />
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: t.yellow }} />
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: t.blue }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--vp-text-primary)", fontWeight: isActive ? 600 : 400 }}>
                    {tt.name}
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); downloadThemeFile(exportTerminalTheme(tt)); }}
                  title={`Export ${tt.name}`}
                  style={{
                    position: "absolute", top: 4, right: 4,
                    padding: 2, borderRadius: "var(--vp-radius-sm)",
                    background: "var(--vp-bg-surface-hover)", border: "none", cursor: "pointer",
                    color: "var(--vp-text-faint)", display: "flex", alignItems: "center",
                    opacity: 0.5, transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
                >
                  <Download size={9} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom App Themes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Custom App Themes
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setImportError(null);
                setImportSuccess(null);
                const raw = await openThemeFile();
                if (!raw) return;
                const { data, error } = validateThemeExportFile(raw);
                if (error) { setImportError(error); return; }
                if (!data) return;
                if (data.type !== "app-theme") {
                  setImportError("This is a terminal theme. Use Import in Terminal Themes section.");
                  return;
                }
                const theme = importAsAppTheme(data);
                addCustomTheme(theme);
                setImportSuccess(`Imported "${theme.name}"`);
                setTimeout(() => setImportSuccess(null), 3000);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: "var(--vp-radius-md)",
                background: "transparent", border: "1px solid var(--vp-border-light)",
                color: "var(--vp-accent-green)", cursor: "pointer", fontSize: 11,
                transition: "all 0.15s",
              }}
            >
              <Upload size={12} /> Import
            </button>
            <button
              onClick={() => {
                const id = `custom-${Date.now()}`;
                const theme: ThemeDefinition = {
                  id,
                  name: "My Theme",
                  builtin: false,
                  colors: createDefaultThemeColors(),
                };
                addCustomTheme(theme);
                setEditingTheme(theme);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: "var(--vp-radius-md)",
                background: "transparent", border: "1px solid var(--vp-border-light)",
                color: "var(--vp-accent-blue)", cursor: "pointer", fontSize: 11,
                transition: "all 0.15s",
              }}
            >
              <Plus size={12} /> New Theme
            </button>
          </div>
        </div>

        {customThemes.length === 0 && !editingTheme && (
          <div style={{ color: "var(--vp-text-dim)", fontSize: 12, textAlign: "center", padding: "16px 0" }}>
            No custom app themes yet
          </div>
        )}

        {customThemes.map((theme) => {
          const isActive = activeThemeId === theme.id;
          const isEditing = editingTheme?.id === theme.id;

          if (isEditing) {
            return renderThemeEditor(theme);
          }

          return (
            <div
              key={theme.id}
              className="flex items-center justify-between"
              style={{
                padding: "10px 14px", borderRadius: "var(--vp-radius-xl)", marginBottom: 6,
                border: `1px solid ${isActive ? "var(--vp-accent-blue)" : "var(--vp-border-subtle)"}`,
                background: isActive ? "var(--vp-accent-blue-bg)" : "transparent",
              }}
            >
              <div className="flex items-center gap-3">
                <div style={{
                  width: 24, height: 24, borderRadius: "var(--vp-radius-md)",
                  background: theme.colors.bgPrimary,
                  border: `1px solid ${theme.colors.borderLight}`,
                }} />
                <span style={{ fontSize: 12, color: "var(--vp-text-primary)", fontWeight: isActive ? 500 : 400 }}>
                  {theme.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadThemeFile(exportAppTheme(theme))} style={iconBtnStyle} title="Export">
                  <Download size={13} style={{ color: "var(--vp-text-dim)" }} />
                </button>
                <button onClick={() => setActiveTheme(theme.id)} style={iconBtnStyle}>
                  <Check size={13} style={{ color: isActive ? "var(--vp-accent-green)" : "var(--vp-text-dim)" }} />
                </button>
                <button onClick={() => setEditingTheme(theme)} style={iconBtnStyle}>
                  <Edit3 size={13} style={{ color: "var(--vp-text-dim)" }} />
                </button>
                <button onClick={() => removeCustomTheme(theme.id)} style={iconBtnStyle}>
                  <Trash2 size={13} style={{ color: "var(--vp-accent-red)" }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Terminal Themes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Custom Terminal Themes
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setImportError(null);
                setImportSuccess(null);
                const raw = await openThemeFile();
                if (!raw) return;
                const { data, error } = validateThemeExportFile(raw);
                if (error) { setImportError(error); return; }
                if (!data) return;
                if (data.type !== "terminal-theme") {
                  setImportError("This is an app theme. Use Import in App Themes section.");
                  return;
                }
                const theme = importAsTerminalTheme(data);
                addCustomTerminalTheme(theme);
                setImportSuccess(`Imported "${theme.name}"`);
                setTimeout(() => setImportSuccess(null), 3000);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: "var(--vp-radius-md)",
                background: "transparent", border: "1px solid var(--vp-border-light)",
                color: "var(--vp-accent-green)", cursor: "pointer", fontSize: 11,
                transition: "all 0.15s",
              }}
            >
              <Upload size={12} /> Import
            </button>
            <button
              onClick={() => {
                const id = `custom-term-${Date.now()}`;
                const theme: TerminalThemeDefinition = {
                  id,
                  name: "My Terminal Theme",
                  theme: createDefaultTerminalColors() as any,
                };
                addCustomTerminalTheme(theme);
                setEditingTerminalTheme(theme);
              }}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: "var(--vp-radius-md)",
                background: "transparent", border: "1px solid var(--vp-border-light)",
                color: "var(--vp-accent-blue)", cursor: "pointer", fontSize: 11,
                transition: "all 0.15s",
              }}
            >
              <Plus size={12} /> New Theme
            </button>
          </div>
        </div>

        {customTerminalThemes.length === 0 && !editingTerminalTheme && (
          <div style={{ color: "var(--vp-text-dim)", fontSize: 12, textAlign: "center", padding: "16px 0" }}>
            No custom terminal themes yet
          </div>
        )}

        {customTerminalThemes.map((tt) => {
          const isActive = terminalThemeId === tt.id;
          const isEditing = editingTerminalTheme?.id === tt.id;

          if (isEditing) {
            return renderTerminalThemeEditor(tt);
          }

          return (
            <div
              key={tt.id}
              className="flex items-center justify-between"
              style={{
                padding: "10px 14px", borderRadius: "var(--vp-radius-xl)", marginBottom: 6,
                border: `1px solid ${isActive ? "var(--vp-accent-blue)" : "var(--vp-border-subtle)"}`,
                background: isActive ? "var(--vp-accent-blue-bg)" : "transparent",
              }}
            >
              <div className="flex items-center gap-3">
                <div style={{
                  width: 24, height: 24, borderRadius: "var(--vp-radius-md)",
                  background: (tt.theme.background as string) || "#000",
                  border: "1px solid var(--vp-border-light)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 8, color: tt.theme.green as string, fontFamily: "monospace" }}>$</span>
                </div>
                <span style={{ fontSize: 12, color: "var(--vp-text-primary)", fontWeight: isActive ? 500 : 400 }}>
                  {tt.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => downloadThemeFile(exportTerminalTheme(tt))} style={iconBtnStyle} title="Export">
                  <Download size={13} style={{ color: "var(--vp-text-dim)" }} />
                </button>
                <button onClick={() => setTerminalTheme(tt.id)} style={iconBtnStyle}>
                  <Check size={13} style={{ color: isActive ? "var(--vp-accent-green)" : "var(--vp-text-dim)" }} />
                </button>
                <button onClick={() => setEditingTerminalTheme(tt)} style={iconBtnStyle}>
                  <Edit3 size={13} style={{ color: "var(--vp-text-dim)" }} />
                </button>
                <button onClick={() => removeCustomTerminalTheme(tt.id)} style={iconBtnStyle}>
                  <Trash2 size={13} style={{ color: "var(--vp-accent-red)" }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Import feedback */}
      {importError && (
        <div style={{
          padding: "8px 12px", borderRadius: "var(--vp-radius-lg)",
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
          fontSize: 11, color: "#ef4444",
        }}>
          {importError}
          <button
            onClick={() => setImportError(null)}
            style={{ marginLeft: 8, background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 11 }}
          >
            x
          </button>
        </div>
      )}
      {importSuccess && (
        <div style={{
          padding: "8px 12px", borderRadius: "var(--vp-radius-lg)",
          background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.15)",
          fontSize: 11, color: "#4ade80", fontWeight: 600,
        }}>
          {importSuccess}
        </div>
      )}
    </div>
  );

  const renderThemeEditor = (theme: ThemeDefinition) => (
    <div
      key={theme.id}
      style={{
        border: "1px solid var(--vp-accent-blue)",
        borderRadius: "var(--vp-radius-2xl)", padding: 16, marginBottom: 8,
        background: "var(--vp-accent-blue-bg)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <input
          value={theme.name}
          onChange={(e) => {
            useSettingsStore.getState().addCustomTheme; // just for type
            // Update the theme name in store
            const store = useSettingsStore.getState();
            const idx = store.customThemes.findIndex((t) => t.id === theme.id);
            if (idx >= 0) {
              const themes = [...store.customThemes];
              themes[idx] = { ...themes[idx], name: e.target.value };
              useSettingsStore.setState({ customThemes: themes });
            }
            setEditingTheme({ ...theme, name: e.target.value });
          }}
          style={{
            background: "var(--vp-input-bg)", border: "1px solid var(--vp-input-border)",
            borderRadius: "var(--vp-radius-md)", padding: "4px 8px", color: "var(--vp-text-primary)",
            fontSize: 13, fontWeight: 500, outline: "none", width: 180,
          }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              useConfirmStore.getState().showConfirm(
                "Delete Theme",
                `Permanently delete "${theme.name}"?`,
                () => {
                  removeCustomTheme(theme.id);
                  if (activeThemeId === theme.id) {
                    setActiveTheme("dark");
                  }
                  setEditingTheme(null);
                },
                { danger: true, confirmLabel: "Delete" }
              );
            }}
            style={{
              padding: "4px 12px", borderRadius: "var(--vp-radius-md)",
              background: "transparent", border: "1px solid var(--vp-accent-red-border, var(--vp-border-light))",
              color: "var(--vp-accent-red)", fontSize: 11, cursor: "pointer", fontWeight: 500,
            }}
          >
            Delete
          </button>
          <button
            onClick={() => {
              setEditingTheme(null);
            }}
            style={{
              padding: "4px 12px", borderRadius: "var(--vp-radius-md)",
              background: "transparent", border: "1px solid var(--vp-border-light)",
              color: "var(--vp-text-muted)", fontSize: 11, cursor: "pointer", fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setEditingTheme(null);
              useSettingsStore.getState().saveSettings();
            }}
            style={{
              padding: "4px 12px", borderRadius: "var(--vp-radius-md)",
              background: "var(--vp-accent-blue)", border: "none",
              color: "var(--vp-button-primary-bg)", fontSize: 11, cursor: "pointer", fontWeight: 500,
            }}
          >
            Done
          </button>
        </div>
      </div>

      <div className="space-y-4" style={{ maxHeight: 300, overflowY: "auto" }}>
        {COLOR_TOKEN_GROUPS.map((group) => (
          <div key={group.label}>
            <label style={{ fontSize: 10, color: "var(--vp-text-muted)", fontWeight: 500, textTransform: "uppercase" }}>
              {group.label}
            </label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {group.keys.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.colors[key]?.startsWith("rgba") ? "var(--vp-text-muted)" : (theme.colors[key] || "#000000")}
                    onChange={(e) => {
                      updateCustomTheme(theme.id, { [key]: e.target.value });
                      setEditingTheme((prev) => prev ? { ...prev, colors: { ...prev.colors, [key]: e.target.value } } : null);
                    }}
                    style={{ width: 24, height: 24, borderRadius: "var(--vp-radius-sm)", border: "none", cursor: "pointer", padding: 0 }}
                  />
                  <span style={{ fontSize: 10, color: "var(--vp-text-dim)" }}>
                    {TOKEN_LABELS[key] || key}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTerminalThemeEditor = (tt: TerminalThemeDefinition) => (
    <div
      key={tt.id}
      style={{
        border: "1px solid var(--vp-accent-blue)",
        borderRadius: "var(--vp-radius-2xl)", padding: 16, marginBottom: 8,
        background: "var(--vp-accent-blue-bg)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <input
          value={tt.name}
          onChange={(e) => {
            const store = useSettingsStore.getState();
            const idx = store.customTerminalThemes.findIndex((t) => t.id === tt.id);
            if (idx >= 0) {
              const themes = [...store.customTerminalThemes];
              themes[idx] = { ...themes[idx], name: e.target.value };
              useSettingsStore.setState({ customTerminalThemes: themes });
            }
            setEditingTerminalTheme({ ...tt, name: e.target.value });
          }}
          style={{
            background: "var(--vp-input-bg)", border: "1px solid var(--vp-input-border)",
            borderRadius: "var(--vp-radius-md)", padding: "4px 8px", color: "var(--vp-text-primary)",
            fontSize: 13, fontWeight: 500, outline: "none", width: 180,
          }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              useConfirmStore.getState().showConfirm(
                "Delete Terminal Theme",
                `Permanently delete "${tt.name}"?`,
                () => {
                  removeCustomTerminalTheme(tt.id);
                  if (terminalThemeId === tt.id) {
                    setTerminalTheme("default-dark");
                  }
                  setEditingTerminalTheme(null);
                },
                { danger: true, confirmLabel: "Delete" }
              );
            }}
            style={{
              padding: "4px 12px", borderRadius: "var(--vp-radius-md)",
              background: "transparent", border: "1px solid var(--vp-accent-red-border, var(--vp-border-light))",
              color: "var(--vp-accent-red)", fontSize: 11, cursor: "pointer", fontWeight: 500,
            }}
          >
            Delete
          </button>
          <button
            onClick={() => {
              setEditingTerminalTheme(null);
            }}
            style={{
              padding: "4px 12px", borderRadius: "var(--vp-radius-md)",
              background: "transparent", border: "1px solid var(--vp-border-light)",
              color: "var(--vp-text-muted)", fontSize: 11, cursor: "pointer", fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setEditingTerminalTheme(null);
              useSettingsStore.getState().saveSettings();
            }}
            style={{
              padding: "4px 12px", borderRadius: "var(--vp-radius-md)",
              background: "var(--vp-accent-blue)", border: "none",
              color: "var(--vp-button-primary-bg)", fontSize: 11, cursor: "pointer", fontWeight: 500,
            }}
          >
            Done
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div style={{
        width: "100%", height: 48, borderRadius: "var(--vp-radius-lg)", marginBottom: 12,
        background: (tt.theme.background as string) || "#000",
        border: "1px solid var(--vp-border-light)",
        display: "flex", alignItems: "center", gap: 6,
        padding: "0 12px", fontFamily: "monospace", fontSize: 11,
        overflow: "hidden",
      }}>
        <span style={{ color: tt.theme.green as string }}>$</span>
        <span style={{ color: tt.theme.foreground as string }}>ls -la</span>
        <span style={{ color: tt.theme.blue as string }}>src/</span>
        <span style={{ color: tt.theme.yellow as string }}>package.json</span>
        <span style={{ color: tt.theme.red as string }}>error.log</span>
        <span style={{ color: tt.theme.magenta as string }}>README</span>
      </div>

      <div className="space-y-4" style={{ maxHeight: 260, overflowY: "auto" }}>
        {TERMINAL_COLOR_GROUPS.map((group) => (
          <div key={group.label}>
            <label style={{ fontSize: 10, color: "var(--vp-text-muted)", fontWeight: 500, textTransform: "uppercase" }}>
              {group.label}
            </label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {group.keys.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={(tt.theme[key] as string) || "#000000"}
                    onChange={(e) => {
                      updateCustomTerminalTheme(tt.id, { [key]: e.target.value });
                      setEditingTerminalTheme((prev) =>
                        prev ? { ...prev, theme: { ...prev.theme, [key]: e.target.value } } : null
                      );
                    }}
                    style={{ width: 22, height: 22, borderRadius: "var(--vp-radius-sm)", border: "none", cursor: "pointer", padding: 0 }}
                  />
                  <span style={{ fontSize: 9, color: "var(--vp-text-dim)" }}>
                    {TERMINAL_COLOR_LABELS[key] || key}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ── Agents Tab ── */
  const renderAgentsTab = () => (
    <div className="space-y-5">
      {/* Built-in agents */}
      <div>
        <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Built-in Agents
        </label>
        <div className="space-y-2 mt-3">
          {["Claude Code", "OpenCode", "Aider", "Gemini CLI", "AMP", "Shell"].map((name) => (
            <div
              key={name}
              className="flex items-center gap-3"
              style={{
                padding: "8px 12px", borderRadius: "var(--vp-radius-lg)",
                border: "1px solid var(--vp-border-subtle)",
                opacity: 0.7,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--vp-text-secondary)" }}>{name}</span>
              <span style={{
                marginLeft: "auto", fontSize: 9, padding: "2px 6px",
                borderRadius: "var(--vp-radius-sm)", background: "var(--vp-bg-surface-hover)",
                color: "var(--vp-text-dim)",
              }}>
                built-in
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* User agents */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Custom Agents
          </label>
          <button
            onClick={() => {
              setShowNewAgent(true);
              setNewAgent({ label: "", cmd: "", color: "#60a5fa", args: [], flags: [], type: "", logoEmoji: "" });
            }}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: "var(--vp-radius-md)",
              background: "transparent", border: "1px solid var(--vp-border-light)",
              color: "var(--vp-accent-blue)", cursor: "pointer", fontSize: 11,
            }}
          >
            <Plus size={12} /> Add Agent
          </button>
        </div>

        {/* New agent form */}
        {showNewAgent && (
          <div style={{
            border: "1px solid var(--vp-accent-blue)", borderRadius: "var(--vp-radius-2xl)",
            padding: 16, marginBottom: 10, background: "var(--vp-accent-blue-bg)",
          }}>
            <div className="space-y-3">
              <div>
                <label style={fieldLabelStyle}>Name</label>
                <input
                  value={newAgent.label || ""}
                  onChange={(e) => setNewAgent({ ...newAgent, label: e.target.value })}
                  placeholder="My Agent"
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>Command</label>
                <input
                  value={newAgent.cmd || ""}
                  onChange={(e) => setNewAgent({ ...newAgent, cmd: e.target.value })}
                  placeholder="myagent"
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>Color</label>
                <div className="flex items-center gap-2 mt-1">
                  {AGENT_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewAgent({ ...newAgent, color: c })}
                      style={{
                        width: 22, height: 22, borderRadius: "var(--vp-radius-md)", background: c,
                        border: newAgent.color === c ? "2px solid var(--vp-text-primary)" : "2px solid transparent",
                        cursor: "pointer", transition: "all 0.15s",
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => {
                    if (!newAgent.label?.trim() || !newAgent.cmd?.trim()) return;
                    const id = `agent-${Date.now()}`;
                    const type = newAgent.cmd!.trim().toLowerCase().replace(/\s+/g, "-");
                    addUserAgent({
                      id, label: newAgent.label!, cmd: newAgent.cmd!, type,
                      args: newAgent.args || [], color: newAgent.color || "#60a5fa",
                      logoEmoji: newAgent.logoEmoji || "", flags: newAgent.flags || [],
                    });
                    setShowNewAgent(false);
                  }}
                  style={{
                    padding: "6px 16px", borderRadius: "var(--vp-radius-lg)",
                    background: "var(--vp-accent-blue)", border: "none",
                    color: "var(--vp-button-primary-bg)", fontSize: 12, cursor: "pointer", fontWeight: 500,
                  }}
                >
                  Add Agent
                </button>
                <button
                  onClick={() => setShowNewAgent(false)}
                  style={{
                    padding: "6px 16px", borderRadius: "var(--vp-radius-lg)",
                    background: "transparent", border: "1px solid var(--vp-border-light)",
                    color: "var(--vp-text-dim)", fontSize: 12, cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {userAgents.length === 0 && !showNewAgent && (
          <div style={{ color: "var(--vp-text-dim)", fontSize: 12, textAlign: "center", padding: "16px 0" }}>
            No custom agents yet
          </div>
        )}

        {userAgents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center justify-between"
            style={{
              padding: "10px 14px", borderRadius: "var(--vp-radius-xl)", marginBottom: 6,
              border: "1px solid var(--vp-border-subtle)",
            }}
          >
            <div className="flex items-center gap-3">
              <div style={{ width: 24, height: 24, borderRadius: "var(--vp-radius-md)", background: agent.color }} />
              <div>
                <div style={{ fontSize: 12, color: "var(--vp-text-primary)", fontWeight: 500 }}>{agent.label}</div>
                <div style={{ fontSize: 10, color: "var(--vp-text-dim)", fontFamily: "monospace" }}>{agent.cmd}</div>
              </div>
            </div>
            <button onClick={() => removeUserAgent(agent.id)} style={iconBtnStyle}>
              <Trash2 size={13} style={{ color: "var(--vp-accent-red)" }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  /* ── Workspaces Tab ── */
  const renderWorkspacesTab = () => {
    const currentWorkspaces = useUIStore.getState().workspaces;

    return (
      <div className="space-y-5">
        <div>
          <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Current Workspaces
          </label>
          <p style={{ fontSize: 11, color: "var(--vp-text-dim)", marginTop: 4 }}>
            Save your current workspace layout to restore it in future sessions.
          </p>
          <button
            onClick={() => {
              saveWorkspaces(
                currentWorkspaces.map((ws) => ({
                  id: ws.id, name: ws.name, color: ws.color,
                }))
              );
            }}
            style={{
              marginTop: 10, padding: "8px 16px", borderRadius: "var(--vp-radius-lg)",
              background: "var(--vp-accent-blue)", border: "none",
              color: "var(--vp-button-primary-bg)", fontSize: 12, cursor: "pointer", fontWeight: 500,
            }}
          >
            Save Current Workspaces ({currentWorkspaces.length})
          </button>
        </div>

        <div>
          <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Saved Workspaces
          </label>

          {savedWorkspaces.length === 0 && (
            <div style={{ color: "var(--vp-text-dim)", fontSize: 12, textAlign: "center", padding: "16px 0" }}>
              No saved workspaces
            </div>
          )}

          <div className="space-y-2 mt-3">
            {savedWorkspaces.map((ws) => (
              <div
                key={ws.id}
                className="flex items-center justify-between"
                style={{
                  padding: "8px 12px", borderRadius: "var(--vp-radius-lg)",
                  border: "1px solid var(--vp-border-subtle)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: ws.color }} />
                  <span style={{ fontSize: 12, color: "var(--vp-text-primary)" }}>{ws.name}</span>
                </div>
              </div>
            ))}
          </div>

          {savedWorkspaces.length > 0 && (
            <button
              onClick={() => saveWorkspaces([])}
              style={{
                marginTop: 10, padding: "6px 12px", borderRadius: "var(--vp-radius-md)",
                background: "transparent", border: "1px solid var(--vp-border-light)",
                color: "var(--vp-accent-red)", fontSize: 11, cursor: "pointer",
              }}
            >
              Clear Saved
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "var(--vp-bg-overlay)",
        backdropFilter: "blur(4px)",
        animation: "fadeIn 0.2s ease",
      }}
      onClick={close}
    >
      <div
        className="shadow-2xl flex"
        style={{
          width: 640,
          height: 520,
          background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-panel)",
          borderRadius: "var(--vp-radius-4xl)",
          animation: "scaleIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left sidebar */}
        <div style={{
          width: 160, borderRight: "1px solid var(--vp-border-light)",
          padding: "16px 0", display: "flex", flexDirection: "column",
        }}>
          <h2 style={{
            color: "var(--vp-text-primary)", fontSize: 14, fontWeight: 600,
            padding: "0 16px", marginBottom: 16,
          }}>
            Settings
          </h2>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2.5"
                style={{
                  width: "100%", padding: "8px 16px",
                  background: isActive ? "var(--vp-bg-surface-hover)" : "transparent",
                  border: "none", borderLeft: isActive ? "2px solid var(--vp-accent-blue)" : "2px solid transparent",
                  cursor: "pointer", transition: "all 0.15s", textAlign: "left",
                }}
              >
                <Icon size={14} style={{ color: isActive ? "var(--vp-accent-blue)" : "var(--vp-text-dim)" }} />
                <span style={{
                  fontSize: 12, fontWeight: isActive ? 500 : 400,
                  color: isActive ? "var(--vp-text-primary)" : "var(--vp-text-muted)",
                }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div className="flex items-center justify-between" style={{
            padding: "12px 20px",
            borderBottom: "1px solid var(--vp-border-subtle)",
          }}>
            <h3 style={{ color: "var(--vp-text-primary)", fontSize: 13, fontWeight: 500 }}>
              {TABS.find((t) => t.id === activeTab)?.label}
            </h3>
            <button
              onClick={close}
              style={{
                color: "var(--vp-text-faint)", padding: 4, borderRadius: "var(--vp-radius-md)",
                background: "transparent", border: "none", cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--vp-text-primary)"; e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--vp-text-faint)"; e.currentTarget.style.background = "transparent"; }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
            {activeTab === "general" && renderGeneralTab()}
            {activeTab === "shortcuts" && renderShortcutsTab()}
            {activeTab === "themes" && renderThemesTab()}
            {activeTab === "agents" && renderAgentsTab()}
            {activeTab === "workspaces" && renderWorkspacesTab()}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  padding: 4, borderRadius: "var(--vp-radius-md)", background: "transparent",
  border: "none", cursor: "pointer", display: "flex",
  alignItems: "center", transition: "all 0.15s",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "var(--vp-text-dim)",
  marginBottom: 4, fontWeight: 500,
};

const fieldInputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", borderRadius: "var(--vp-radius-lg)",
  background: "var(--vp-input-bg)", border: "1px solid var(--vp-input-border)",
  color: "var(--vp-text-primary)", fontSize: 12, outline: "none",
  fontFamily: "inherit",
};
