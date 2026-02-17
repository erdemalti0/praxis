import { useState, useEffect, useMemo } from "react";
import { X, Code, ChevronLeft, Search } from "lucide-react";
import { useUIStore } from "../../stores/uiStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { splitPane, fillEmptyLeaf, hasEmptyLeaf } from "../../lib/layout/layoutUtils";
import type { LayoutNode } from "../../types/layout";
import { invoke } from "../../lib/ipc";
import { getOrCreateTerminal, cleanupTerminal } from "../../lib/terminal/terminalCache";
import { setupPtyConnection } from "../../lib/terminal/ptyConnection";
import { getDefaultShell } from "../../lib/platform";

import claudeLogo from "../../assets/logos/claude.png";
import opencodeLogo from "../../assets/logos/opencode.svg";
import geminiLogo from "../../assets/logos/gemini.svg";
import ampLogo from "../../assets/logos/amp.svg";
import shellLogo from "../../assets/logos/terminal_svg.svg";

/* ───────── Flag types ───────── */

interface FlagOption {
  flag: string;
  label: string;
  description: string;
  hasValue?: boolean;
  placeholder?: string;
}

interface AgentPreset {
  label: string;
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
    cmd: "__default_shell__",
    args: [],
    type: "shell",
    flags: [],
    logo: shellLogo,
  },
  {
    label: "Claude Code",
    cmd: "claude",
    args: [],
    type: "claude-code",
    logo: claudeLogo,
    flags: [
      { flag: "--dangerously-skip-permissions", label: "Skip Permissions", description: "Bypass all permission checks" },
      { flag: "--verbose", label: "Verbose", description: "Enable verbose output" },
      { flag: "--debug", label: "Debug", description: "Enable debug mode" },
      { flag: "--model", label: "Model", description: "Model for the session", hasValue: true, placeholder: "claude-sonnet-4-5-20250929" },
      { flag: "--continue", label: "Continue", description: "Continue most recent conversation" },
      { flag: "--permission-mode", label: "Permission Mode", description: "Permission mode (acceptEdits, plan, etc.)", hasValue: true, placeholder: "acceptEdits" },
      { flag: "--allowedTools", label: "Allowed Tools", description: "Comma-separated list of allowed tools", hasValue: true, placeholder: "Read,Write,Bash" },
      { flag: "--system-prompt", label: "System Prompt", description: "Custom system prompt", hasValue: true, placeholder: "You are a helpful assistant" },
      { flag: "--append-system-prompt", label: "Append System Prompt", description: "Append to system prompt", hasValue: true, placeholder: "Additional instructions..." },
      { flag: "--print", label: "Print", description: "Print response and exit (pipe mode)" },
      { flag: "--no-chrome", label: "No Chrome", description: "Disable Chrome integration" },
    ],
  },
  {
    label: "OpenCode",
    cmd: "opencode",
    args: [],
    type: "opencode",
    logo: opencodeLogo,
    flags: [
      { flag: "--print-logs", label: "Print Logs", description: "Print logs to stderr" },
      { flag: "--log-level", label: "Log Level", description: "Log level (DEBUG, INFO, WARN, ERROR)", hasValue: true, placeholder: "DEBUG" },
      { flag: "--model", label: "Model", description: "Model to use (provider/model format)", hasValue: true, placeholder: "anthropic/claude-sonnet" },
      { flag: "--continue", label: "Continue", description: "Continue last session" },
      { flag: "--fork", label: "Fork", description: "Fork session when continuing" },
      { flag: "--agent", label: "Agent", description: "Agent to use", hasValue: true, placeholder: "coder" },
      { flag: "--prompt", label: "Prompt", description: "Prompt to use", hasValue: true, placeholder: "Fix the bug in..." },
    ],
  },
  {
    label: "Aider",
    cmd: "aider",
    args: [],
    type: "aider",
    lucideIcon: "code",
    flags: [
      { flag: "--no-auto-commits", label: "No Auto Commits", description: "Disable automatic git commits" },
      { flag: "--no-git", label: "No Git", description: "Disable git integration" },
      { flag: "--yes-always", label: "Yes Always", description: "Always say yes to confirmations" },
      { flag: "--dark-mode", label: "Dark Mode", description: "Dark terminal colors" },
      { flag: "--model", label: "Model", description: "LLM model to use", hasValue: true, placeholder: "gpt-4" },
      { flag: "--stream", label: "Stream", description: "Enable streaming" },
      { flag: "--no-stream", label: "No Stream", description: "Disable streaming" },
      { flag: "--vim", label: "Vim", description: "VI editing mode" },
      { flag: "--auto-lint", label: "Auto Lint", description: "Enable auto linting" },
      { flag: "--no-auto-lint", label: "No Auto Lint", description: "Disable auto linting" },
      { flag: "--auto-test", label: "Auto Test", description: "Enable auto testing" },
      { flag: "--no-auto-test", label: "No Auto Test", description: "Disable auto testing" },
      { flag: "--dry-run", label: "Dry Run", description: "Preview without modifying" },
      { flag: "--architect", label: "Architect", description: "Architect edit format" },
      { flag: "--show-diffs", label: "Show Diffs", description: "Show diffs on commit" },
    ],
  },
  {
    label: "Gemini CLI",
    cmd: "gemini",
    args: [],
    type: "gemini",
    logo: geminiLogo,
    flags: [
      { flag: "--debug", label: "Debug", description: "Debug mode" },
      { flag: "--model", label: "Model", description: "Model to use", hasValue: true, placeholder: "gemini-2.5-pro" },
      { flag: "--sandbox", label: "Sandbox", description: "Run in sandbox" },
      { flag: "--yolo", label: "YOLO", description: "Auto-accept all actions" },
      { flag: "--approval-mode", label: "Approval Mode", description: "Approval mode (default, auto_edit, yolo, plan)", hasValue: true, placeholder: "auto_edit" },
      { flag: "--resume", label: "Resume", description: "Resume previous session", hasValue: true, placeholder: "session-id" },
      { flag: "--allowed-tools", label: "Allowed Tools", description: "Tools allowed without confirmation", hasValue: true, placeholder: "Edit,Shell" },
      { flag: "--screen-reader", label: "Screen Reader", description: "Accessibility mode" },
    ],
  },
  {
    label: "AMP",
    cmd: "amp",
    args: [],
    type: "amp",
    logo: ampLogo,
    flags: [
      { flag: "--notifications", label: "Notifications", description: "Enable sound notifications" },
      { flag: "--no-notifications", label: "No Notifications", description: "Disable sound notifications" },
      { flag: "--visibility", label: "Visibility", description: "Thread visibility (private, public, workspace)", hasValue: true, placeholder: "private" },
    ],
  },
];

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

  const allPresets = useMemo(() => {
    const userPresets: AgentPreset[] = userAgents.map((ua) => ({
      label: ua.label,
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

  // Reset when dialog opens or preset changes
  useEffect(() => {
    setEnabledFlags({});
    setFlagValues({});
    setExtraArgs("");
    setSearchQuery("");
  }, [selectedPreset]);

  // Reset stage when dialog opens
  useEffect(() => {
    if (show) {
      setSelectedPreset(null);
      setCwd(selectedProject?.path ?? "~");
    }
  }, [show, selectedProject?.path]);

  const preset = selectedPreset !== null ? allPresets[selectedPreset] : null;

  const filteredFlags = useMemo(() => {
    if (!preset) return [];
    if (!searchQuery.trim()) return preset.flags;
    const q = searchQuery.toLowerCase();
    return preset.flags.filter(
      (f) =>
        f.label.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.flag.toLowerCase().includes(q)
    );
  }, [preset, searchQuery]);

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
    for (const f of preset.flags) {
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
      const newLayout = splitPane(currentLayout, ctx.sessionId, ctx.direction, newSessionId);
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
      const result = await invoke<{ id: string; cwd: string }>("spawn_pty", {
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
        title: `${preset.label}@${resolvedCwd.split("/").pop() || resolvedCwd}`,
        workspaceId: activeWorkspaceId ?? "",
        agentType: preset.type,
        projectPath: resolvedCwd,
        isActive: true,
      });

      // Save to recent spawns
      const spawnFlags: Record<string, string | boolean> = {};
      for (const f of preset.flags) {
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
      alert(`Failed to spawn terminal: ${err}`);
    }
  };

  const close = () => {
    setShow(false);
    setSplitSpawnContext(null);
  };

  /* ───────── Quick spawn from recent ───────── */

  const handleQuickSpawn = async (agentType: string, flags: Record<string, string | boolean>) => {
    const matchedPreset = allPresets.find((p) => p.type === agentType);
    if (!matchedPreset) return;

    // Resolve default shell placeholder
    if (matchedPreset.cmd === "__default_shell__") {
      matchedPreset.cmd = await getDefaultShell();
    }

    const id = `pty-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const spawnCwd = selectedProject?.path ?? "~";

    try {
      // Wire up PTY ↔ xterm with flow control before spawning
      const { terminal } = getOrCreateTerminal(id);
      setupPtyConnection({ sessionId: id, terminal, fallbackCwd: spawnCwd });

      // Build args from saved flags
      const finalArgs = [...matchedPreset.args];
      for (const [flag, value] of Object.entries(flags)) {
        finalArgs.push(flag);
        if (typeof value === "string") finalArgs.push(value);
      }

      const result = await invoke<{ id: string; cwd: string }>("spawn_pty", {
        id, cmd: matchedPreset.cmd, args: finalArgs, cwd: spawnCwd,
      });
      const resolvedCwd = result?.cwd || spawnCwd;

      addSession({
        id, title: `${matchedPreset.label}@${resolvedCwd.split("/").pop() || resolvedCwd}`,
        workspaceId: activeWorkspaceId ?? "", agentType: matchedPreset.type,
        projectPath: resolvedCwd, isActive: true,
      });
      addRecentSpawn(agentType, flags);
      handlePostSpawn(id);
    } catch (err) {
      // Clean up the pre-created xterm instance on failure
      cleanupTerminal(id);
      console.error("Failed to quick spawn:", err);
      alert(`Failed to spawn terminal: ${err}`);
    }
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

  /* ───────── Stage 1: CLI Selection ───────── */

  const renderCliSelection = () => (
    <div className="p-5">
      {/* Recent spawns section */}
      {recentSpawns.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: "var(--vp-text-dim)", fontWeight: 500 }}>
            Recent
          </span>
          <div className="flex items-center gap-2 mt-2" style={{ flexWrap: "wrap" }}>
            {recentSpawns.map((recent, i) => {
              const matchedPreset = allPresets.find((p) => p.type === recent.agentType);
              if (!matchedPreset) return null;
              return (
                <button
                  key={`${recent.agentType}-${i}`}
                  onClick={() => handleQuickSpawn(recent.agentType, recent.flags)}
                  className="flex items-center gap-1.5"
                  style={{
                    padding: "5px 10px",
                    border: "1px solid var(--vp-border-subtle)",
                    background: "transparent",
                    borderRadius: 8,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    fontSize: 11,
                    color: "var(--vp-text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--vp-text-subtle)";
                    e.currentTarget.style.background = "var(--vp-bg-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--vp-border-subtle)";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {renderLogo(matchedPreset, 14)}
                  <span style={{ fontWeight: 500 }}>{matchedPreset.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {allPresets.map((p, i) => (
          <button
            key={p.type}
            onClick={() => setSelectedPreset(i)}
            className="flex flex-col items-center justify-center gap-2 group"
            style={{
              width: "100%",
              height: 90,
              border: "1px solid var(--vp-input-border)",
              background: "transparent",
              borderRadius: 12,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--vp-text-subtle)";
              e.currentTarget.style.background = "var(--vp-bg-secondary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--vp-border-subtle)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            {renderLogo(p, 32)}
            <span style={{ fontSize: 12, color: "var(--vp-text-secondary)", fontWeight: 500 }}>
              {p.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

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
              borderRadius: 6,
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
                    borderRadius: 8,
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
                          borderRadius: 8,
                          transition: "all 0.2s ease",
                          cursor: "pointer",
                        }}
                      >
                        {/* Checkbox */}
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
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
                              borderRadius: 6,
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
                  borderRadius: 10,
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
                borderRadius: 10,
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
              borderRadius: 10,
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
          width: 520,
          background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-panel)",
          borderRadius: 16,
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
              borderRadius: 8,
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
      `}</style>
    </div>
  );
}
