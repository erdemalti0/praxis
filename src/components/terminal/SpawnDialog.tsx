import { useState, useEffect, useMemo } from "react";
import { X, Code, ChevronLeft, Search, Star, Plus, Trash2 } from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { splitPane, fillEmptyLeaf, hasEmptyLeaf, rebalanceLayout } from "../../lib/layout/layoutUtils";
import type { LayoutNode } from "../../types/layout";
import { invoke } from "../../lib/ipc";
import { getOrCreateTerminal, cleanupTerminal } from "../../lib/terminal/terminalCache";
import { setupPtyConnection } from "../../lib/terminal/ptyConnection";
import { getDefaultShell } from "../../lib/platform";
import { useToastStore } from "../../stores/toastStore";
import { getBaseName } from "../../lib/pathUtils";

import claudeLogo from "../../assets/logos/claude.png";
import opencodeLogo from "../../assets/logos/opencode.svg";
import codexLogo from "../../assets/logos/codex.svg";
import geminiLogo from "../../assets/logos/gemini.svg";
import ampLogo from "../../assets/logos/amp.svg";
import shellLogo from "../../assets/logos/terminal_svg.svg";

/* ───────── Flag types ───────── */

import type { FlagOption } from "../../types/flags";

interface AgentPreset {
  label: string;
  description: string;
  cmd: string;
  args: string[];
  type: string;
  flags: FlagOption[];
  logo?: string;          // path to image
  lucideIcon?: "terminal" | "code";
}

/* ───────── Presets ───────── */

const AGENT_PRESETS: AgentPreset[] = [
  {
    label: "Shell",
    description: "Default system shell",
    cmd: "__default_shell__",
    args: [],
    type: "shell",
    flags: [],
    logo: shellLogo,
  },
  {
    label: "Claude Code",
    description: "Anthropic AI coding assistant",
    cmd: "claude",
    args: [],
    type: "claude-code",
    logo: claudeLogo,
    flags: [
      { flag: "--dangerously-skip-permissions", label: "Skip Permissions", description: "Bypass all permission checks (sandboxes only)" },
      { flag: "--model", label: "Model", description: "Model for the session", hasValue: true, placeholder: "sonnet" },
      { flag: "--permission-mode", label: "Permission Mode", description: "Permission mode for the session", hasValue: true, placeholder: "plan" },
      { flag: "--continue", label: "Continue", description: "Continue the most recent conversation" },
      { flag: "--resume", label: "Resume", description: "Resume conversation by session ID", hasValue: true, placeholder: "session-id" },
      { flag: "--print", label: "Print", description: "Print response and exit (non-interactive)" },
      { flag: "--allowedTools", label: "Allowed Tools", description: "Tools to allow without confirmation", hasValue: true, placeholder: "Read,Write,Bash" },
      { flag: "--disallowedTools", label: "Disallowed Tools", description: "Tools to deny", hasValue: true, placeholder: "WebFetch" },
      { flag: "--system-prompt", label: "System Prompt", description: "Override system prompt entirely", hasValue: true, placeholder: "You are a code reviewer" },
      { flag: "--append-system-prompt", label: "Append System Prompt", description: "Append text to default system prompt", hasValue: true, placeholder: "Focus on security" },
      { flag: "--effort", label: "Effort", description: "Set effort level", hasValue: true, placeholder: "high" },
      { flag: "--verbose", label: "Verbose", description: "Enable verbose logging output" },
    ],
  },
  {
    label: "OpenCode",
    description: "Terminal-based code editor",
    cmd: "opencode",
    args: [],
    type: "opencode",
    logo: opencodeLogo,
    flags: [
      { flag: "--model", label: "Model", description: "Model to use (provider/model format)", hasValue: true, placeholder: "anthropic/claude-sonnet" },
      { flag: "--continue", label: "Continue", description: "Continue last session" },
      { flag: "--session", label: "Session", description: "Continue specific session by ID", hasValue: true, placeholder: "session-id" },
      { flag: "--fork", label: "Fork", description: "Fork session when continuing" },
      { flag: "--agent", label: "Agent", description: "Agent to use", hasValue: true, placeholder: "coder" },
      { flag: "--prompt", label: "Prompt", description: "Initial prompt to send", hasValue: true, placeholder: "Fix the failing test" },
      { flag: "--print-logs", label: "Print Logs", description: "Print logs to stderr" },
      { flag: "--log-level", label: "Log Level", description: "Log verbosity level", hasValue: true, placeholder: "DEBUG" },
      { flag: "--port", label: "Port", description: "Port to listen on", hasValue: true, placeholder: "4096" },
    ],
  },
  {
    label: "Codex",
    description: "OpenAI coding agent in terminal",
    cmd: "codex",
    args: [],
    type: "codex",
    logo: codexLogo,
    flags: [
      { flag: "--model", label: "Model", description: "Override the model to use", hasValue: true, placeholder: "gpt-5.1-codex-max" },
      { flag: "--approval-policy", label: "Approval Policy", description: "When to pause for human approval", hasValue: true, placeholder: "on-request" },
      { flag: "--full-auto", label: "Full Auto", description: "Run most commands without prompts" },
      { flag: "--sandbox", label: "Sandbox", description: "Sandbox policy for shell commands", hasValue: true, placeholder: "default" },
      { flag: "--cd", label: "Working Dir", description: "Set working directory for the agent", hasValue: true, placeholder: "/path/to/project" },
      { flag: "--image", label: "Image", description: "Attach image files to initial prompt", hasValue: true, placeholder: "screenshot.png" },
      { flag: "--search", label: "Web Search", description: "Enable live web search" },
      { flag: "--oss", label: "OSS Mode", description: "Use local open source model provider (Ollama)" },
      { flag: "--profile", label: "Profile", description: "Configuration profile to load", hasValue: true, placeholder: "default" },
      { flag: "--add-dir", label: "Add Directory", description: "Grant additional directories write access", hasValue: true, placeholder: "/extra/path" },
      { flag: "--no-alternate-screen", label: "No Alt Screen", description: "Disable alternate screen mode for TUI" },
    ],
  },
  {
    label: "Gemini CLI",
    description: "Google AI coding assistant",
    cmd: "gemini",
    args: [],
    type: "gemini",
    logo: geminiLogo,
    flags: [
      { flag: "--model", label: "Model", description: "Model to use", hasValue: true, placeholder: "gemini-2.5-pro" },
      { flag: "--yolo", label: "YOLO", description: "Auto-accept all tool actions" },
      { flag: "--sandbox", label: "Sandbox", description: "Run in sandbox mode" },
      { flag: "--debug", label: "Debug", description: "Enable debug output (F12 for console)" },
      { flag: "--approval-mode", label: "Approval Mode", description: "Approval mode for actions", hasValue: true, placeholder: "auto_edit" },
      { flag: "--resume", label: "Resume", description: "Resume a previous session", hasValue: true, placeholder: "latest" },
      { flag: "--allowed-tools", label: "Allowed Tools", description: "Tools allowed without confirmation", hasValue: true, placeholder: "edit,shell" },
      { flag: "--extensions", label: "Extensions", description: "Extensions to use (default: all)", hasValue: true, placeholder: "ext-name" },
      { flag: "--output-format", label: "Output Format", description: "CLI output format", hasValue: true, placeholder: "json" },
      { flag: "--screen-reader", label: "Screen Reader", description: "Enable accessibility mode" },
    ],
  },
  {
    label: "AMP",
    description: "Sourcegraph AI dev agent",
    cmd: "amp",
    args: [],
    type: "amp",
    logo: ampLogo,
    flags: [
      { flag: "--mode", label: "Mode", description: "Agent mode", hasValue: true, placeholder: "smart" },
      { flag: "--dangerously-allow-all", label: "Allow All", description: "Disable all command confirmation prompts" },
      { flag: "--visibility", label: "Visibility", description: "Thread visibility level", hasValue: true, placeholder: "private" },
      { flag: "--notifications", label: "Notifications", description: "Enable sound notifications" },
      { flag: "--no-notifications", label: "No Notifications", description: "Disable sound notifications" },
      { flag: "--mcp-config", label: "MCP Config", description: "JSON config or file path for MCP servers", hasValue: true, placeholder: "./mcp.json" },
      { flag: "--log-level", label: "Log Level", description: "Set log level", hasValue: true, placeholder: "debug" },
      { flag: "--execute", label: "Execute", description: "Execute mode (non-interactive)", hasValue: true, placeholder: "Fix the build" },
    ],
  },
];

/* ───────── Add Custom Flag Row ───────── */

function AddCustomFlagRow({ onAdd }: { onAdd: (flag: FlagOption) => void }) {
  const [open, setOpen] = useState(false);
  const [flagStr, setFlagStr] = useState("");
  const [label, setLabel] = useState("");
  const [hasValue, setHasValue] = useState(false);

  const submit = () => {
    const trimmed = flagStr.trim();
    if (!trimmed) return;
    onAdd({
      flag: trimmed.startsWith("-") ? trimmed : `--${trimmed}`,
      label: label.trim() || trimmed,
      description: "Custom flag",
      hasValue,
      isCustom: true,
    });
    setFlagStr("");
    setLabel("");
    setHasValue(false);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs"
        style={{
          color: "var(--vp-text-dim)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "6px 0",
          transition: "color 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-text-primary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-dim)")}
      >
        <Plus size={12} /> Add custom flag
      </button>
    );
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--vp-input-bg)",
    border: "1px solid var(--vp-input-border)",
    borderRadius: "var(--vp-radius-md)",
    color: "var(--vp-text-primary)",
    padding: "5px 8px",
    outline: "none",
    fontFamily: "monospace",
    fontSize: 11,
    transition: "border-color 0.2s ease",
    width: "100%",
  };

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        type="text"
        placeholder="--my-flag"
        value={flagStr}
        onChange={(e) => setFlagStr(e.target.value)}
        style={inputStyle}
        autoFocus
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <input
        type="text"
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={inputStyle}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      <label
        style={{
          fontSize: 11,
          color: "var(--vp-text-dim)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={hasValue}
          onChange={(e) => setHasValue(e.target.checked)}
          style={{ accentColor: "var(--vp-accent-blue)" }}
        />
        Accepts a value
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={submit}
          style={{
            fontSize: 11,
            padding: "4px 12px",
            background: "var(--vp-button-primary-bg)",
            color: "var(--vp-button-primary-text)",
            border: "none",
            borderRadius: "var(--vp-radius-md)",
            cursor: "pointer",
          }}
        >
          Add
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setFlagStr("");
            setLabel("");
            setHasValue(false);
          }}
          style={{
            fontSize: 11,
            padding: "4px 12px",
            background: "transparent",
            color: "var(--vp-text-dim)",
            border: "1px solid var(--vp-border-subtle)",
            borderRadius: "var(--vp-radius-md)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ───────── Component ───────── */

export default function SpawnDialog() {
  const show = useUIStore((s) => s.showSpawnDialog);
  const setShow = useUIStore((s) => s.setShowSpawnDialog);
  const addSession = useTerminalStore((s) => s.addSession);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const setSplitSpawnContext = useUIStore((s) => s.setSplitSpawnContext);
  const selectedProject = useUIStore((s) => s.selectedProject);

  const userAgents = useSettingsStore((s) => s.userAgents);
  const recentSpawns = useSettingsStore((s) => s.recentSpawns);
  const addRecentSpawn = useSettingsStore((s) => s.addRecentSpawn);
  const flagFavorites = useSettingsStore((s) => s.flagFavorites);
  const toggleFlagFavorite = useSettingsStore((s) => s.toggleFlagFavorite);
  const customFlags = useSettingsStore((s) => s.customFlags);
  const addCustomFlag = useSettingsStore((s) => s.addCustomFlag);
  const removeCustomFlag = useSettingsStore((s) => s.removeCustomFlag);

  const allPresets = useMemo(() => {
    const userPresets: AgentPreset[] = userAgents.map((ua) => ({
      label: ua.label,
      description: (ua as any).description || "Custom agent",
      cmd: ua.cmd,
      args: ua.args || [],
      type: ua.type,
      flags: ua.flags || [],
      logo: undefined,
      lucideIcon: ua.logoEmoji ? undefined : ("code" as const),
      _emoji: ua.logoEmoji,
    }));
    return [...AGENT_PRESETS, ...userPresets];
  }, [userAgents]);

  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [cwd, setCwd] = useState(selectedProject?.path ?? "~");
  const [enabledFlags, setEnabledFlags] = useState<Record<string, boolean>>({});
  const [flagValues, setFlagValues] = useState<Record<string, string>>({});
  const [extraArgs, setExtraArgs] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [agentSearchQuery, setAgentSearchQuery] = useState("");

  // Select a preset and optionally pre-populate flags from recent spawn
  const selectPreset = (index: number, savedFlags?: Record<string, string | boolean>) => {
    setSelectedPreset(index);
    if (savedFlags && Object.keys(savedFlags).length > 0) {
      const enabled: Record<string, boolean> = {};
      const values: Record<string, string> = {};
      for (const [flag, value] of Object.entries(savedFlags)) {
        enabled[flag] = true;
        if (typeof value === "string") values[flag] = value;
      }
      setEnabledFlags(enabled);
      setFlagValues(values);
    } else {
      setEnabledFlags({});
      setFlagValues({});
    }
    setExtraArgs("");
    setSearchQuery("");
  };

  // Reset when preset changes via direct setSelectedPreset(null) (back button)
  useEffect(() => {
    if (selectedPreset === null) {
      setEnabledFlags({});
      setFlagValues({});
      setExtraArgs("");
      setSearchQuery("");
    }
  }, [selectedPreset]);

  // Reset stage when dialog opens
  useEffect(() => {
    if (show) {
      setSelectedPreset(null);
      setCwd(selectedProject?.path ?? "~");
      setAgentSearchQuery("");
    }
  }, [show, selectedProject?.path]);

  const preset = selectedPreset !== null ? allPresets[selectedPreset] : null;

  const filteredPresets = useMemo(() => {
    if (!agentSearchQuery.trim()) return allPresets;
    const q = agentSearchQuery.toLowerCase();
    return allPresets.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q)
    );
  }, [allPresets, agentSearchQuery]);

  const mergedFlags = useMemo(() => {
    if (!preset) return [];
    const agentCustomFlags = (customFlags[preset.type] || []).map((f) => ({
      ...f,
      isCustom: true as const,
    }));
    return [...preset.flags, ...agentCustomFlags];
  }, [preset, customFlags]);

  const favSet = useMemo(() => {
    if (!preset) return new Set<string>();
    return new Set(flagFavorites[preset.type] || []);
  }, [preset, flagFavorites]);

  const filteredFlags = useMemo(() => {
    if (!preset) return [];
    let result = mergedFlags;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = mergedFlags.filter(
        (f) =>
          f.label.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q) ||
          f.flag.toLowerCase().includes(q)
      );
    }
    // Sort: favorites first, then original order
    return [...result].sort((a, b) => {
      const aFav = favSet.has(a.flag) ? 0 : 1;
      const bFav = favSet.has(b.flag) ? 0 : 1;
      return aFav - bFav;
    });
  }, [preset, searchQuery, mergedFlags, favSet]);

  if (!show) return null;

  const toggleFlag = (flag: string) => {
    setEnabledFlags((prev) => {
      const next = { ...prev, [flag]: !prev[flag] };
      // Clear value when disabling
      if (!next[flag]) {
        setFlagValues((v) => {
          const nv = { ...v };
          delete nv[flag];
          return nv;
        });
      }
      return next;
    });
  };

  const setFlagValue = (flag: string, value: string) => {
    setFlagValues((prev) => ({ ...prev, [flag]: value }));
  };

  const buildArgs = (): string[] => {
    if (!preset) return [];
    const args = [...preset.args];
    for (const f of mergedFlags) {
      if (enabledFlags[f.flag]) {
        args.push(f.flag);
        if (f.hasValue && flagValues[f.flag]) {
          args.push(flagValues[f.flag]);
        }
      }
    }
    const trimmed = extraArgs.trim();
    if (trimmed) {
      args.push(...trimmed.split(/\s+/));
    }
    return args;
  };

  const handlePostSpawn = (newSessionId: string) => {
    const state = useUIStore.getState();
    const wsId = state.activeWorkspaceId;
    
    if (!wsId) {
      setShow(false);
      return;
    }

    let groupId = state.activeTerminalGroup[wsId];
    const groups = state.terminalGroups[wsId] || [];
    
    if (!groupId || groups.length === 0) {
      groupId = state.addTerminalGroup(wsId);
    }

    const ctx = state.splitSpawnContext;

    if (ctx && groupId) {
      // Split: add new pane to the current layout
      const currentLayout: LayoutNode =
        state.workspaceLayouts[groupId] || { type: "leaf", sessionId: ctx.sessionId };
      const newLayout = rebalanceLayout(
        splitPane(currentLayout, ctx.sessionId, ctx.direction, newSessionId)
      );
      state.setWorkspaceLayout(groupId, newLayout);
      state.setSplitSpawnContext(null);
      state.setFocusedPane(newSessionId);
    } else {
      // No split context: check if current group has an empty leaf we can fill
      const currentLayout = groupId ? state.workspaceLayouts[groupId] : null;

      if (!currentLayout || (currentLayout.type === "leaf" && !currentLayout.sessionId)) {
        // Root is empty — fill it
        state.setWorkspaceLayout(groupId, { type: "leaf", sessionId: newSessionId });
      } else if (currentLayout && hasEmptyLeaf(currentLayout)) {
        // There's an empty leaf somewhere in the split tree — fill it
        const { layout: filled } = fillEmptyLeaf(currentLayout, newSessionId);
        state.setWorkspaceLayout(groupId, filled);
      } else {
        // No empty leaves — create a new terminal group (tab)
        const newGroupId = state.addTerminalGroup(wsId);
        state.setWorkspaceLayout(newGroupId, { type: "leaf", sessionId: newSessionId });
        state.setActiveTerminalGroup(wsId, newGroupId);
      }
      state.setFocusedPane(newSessionId);
    }

    setShow(false);
    if (state.viewMode === "missions") {
      state.setViewMode(state.splitEnabled ? "split" : "terminal");
    }
  };

  const handleSpawn = async () => {
    if (!preset) return;

    // Resolve default shell placeholder
    if (preset.cmd === "__default_shell__") {
      preset.cmd = await getDefaultShell();
    }

    const finalArgs = buildArgs();

    // Generate cryptographically secure session ID before spawning
    const id = crypto.randomUUID();

    try {
      // Step 1: Create xterm instance and wire up PTY listeners with flow control
      // BEFORE spawning the PTY so no output is lost.
      const { terminal } = getOrCreateTerminal(id);
      setupPtyConnection({ sessionId: id, terminal, fallbackCwd: cwd });

      // Step 2: Now spawn the PTY - listeners are already active
      const result = await invoke<{ id: string; cwd: string; pid?: number }>("spawn_pty", {
        id,
        cmd: preset.cmd,
        args: finalArgs,
        cwd,
      });

      // Use the resolved cwd from the backend (expanded ~, validated path)
      const resolvedCwd = result?.cwd || cwd;

      // Step 3: Add session to store and update layout
      addSession({
        id,
        title: `${preset.label}@${getBaseName(resolvedCwd)}`,
        workspaceId: activeWorkspaceId ?? "",
        agentType: preset.type,
        originalAgentType: preset.type,
        projectPath: resolvedCwd,
        pid: result?.pid,
        isActive: true,
      });

      // Save to recent spawns
      const spawnFlags: Record<string, string | boolean> = {};
      for (const f of mergedFlags) {
        if (enabledFlags[f.flag]) {
          spawnFlags[f.flag] = f.hasValue && flagValues[f.flag] ? flagValues[f.flag] : true;
        }
      }
      addRecentSpawn(preset.type, spawnFlags);

      handlePostSpawn(id);
    } catch (err) {
      // Clean up the pre-created xterm instance on failure
      cleanupTerminal(id);
      console.error("Failed to spawn:", err);
      useToastStore.getState().addToast(`Failed to spawn terminal: ${err}`, "error");
    }
  };

  const close = () => {
    setShow(false);
    setSplitSpawnContext(null);
  };

  /* ───────── Render helpers ───────── */

  const renderLogo = (p: AgentPreset & { _emoji?: string }, size: number) => {
    if ((p as any)._emoji) {
      return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>{(p as any)._emoji}</span>;
    }
    if (p.logo) {
      return (
        <img
          src={p.logo}
          alt={p.label}
          style={{ width: size, height: size, objectFit: "contain" }}
          draggable={false}
        />
      );
    }
    if (p.lucideIcon === "code") return <Code size={size} style={{ color: "var(--vp-text-secondary)" }} />;
    return null;
  };

  /* ───────── Agent list item ───────── */

  const renderAgentRow = (
    p: AgentPreset & { _emoji?: string },
    index: number,
    onClick: () => void,
  ) => (
    <button
      key={`${p.type}-${index}`}
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left group"
      style={{
        padding: "10px 12px",
        border: "none",
        background: "transparent",
        borderRadius: "var(--vp-radius-xl)",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--vp-bg-tertiary, rgba(255,255,255,0.04))";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "var(--vp-radius-xl)",
          background: "var(--vp-bg-tertiary, rgba(255,255,255,0.06))",
          border: "1px solid var(--vp-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {renderLogo(p, 20)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--vp-text-primary)", fontWeight: 500 }}>
          {p.label}
        </div>
        <div style={{ fontSize: 11, color: "var(--vp-text-dim)", marginTop: 1 }}>
          {p.description}
        </div>
      </div>
      <ChevronLeft
        size={14}
        className="spawn-row-chevron"
        style={{
          color: "var(--vp-text-faint)",
          transform: "rotate(180deg)",
        }}
      />
    </button>
  );

  /* ───────── Stage 1: CLI Selection ───────── */

  const renderCliSelection = () => {
    // Deduplicate recent spawns by agentType (keep first occurrence)
    const uniqueRecents = recentSpawns.filter(
      (r, i, arr) => arr.findIndex((x) => x.agentType === r.agentType) === i
    );
    const recentTypes = new Set(uniqueRecents.map((r) => r.agentType));
    const hasSearch = agentSearchQuery.trim().length > 0;

    return (
      <div className="flex flex-col" style={{ maxHeight: "70vh" }}>
        {/* Search */}
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--vp-text-faint)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              value={agentSearchQuery}
              onChange={(e) => setAgentSearchQuery(e.target.value)}
              placeholder="Search agents..."
              autoFocus
              className="w-full text-xs"
              style={{
                background: "var(--vp-input-bg)",
                border: "1px solid var(--vp-input-border)",
                borderRadius: "var(--vp-radius-lg)",
                color: "var(--vp-text-primary)",
                padding: "8px 10px 8px 30px",
                outline: "none",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--vp-input-border-focus)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--vp-input-border)")}
            />
          </div>
        </div>

        <div className="overflow-y-auto" style={{ padding: "8px 8px 12px", flex: 1 }}>
          {/* Recent spawns - only show when not searching */}
          {!hasSearch && uniqueRecents.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: "var(--vp-text-faint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 12px 6px" }}>
                Recent
              </div>
              {uniqueRecents.map((recent, i) => {
                const matched = allPresets.find((p) => p.type === recent.agentType);
                if (!matched) return null;
                const presetIndex = allPresets.indexOf(matched);
                return renderAgentRow(matched, i, () => selectPreset(presetIndex, recent.flags));
              })}
            </div>
          )}

          {/* All agents (or filtered) */}
          <div>
            {!hasSearch && uniqueRecents.length > 0 && (
              <div style={{ fontSize: 10, color: "var(--vp-text-faint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", padding: "4px 12px 6px" }}>
                All Agents
              </div>
            )}
            {filteredPresets.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--vp-text-faint)", padding: "20px 12px", textAlign: "center" }}>
                No matching agents
              </div>
            )}
            {filteredPresets.map((p, i) => {
              // Skip agents already shown in Recent (unless searching)
              if (!hasSearch && recentTypes.has(p.type)) return null;
              return renderAgentRow(p, i, () => selectPreset(allPresets.indexOf(p)));
            })}
          </div>
        </div>
      </div>
    );
  };

  /* ───────── Stage 2: Configuration ───────── */

  const renderConfiguration = () => {
    if (!preset) return null;

    return (
      <div className="flex flex-col" style={{ maxHeight: "70vh" }}>
        {/* Header with back button */}
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: "1px solid var(--vp-border-subtle)" }}
        >
          <button
            onClick={() => setSelectedPreset(null)}
            style={{
              color: "var(--vp-text-dim)",
              padding: 4,
              borderRadius: "var(--vp-radius-md)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-text-primary)";
              e.currentTarget.style.background = "var(--vp-border-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-dim)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <ChevronLeft size={16} />
          </button>
          {renderLogo(preset, 22)}
          <span style={{ color: "var(--vp-text-primary)", fontSize: 14, fontWeight: 600 }}>
            {preset.label}
          </span>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto" style={{ flex: 1 }}>
          {/* Options (flags) */}
          {preset.flags.length > 0 && (
            <div>
              <label className="text-xs block mb-2" style={{ color: "var(--vp-text-dim)" }}>
                Options
              </label>

              {/* Search */}
              <div style={{ position: "relative", marginBottom: 8 }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--vp-text-faint)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search options..."
                  className="w-full text-xs"
                  style={{
                    background: "var(--vp-input-bg)",
                    border: "1px solid var(--vp-input-border)",
                    borderRadius: "var(--vp-radius-lg)",
                    color: "var(--vp-text-primary)",
                    padding: "7px 10px 7px 30px",
                    outline: "none",
                    transition: "border-color 0.2s ease",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--vp-input-border-focus)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--vp-input-border)")}
                />
              </div>

              {/* Flag list */}
              <div
                className="space-y-1.5 overflow-y-auto"
                style={{ maxHeight: 220, paddingRight: 2 }}
              >
                {filteredFlags.length === 0 && (
                  <div style={{ fontSize: 11, color: "var(--vp-text-faint)", padding: "8px 0", textAlign: "center" }}>
                    No matching options
                  </div>
                )}
                {filteredFlags.map((f) => {
                  const isOn = !!enabledFlags[f.flag];
                  return (
                    <div key={f.flag}>
                      <button
                        onClick={() => toggleFlag(f.flag)}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-left"
                        style={{
                          border: `1px solid ${isOn ? "var(--vp-accent-blue-glow)" : "var(--vp-border-subtle)"}`,
                          background: isOn ? "var(--vp-accent-blue-bg)" : "transparent",
                          borderRadius: "var(--vp-radius-lg)",
                          transition: "all 0.2s ease",
                          cursor: "pointer",
                        }}
                      >
                        {/* Checkbox */}
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: "var(--vp-radius-sm)",
                            border: `1.5px solid ${isOn ? "var(--vp-accent-blue)" : "var(--vp-text-subtle)"}`,
                            background: isOn ? "var(--vp-accent-blue)" : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.15s ease",
                            flexShrink: 0,
                          }}
                        >
                          {isOn && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path
                                d="M2 5L4.5 7.5L8 3"
                                stroke="#000"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: isOn ? "var(--vp-text-primary)" : "var(--vp-text-secondary)" }}>
                            {f.label}
                            <span style={{ fontSize: 10, color: "var(--vp-text-faint)", marginLeft: 6 }}>
                              {f.flag}
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: "var(--vp-text-faint)", marginTop: 1 }}>
                            {f.description}
                          </div>
                        </div>
                        {/* Star favorite */}
                        <div
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFlagFavorite(preset!.type, f.flag);
                          }}
                          style={{
                            padding: 2,
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            cursor: "pointer",
                          }}
                          title={favSet.has(f.flag) ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Star
                            size={13}
                            fill={favSet.has(f.flag) ? "#f59e0b" : "none"}
                            stroke={favSet.has(f.flag) ? "#f59e0b" : "var(--vp-text-faint)"}
                            style={{ transition: "all 0.15s ease" }}
                          />
                        </div>
                        {/* Delete custom flag */}
                        {f.isCustom && (
                          <div
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCustomFlag(preset!.type, f.flag);
                              setEnabledFlags((prev) => {
                                const next = { ...prev };
                                delete next[f.flag];
                                return next;
                              });
                            }}
                            style={{
                              padding: 2,
                              flexShrink: 0,
                              display: "flex",
                              alignItems: "center",
                              cursor: "pointer",
                            }}
                            title="Delete custom flag"
                          >
                            <Trash2
                              size={13}
                              stroke="var(--vp-text-faint)"
                              style={{ transition: "color 0.15s ease" }}
                            />
                          </div>
                        )}
                      </button>

                      {/* Value input for hasValue flags */}
                      {f.hasValue && isOn && (
                        <div style={{ paddingLeft: 36, paddingTop: 4, paddingBottom: 2 }}>
                          <input
                            type="text"
                            value={flagValues[f.flag] ?? ""}
                            onChange={(e) => setFlagValue(f.flag, e.target.value)}
                            placeholder={f.placeholder ?? "value"}
                            className="w-full text-xs"
                            style={{
                              background: "var(--vp-input-bg)",
                              border: "1px solid var(--vp-input-border)",
                              borderRadius: "var(--vp-radius-md)",
                              color: "var(--vp-text-primary)",
                              padding: "5px 8px",
                              outline: "none",
                              fontFamily: "monospace",
                              fontSize: 11,
                              transition: "border-color 0.2s ease",
                            }}
                            onFocus={(e) => (e.target.style.borderColor = "var(--vp-input-border-focus)")}
                            onBlur={(e) => (e.target.style.borderColor = "var(--vp-input-border)")}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add custom flag */}
              {preset.type !== "shell" && (
                <AddCustomFlagRow onAdd={(flag) => addCustomFlag(preset.type, flag)} />
              )}
            </div>
          )}

          {/* Additional Arguments */}
          {preset.type !== "shell" && (
            <div>
              <label className="text-xs block mb-2" style={{ color: "var(--vp-text-dim)" }}>
                Additional Arguments
              </label>
              <input
                type="text"
                value={extraArgs}
                onChange={(e) => setExtraArgs(e.target.value)}
                className="w-full px-3 py-2.5 text-sm"
                style={{
                  background: "var(--vp-input-bg)",
                  border: "1px solid var(--vp-input-border)",
                  color: "var(--vp-text-primary)",
                  outline: "none",
                  borderRadius: "var(--vp-radius-xl)",
                  transition: "border-color 0.2s ease",
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--vp-input-border-focus)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--vp-input-border)")}
                placeholder="--flag1 --flag2 value"
              />
            </div>
          )}

          {/* Working Directory */}
          <div>
            <label className="text-xs block mb-2" style={{ color: "#787878" }}>
              Working Directory
            </label>
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="w-full px-3 py-2.5 text-sm"
              style={{
                background: "var(--vp-input-bg)",
                border: "1px solid var(--vp-input-border)",
                color: "var(--vp-text-primary)",
                outline: "none",
                borderRadius: "var(--vp-radius-xl)",
                transition: "border-color 0.2s ease",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--vp-input-border-focus)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--vp-input-border)")}
              placeholder="~/projects/my-app"
            />
          </div>

          {/* Launch */}
          <button
            onClick={handleSpawn}
            className="w-full py-2.5 text-sm font-medium"
            style={{
              background: "var(--vp-button-primary-bg)",
              color: "var(--vp-button-primary-text)",
              borderRadius: "var(--vp-radius-xl)",
              border: "none",
              cursor: "pointer",
              transition: "opacity 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            Launch
          </button>
        </div>
      </div>
    );
  };

  /* ───────── Main render ───────── */

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
        className="shadow-2xl"
        style={{
          width: 420,
          background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-panel)",
          borderRadius: "var(--vp-radius-4xl)",
          animation: "scaleIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--vp-border-medium)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--vp-text-primary)" }}>
            New Terminal
          </h2>
          <button
            onClick={close}
            style={{
              color: "var(--vp-text-faint)",
              padding: 4,
              borderRadius: "var(--vp-radius-lg)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-text-primary)";
              e.currentTarget.style.background = "var(--vp-border-subtle)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-faint)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        {selectedPreset === null ? renderCliSelection() : renderConfiguration()}
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
        .spawn-row-chevron {
          opacity: 0;
          transition: opacity 0.15s ease;
        }
        .group:hover .spawn-row-chevron {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
