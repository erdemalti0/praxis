import { useState, useEffect } from "react";
import { Swords, ChevronDown, X } from "lucide-react";
import type { ChatAgentId } from "../../types/agentPanel";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import type { DebateMode, DebateConfig } from "../../types/debate";
import { useAgentPanelStore, getModelsForAgent, resolveModelCliValue } from "../../stores/agentPanelStore";

const AGENT_ORDER: ChatAgentId[] = ["claude-code", "opencode", "gemini", "codex"];

const MODE_INFO: Record<DebateMode, { label: string; description: string }> = {
  "side-by-side": {
    label: "Side-by-Side",
    description: "Both agents answer simultaneously",
  },
  sequential: {
    label: "Sequential",
    description: "Agent A answers, Agent B reviews",
  },
  "multi-round": {
    label: "Multi-Round",
    description: "Agents debate across multiple rounds",
  },
};

interface Props {
  /** Called whenever the debate config changes so parent can read it on Enter */
  onConfigChange: (config: DebateConfig) => void;
  onClose: () => void;
}

export default function DebateModeSelector({ onConfigChange, onClose }: Props) {
  const agentAvailability = useAgentPanelStore((s) => s.agentAvailability);
  const [mode, setMode] = useState<DebateMode>("sequential");
  const [agentA, setAgentA] = useState<ChatAgentId>("claude-code");
  const [agentB, setAgentB] = useState<ChatAgentId>("gemini");
  const [modelA, setModelA] = useState<string>(AGENT_CONFIGS["claude-code"].defaultModel);
  const [modelB, setModelB] = useState<string>(AGENT_CONFIGS["gemini"].defaultModel);
  const [rounds, setRounds] = useState(3);
  const [modeDropdown, setModeDropdown] = useState(false);

  const availableAgents = AGENT_ORDER.filter((id) => {
    const availability = agentAvailability[id];
    return availability === null || availability.installed;
  });

  const resolveCliValue = (agentId: ChatAgentId, modelId: string): string => {
    return resolveModelCliValue(agentId, modelId);
  };

  // Notify parent whenever config changes
  useEffect(() => {
    if (agentA === agentB) return;
    onConfigChange({
      mode,
      agentA,
      agentB,
      rounds,
      topic: "", // topic comes from input field on Enter
      modelA: resolveCliValue(agentA, modelA),
      modelB: resolveCliValue(agentB, modelB),
    });
  }, [mode, agentA, agentB, modelA, modelB, rounds]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAgentAChange = (id: ChatAgentId) => {
    setAgentA(id);
    const models = getModelsForAgent(id);
    setModelA(models[0]?.id ?? AGENT_CONFIGS[id].defaultModel);
  };
  const handleAgentBChange = (id: ChatAgentId) => {
    setAgentB(id);
    const models = getModelsForAgent(id);
    setModelB(models[0]?.id ?? AGENT_CONFIGS[id].defaultModel);
  };

  return (
    <div
      style={{
        padding: "10px 16px",
        background: "var(--vp-bg-surface)",
        borderTop: "1px solid var(--vp-border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {/* Label */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#8b5cf6" }}>
        <Swords size={12} />
        Debate
      </div>

      {/* Mode selector */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setModeDropdown(!modeDropdown)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 8px", borderRadius: 6,
            border: "1px solid var(--vp-border-subtle)",
            background: "rgba(139, 92, 246, 0.1)",
            cursor: "pointer", color: "#8b5cf6",
            fontSize: 11, fontWeight: 500,
          }}
        >
          {MODE_INFO[mode].label}
          <ChevronDown size={10} />
        </button>
        {modeDropdown && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setModeDropdown(false)} />
            <div
              style={{
                position: "absolute", bottom: "calc(100% + 4px)", left: 0,
                background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-panel)",
                borderRadius: 8, padding: 4, zIndex: 100, minWidth: 200,
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
            >
              {(Object.keys(MODE_INFO) as DebateMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setModeDropdown(false); }}
                  style={{
                    display: "flex", flexDirection: "column", gap: 2,
                    width: "100%", padding: "6px 10px", borderRadius: 6, border: "none",
                    background: m === mode ? "rgba(139, 92, 246, 0.1)" : "transparent",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: m === mode ? 500 : 400, color: m === mode ? "#8b5cf6" : "var(--vp-text-secondary)" }}>
                    {MODE_INFO[m].label}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--vp-text-dim)" }}>
                    {MODE_INFO[m].description}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Agent A + Model */}
      <AgentWithModelPicker
        label="A"
        agentId={agentA}
        modelId={modelA}
        onAgentChange={handleAgentAChange}
        onModelChange={setModelA}
        agents={availableAgents}
        excludeAgent={agentB}
      />

      <span style={{ fontSize: 11, color: "var(--vp-text-dim)", fontWeight: 600 }}>vs</span>

      {/* Agent B + Model */}
      <AgentWithModelPicker
        label="B"
        agentId={agentB}
        modelId={modelB}
        onAgentChange={handleAgentBChange}
        onModelChange={setModelB}
        agents={availableAgents}
        excludeAgent={agentA}
      />

      {/* Rounds (only for multi-round) */}
      {mode === "multi-round" && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: "var(--vp-text-dim)" }}>Rounds:</span>
          <select
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            style={{
              padding: "3px 6px", borderRadius: 4,
              border: "1px solid var(--vp-border-subtle)",
              background: "var(--vp-bg-primary)",
              color: "var(--vp-text-secondary)", fontSize: 11,
            }}
          >
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}

      {/* Error if same agent */}
      {agentA === agentB && (
        <span style={{ fontSize: 10, color: "#ef4444" }}>Choose different agents</span>
      )}

      {/* Hint */}
      <span style={{ fontSize: 10, color: "var(--vp-text-dim)", fontStyle: "italic" }}>
        Type message below, press Enter to start
      </span>

      {/* Close */}
      <button
        onClick={onClose}
        style={{
          marginLeft: "auto",
          background: "none", border: "none", cursor: "pointer",
          color: "var(--vp-text-dim)", padding: 4,
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** Agent picker with inline model selector */
function AgentWithModelPicker({
  agentId,
  modelId,
  onAgentChange,
  onModelChange,
  agents,
  excludeAgent,
}: {
  label: string;
  agentId: ChatAgentId;
  modelId: string;
  onAgentChange: (id: ChatAgentId) => void;
  onModelChange: (modelId: string) => void;
  agents: ChatAgentId[];
  excludeAgent: ChatAgentId;
}) {
  const [agentOpen, setAgentOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const config = AGENT_CONFIGS[agentId];
  const models = getModelsForAgent(agentId);
  const currentModel = models.find((m) => m.id === modelId);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {/* Agent button */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setAgentOpen(!agentOpen)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 8px", borderRadius: "6px 0 0 6px",
            border: "1px solid var(--vp-border-subtle)",
            borderRight: "none",
            background: `${config.color}10`,
            cursor: "pointer", color: config.color,
            fontSize: 11, fontWeight: 500,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: config.color, flexShrink: 0 }} />
          {config.shortLabel}
          <ChevronDown size={10} />
        </button>
        {agentOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setAgentOpen(false)} />
            <div
              style={{
                position: "absolute", bottom: "calc(100% + 4px)", left: 0,
                background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-panel)",
                borderRadius: 8, padding: 4, zIndex: 100, minWidth: 140,
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
            >
              {agents.filter((id) => id !== excludeAgent).map((id) => {
                const c = AGENT_CONFIGS[id];
                const isSelected = id === agentId;
                return (
                  <button
                    key={id}
                    onClick={() => { onAgentChange(id); setAgentOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      width: "100%", padding: "5px 8px", borderRadius: 6, border: "none",
                      background: isSelected ? `${c.color}15` : "transparent",
                      cursor: "pointer", color: isSelected ? c.color : "var(--vp-text-secondary)",
                      fontSize: 11, fontWeight: isSelected ? 500 : 400, textAlign: "left",
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color }} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Model button */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setModelOpen(!modelOpen)}
          style={{
            display: "flex", alignItems: "center", gap: 3,
            padding: "4px 6px", borderRadius: "0 6px 6px 0",
            border: "1px solid var(--vp-border-subtle)",
            background: "var(--vp-bg-primary)",
            cursor: "pointer", color: "var(--vp-text-dim)",
            fontSize: 10, fontWeight: 400,
          }}
        >
          {currentModel?.label ?? modelId}
          <ChevronDown size={8} />
        </button>
        {modelOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setModelOpen(false)} />
            <div
              style={{
                position: "absolute", bottom: "calc(100% + 4px)", left: 0,
                background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-panel)",
                borderRadius: 8, padding: 4, zIndex: 100, minWidth: 160,
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              }}
            >
              {models.map((m) => {
                const isSelected = m.id === modelId;
                return (
                  <button
                    key={m.id}
                    onClick={() => { onModelChange(m.id); setModelOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      width: "100%", padding: "5px 8px", borderRadius: 6, border: "none",
                      background: isSelected ? `${config.color}15` : "transparent",
                      cursor: "pointer", color: isSelected ? config.color : "var(--vp-text-secondary)",
                      fontSize: 11, fontWeight: isSelected ? 500 : 400, textAlign: "left",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
