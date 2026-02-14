import { useState, useCallback } from "react";
import { X, Palette, Bot, Layout, Plus, Trash2, Edit3, Check } from "lucide-react";
import { useSettingsStore, type UserAgent } from "../../stores/settingsStore";
import { BUILTIN_THEMES, createDefaultThemeColors, type ThemeDefinition, type ThemeColors } from "../../lib/themes";
import { useUIStore } from "../../stores/uiStore";

type SettingsTab = "themes" | "agents" | "workspaces";

const TABS: { id: SettingsTab; label: string; icon: typeof Palette }[] = [
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

  const activeThemeId = useSettingsStore((s) => s.activeThemeId);
  const customThemes = useSettingsStore((s) => s.customThemes);
  const setActiveTheme = useSettingsStore((s) => s.setActiveTheme);
  const addCustomTheme = useSettingsStore((s) => s.addCustomTheme);
  const removeCustomTheme = useSettingsStore((s) => s.removeCustomTheme);
  const updateCustomTheme = useSettingsStore((s) => s.updateCustomTheme);

  const userAgents = useSettingsStore((s) => s.userAgents);
  const addUserAgent = useSettingsStore((s) => s.addUserAgent);
  const removeUserAgent = useSettingsStore((s) => s.removeUserAgent);
  const updateUserAgent = useSettingsStore((s) => s.updateUserAgent);

  const savedWorkspaces = useSettingsStore((s) => s.savedWorkspaces);
  const saveWorkspaces = useSettingsStore((s) => s.saveWorkspaces);

  const [activeTab, setActiveTab] = useState<SettingsTab>("themes");
  const [editingTheme, setEditingTheme] = useState<ThemeDefinition | null>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [newAgent, setNewAgent] = useState<Partial<UserAgent>>({ label: "", cmd: "", color: "#60a5fa", args: [], flags: [] });

  const close = useCallback(() => setShow(false), [setShow]);

  if (!show) return null;

  /* ── Theme Tab ── */
  const renderThemesTab = () => (
    <div className="space-y-5">
      {/* Built-in themes */}
      <div>
        <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Built-in Themes
        </label>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {BUILTIN_THEMES.map((theme) => {
            const isActive = activeThemeId === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => setActiveTheme(theme.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: "14px 12px",
                  border: `2px solid ${isActive ? "var(--vp-accent-blue)" : "var(--vp-border-subtle)"}`,
                  borderRadius: 12,
                  background: isActive ? "var(--vp-accent-blue-bg)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {/* Preview swatch */}
                <div style={{
                  width: "100%", height: 36, borderRadius: 8,
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
            );
          })}
        </div>
      </div>

      {/* Custom themes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label style={{ color: "var(--vp-text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Custom Themes
          </label>
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
              padding: "4px 10px", borderRadius: 6,
              background: "transparent", border: "1px solid var(--vp-border-light)",
              color: "var(--vp-accent-blue)", cursor: "pointer", fontSize: 11,
              transition: "all 0.15s",
            }}
          >
            <Plus size={12} /> New Theme
          </button>
        </div>

        {customThemes.length === 0 && !editingTheme && (
          <div style={{ color: "var(--vp-text-dim)", fontSize: 12, textAlign: "center", padding: "16px 0" }}>
            No custom themes yet
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
                padding: "10px 14px", borderRadius: 10, marginBottom: 6,
                border: `1px solid ${isActive ? "var(--vp-accent-blue)" : "var(--vp-border-subtle)"}`,
                background: isActive ? "var(--vp-accent-blue-bg)" : "transparent",
              }}
            >
              <div className="flex items-center gap-3">
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: theme.colors.bgPrimary,
                  border: `1px solid ${theme.colors.borderLight}`,
                }} />
                <span style={{ fontSize: 12, color: "var(--vp-text-primary)", fontWeight: isActive ? 500 : 400 }}>
                  {theme.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
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
    </div>
  );

  const renderThemeEditor = (theme: ThemeDefinition) => (
    <div
      key={theme.id}
      style={{
        border: "1px solid var(--vp-accent-blue)",
        borderRadius: 12, padding: 16, marginBottom: 8,
        background: "var(--vp-accent-blue-bg)",
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <input
          value={theme.name}
          onChange={(e) => {
            const updated = { ...theme, name: e.target.value };
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
            borderRadius: 6, padding: "4px 8px", color: "var(--vp-text-primary)",
            fontSize: 13, fontWeight: 500, outline: "none", width: 180,
          }}
        />
        <button
          onClick={() => {
            setEditingTheme(null);
            useSettingsStore.getState().saveSettings();
          }}
          style={{
            padding: "4px 12px", borderRadius: 6,
            background: "var(--vp-accent-blue)", border: "none",
            color: "var(--vp-button-primary-bg)", fontSize: 11, cursor: "pointer", fontWeight: 500,
          }}
        >
          Done
        </button>
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
                    style={{ width: 24, height: 24, borderRadius: 4, border: "none", cursor: "pointer", padding: 0 }}
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
                padding: "8px 12px", borderRadius: 8,
                border: "1px solid var(--vp-border-subtle)",
                opacity: 0.7,
              }}
            >
              <span style={{ fontSize: 12, color: "var(--vp-text-secondary)" }}>{name}</span>
              <span style={{
                marginLeft: "auto", fontSize: 9, padding: "2px 6px",
                borderRadius: 4, background: "var(--vp-bg-surface-hover)",
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
              padding: "4px 10px", borderRadius: 6,
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
            border: "1px solid var(--vp-accent-blue)", borderRadius: 12,
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
                        width: 22, height: 22, borderRadius: 6, background: c,
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
                    padding: "6px 16px", borderRadius: 8,
                    background: "var(--vp-accent-blue)", border: "none",
                    color: "var(--vp-button-primary-bg)", fontSize: 12, cursor: "pointer", fontWeight: 500,
                  }}
                >
                  Add Agent
                </button>
                <button
                  onClick={() => setShowNewAgent(false)}
                  style={{
                    padding: "6px 16px", borderRadius: 8,
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
              padding: "10px 14px", borderRadius: 10, marginBottom: 6,
              border: "1px solid var(--vp-border-subtle)",
            }}
          >
            <div className="flex items-center gap-3">
              <div style={{ width: 24, height: 24, borderRadius: 6, background: agent.color }} />
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
                  useWidgetMode: ws.useWidgetMode,
                }))
              );
            }}
            style={{
              marginTop: 10, padding: "8px 16px", borderRadius: 8,
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
                  padding: "8px 12px", borderRadius: 8,
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
                marginTop: 10, padding: "6px 12px", borderRadius: 6,
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
          borderRadius: 16,
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
                color: "var(--vp-text-faint)", padding: 4, borderRadius: 6,
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
      `}</style>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  padding: 4, borderRadius: 6, background: "transparent",
  border: "none", cursor: "pointer", display: "flex",
  alignItems: "center", transition: "all 0.15s",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: "var(--vp-text-dim)",
  marginBottom: 4, fontWeight: 500,
};

const fieldInputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 10px", borderRadius: 8,
  background: "var(--vp-input-bg)", border: "1px solid var(--vp-input-border)",
  color: "var(--vp-text-primary)", fontSize: 12, outline: "none",
  fontFamily: "inherit",
};
