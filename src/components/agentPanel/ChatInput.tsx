import { useRef, useCallback, useState, useMemo, useEffect } from "react";
import { Send, Square, ChevronDown, ChevronUp, Swords, MessageSquare, ClipboardList, Hammer } from "lucide-react";
import type { ChatAgentId, InputMode } from "../../types/agentPanel";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import { useAgentPanelStore } from "../../stores/agentPanelStore";
import { useDebateStore } from "../../stores/debateStore";
import { commandRegistry } from "../../lib/agentPanel/commands/commandRegistry";
import type { CommandDefinition } from "../../lib/agentPanel/commands/commandRegistry";

const AGENT_ORDER: ChatAgentId[] = ["claude-code", "opencode", "gemini", "codex"];

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled: boolean;
  activeAgentId: ChatAgentId;
  selectedModel: string;
  onSelectAgent: (id: ChatAgentId) => void;
  onSelectModel: (model: string) => void;
  /** Resolve a slash command before sending. Returns { handled } if consumed, or { passthrough } to send as message. */
  onResolveCommand?: (input: string) => Promise<{ handled: boolean; passthrough?: string }>;
  /** Current input mode (chat/plan/build) */
  inputMode?: InputMode;
  /** Callback to change input mode */
  onInputModeChange?: (mode: InputMode) => void;
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  disabled,
  activeAgentId,
  selectedModel,
  onSelectAgent,
  onSelectModel,
  onResolveCommand,
  inputMode = "chat",
  onInputModeChange,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [autocompleteIdx, setAutocompleteIdx] = useState(-1);

  const agentAvailability = useAgentPanelStore((s) => s.agentAvailability);

  const activeConfig = AGENT_CONFIGS[activeAgentId];
  const activeModels = agentAvailability[activeAgentId]?.models ?? activeConfig.models;
  const activeModelOption = activeModels.find((m) => m.id === selectedModel);

  // Command autocomplete: only active when input starts with "/"
  const commandSuggestions: CommandDefinition[] = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed.startsWith("/") || trimmed.includes(" ")) return [];
    return commandRegistry.getMatches(trimmed);
  }, [value]);

  /** Shared submit logic for both Enter key and Send button */
  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isStreaming) return;

    if (trimmed.startsWith("/") && onResolveCommand) {
      onResolveCommand(trimmed)
        .then(({ handled, passthrough }) => {
          if (!handled && passthrough) {
            onSend(passthrough);
          }
        })
        .catch((err) => {
          console.error("[ChatInput] Command resolution failed:", err);
          onSend(trimmed);
        });
      onChange("");
      setAutocompleteIdx(-1);
    } else {
      onSend(trimmed);
    }
  }, [value, disabled, isStreaming, onSend, onChange, onResolveCommand]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Tab to accept autocomplete suggestion
      if (e.key === "Tab" && commandSuggestions.length > 0) {
        e.preventDefault();
        const idx = autocompleteIdx >= 0 ? autocompleteIdx : 0;
        const cmd = commandSuggestions[idx];
        if (cmd) {
          onChange(`/${cmd.name} `);
          setAutocompleteIdx(-1);
        }
        return;
      }

      // Arrow keys to navigate autocomplete
      if (commandSuggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setAutocompleteIdx((prev) => Math.min(prev + 1, commandSuggestions.length - 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setAutocompleteIdx((prev) => Math.max(prev - 1, -1));
          return;
        }
        if (e.key === "Escape") {
          setAutocompleteIdx(-1);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, onChange, commandSuggestions, autocompleteIdx],
  );

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  return (
    <div
      style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--vp-border-subtle)",
        background: "var(--vp-bg-surface)",
      }}
    >
      {/* Command autocomplete dropdown */}
      {commandSuggestions.length > 0 && (
        <div
          style={{
            background: "var(--vp-bg-surface)",
            border: "1px solid var(--vp-border-panel)",
            borderRadius: 8,
            padding: 4,
            marginBottom: 4,
            maxHeight: 200,
            overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          {commandSuggestions.map((cmd, i) => {
            const ownerLabel = cmd.owner === "praxis" ? "" : ` [${AGENT_CONFIGS[cmd.owner as ChatAgentId]?.shortLabel ?? cmd.owner}]`;
            return (
              <button
                key={cmd.name}
                onClick={() => {
                  onChange(`/${cmd.name} `);
                  setAutocompleteIdx(-1);
                  textareaRef.current?.focus();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: i === autocompleteIdx ? "var(--vp-bg-surface-hover)" : "transparent",
                  cursor: "pointer",
                  color: "var(--vp-text-secondary)",
                  fontSize: 12,
                  textAlign: "left",
                }}
              >
                <span style={{ fontWeight: 500, color: "var(--vp-text-primary)" }}>/{cmd.name}</span>
                {cmd.args && <span style={{ opacity: 0.5 }}>{cmd.args}</span>}
                <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.6 }}>
                  {cmd.description}{ownerLabel}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Input box — no overflow:hidden so dropdowns can escape */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: 12,
          border: "1px solid var(--vp-border-panel)",
          background: "var(--vp-bg-primary)",
        }}
      >
        {/* Textarea area */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "14px 14px 8px" }}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              handleInput();
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activeConfig.shortLabel}...`}
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--vp-text-primary)",
              fontSize: 13,
              lineHeight: 1.5,
              fontFamily: "inherit",
              maxHeight: 200,
              overflow: "auto",
            }}
            disabled={disabled}
          />
          {isStreaming ? (
            <button
              onClick={onStop}
              style={{
                background: "#ef4444",
                border: "none",
                borderRadius: 8,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Square size={14} color="white" fill="white" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!value.trim() || disabled}
              style={{
                background: value.trim() && !disabled ? activeConfig.color : "var(--vp-bg-surface-hover)",
                border: "none",
                borderRadius: 8,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: value.trim() && !disabled ? "pointer" : "default",
                flexShrink: 0,
                opacity: value.trim() && !disabled ? 1 : 0.5,
              }}
            >
              <Send size={14} color="white" />
            </button>
          )}
        </div>

        {/* Bottom bar inside the box: agent selector + model selector */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 10px 10px",
          }}
        >
          {/* Agent selector */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                setAgentDropdownOpen(!agentDropdownOpen);
                setModelDropdownOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--vp-border-subtle)",
                background: `${activeConfig.color}10`,
                cursor: "pointer",
                color: activeConfig.color,
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              {activeConfig.logo ? (
                <img src={activeConfig.logo} alt={activeConfig.shortLabel} style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0 }} />
              ) : (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: activeConfig.color,
                    flexShrink: 0,
                  }}
                />
              )}
              {activeConfig.shortLabel}
              <ChevronDown size={10} />
            </button>

            {agentDropdownOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 99 }}
                  onClick={() => setAgentDropdownOpen(false)}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 4px)",
                    left: 0,
                    background: "var(--vp-bg-surface)",
                    border: "1px solid var(--vp-border-panel)",
                    borderRadius: 8,
                    padding: 4,
                    zIndex: 100,
                    minWidth: 160,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                  }}
                >
                  {AGENT_ORDER.map((id) => {
                    const config = AGENT_CONFIGS[id];
                    const isActive = id === activeAgentId;
                    const availability = agentAvailability[id];
                    const isInstalled = availability === null || availability.installed;
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          if (!isInstalled) return;
                          onSelectAgent(id);
                          setAgentDropdownOpen(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: isActive ? `${config.color}15` : "transparent",
                          cursor: isInstalled ? "pointer" : "not-allowed",
                          color: !isInstalled
                            ? "var(--vp-text-dim)"
                            : isActive
                            ? config.color
                            : "var(--vp-text-secondary)",
                          fontSize: 12,
                          fontWeight: isActive ? 500 : 400,
                          textAlign: "left",
                          opacity: isInstalled ? 1 : 0.5,
                        }}
                      >
                        {config.logo ? (
                          <img src={config.logo} alt={config.label} style={{ width: 16, height: 16, objectFit: "contain", flexShrink: 0, opacity: isInstalled ? 1 : 0.4 }} />
                        ) : (
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: isInstalled ? config.color : "var(--vp-text-dim)",
                              flexShrink: 0,
                            }}
                          />
                        )}
                        {config.label}
                        {!isInstalled && (
                          <span style={{ marginLeft: "auto", fontSize: 9, opacity: 0.7 }}>
                            not installed
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Model selector */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                setModelDropdownOpen(!modelDropdownOpen);
                setAgentDropdownOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--vp-border-subtle)",
                background: "transparent",
                cursor: "pointer",
                color: "var(--vp-text-secondary)",
                fontSize: 11,
                fontWeight: 400,
              }}
            >
              {activeModelOption?.label || selectedModel}
              <ChevronDown size={10} />
            </button>

            {modelDropdownOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 99 }}
                  onClick={() => setModelDropdownOpen(false)}
                />
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 4px)",
                    left: 0,
                    background: "var(--vp-bg-surface)",
                    border: "1px solid var(--vp-border-panel)",
                    borderRadius: 8,
                    padding: 4,
                    zIndex: 100,
                    minWidth: 220,
                    maxHeight: 300,
                    overflowY: "auto",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                  }}
                >
                  {activeModels.map((model) => {
                    const isSelected = model.id === selectedModel;
                    return (
                      <button
                        key={model.id}
                        onClick={() => {
                          onSelectModel(model.id);
                          setModelDropdownOpen(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: isSelected ? `${activeConfig.color}15` : "transparent",
                          cursor: "pointer",
                          color: isSelected ? activeConfig.color : "var(--vp-text-secondary)",
                          fontSize: 12,
                          fontWeight: isSelected ? 500 : 400,
                          textAlign: "left",
                        }}
                      >
                        {model.label}
                        {isSelected && (
                          <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.6 }}>
                            &#10003;
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Input mode selector (Chat / Plan / Build) */}
          {onInputModeChange && (
            <InputModeSelector mode={inputMode} onChange={onInputModeChange} accentColor={activeConfig.color} />
          )}

          {/* Debate mode toggle */}
          <DebateToggle />

          {/* Hint */}
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--vp-text-dim)" }}>
            {inputMode === "plan" ? "Enter to generate plan" : inputMode === "build" ? "Enter to build" : "Enter to send"}
          </span>
        </div>
      </div>
    </div>
  );
}

const INPUT_MODES: { mode: InputMode; label: string; icon: typeof MessageSquare }[] = [
  { mode: "chat", label: "Chat", icon: MessageSquare },
  { mode: "plan", label: "Plan", icon: ClipboardList },
  { mode: "build", label: "Build", icon: Hammer },
];

function InputModeSelector({
  mode,
  onChange,
  accentColor,
}: {
  mode: InputMode;
  onChange: (m: InputMode) => void;
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeMode = INPUT_MODES.find((m) => m.mode === mode) ?? INPUT_MODES[0];
  const ActiveIcon = activeMode.icon;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div style={{ position: "relative" }} ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid var(--vp-border-subtle)",
          background: `${accentColor}10`,
          cursor: "pointer",
          color: accentColor,
          fontSize: 11,
          fontWeight: 500,
          transition: "all 0.15s",
        }}
      >
        <ActiveIcon size={11} />
        {activeMode.label}
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 4px)",
            left: 0,
            background: "var(--vp-bg-surface)",
            border: "1px solid var(--vp-border-panel)",
            borderRadius: 8,
            padding: 4,
            zIndex: 100,
            minWidth: 120,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          {INPUT_MODES.map(({ mode: m, label, icon: Icon }) => {
            const isActive = m === mode;
            return (
              <button
                key={m}
                onClick={() => {
                  onChange(m);
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: isActive ? `${accentColor}15` : "transparent",
                  cursor: "pointer",
                  color: isActive ? accentColor : "var(--vp-text-secondary)",
                  fontSize: 12,
                  fontWeight: isActive ? 500 : 400,
                  textAlign: "left",
                  transition: "all 0.1s",
                }}
              >
                <Icon size={12} />
                {label}
                {isActive && (
                  <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.6 }}>
                    &#10003;
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Debate mode toggle button - opens/closes the debate setup panel */
function DebateToggle() {
  const activeDebate = useDebateStore((s) => s.activeDebate);
  const setupOpen = useDebateStore((s) => s.setupOpen);
  const openSetup = useDebateStore((s) => s.openSetup);
  const closeSetup = useDebateStore((s) => s.closeSetup);
  const clearDebate = useDebateStore((s) => s.clearDebate);

  const isRunning = activeDebate?.status === "running";
  const isActive = setupOpen;

  const handleClick = () => {
    // Clear stale completed/errored/cancelled debates on click
    if (activeDebate && activeDebate.status !== "running") {
      clearDebate();
    }
    if (isActive) {
      closeSetup();
    } else {
      openSetup();
    }
  };

  return (
    <button
      onClick={handleClick}
      title={isRunning ? "Debate in progress..." : "Debate Mode"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        borderRadius: 6,
        border: "1px solid var(--vp-border-subtle)",
        background: isRunning
          ? "rgba(245, 158, 11, 0.15)"
          : isActive
            ? "rgba(139, 92, 246, 0.15)"
            : "transparent",
        cursor: isRunning ? "default" : "pointer",
        color: isRunning ? "#f59e0b" : isActive ? "#8b5cf6" : "var(--vp-text-dim)",
        fontSize: 11,
        fontWeight: isActive || isRunning ? 500 : 400,
        transition: "all 0.15s",
        opacity: isRunning ? 0.7 : 1,
      }}
    >
      <Swords size={11} />
      {isRunning ? "Debating..." : "Debate"}
    </button>
  );
}
