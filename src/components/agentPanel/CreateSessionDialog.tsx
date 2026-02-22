import { useState, useCallback } from "react";
import { useSessionStore } from "../../stores/sessionStore";
import { useAgentPanelStore, getModelsForAgent } from "../../stores/agentPanelStore";
import { useContextBridgeStore } from "../../stores/contextBridgeStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import type { ChatAgentId } from "../../types/agentPanel";
import type { PersistedSession, ExtractorConfig } from "../../types/agentSession";
import { saveSession } from "../../lib/agentPanel/sessionPersistence";
import { initCliExtractor } from "../../lib/contextBridge/extractor";
import { X, Info } from "lucide-react";

const AGENT_IDS = Object.keys(AGENT_CONFIGS) as ChatAgentId[];

export default function CreateSessionDialog() {
  const isOpen = useSessionStore((s) => s.createDialogOpen);
  const setOpen = useSessionStore((s) => s.setCreateDialogOpen);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const setView = useSessionStore((s) => s.setView);

  const clearAllSessions = useAgentPanelStore((s) => s.clearAllSessions);

  const homeDir = useSettingsStore((s) => s.homeDir);
  const selectedProject = useUIStore((s) => s.selectedProject);
  const projectPath = selectedProject?.path || "";

  const [name, setName] = useState("");
  const [extractorAgent, setExtractorAgent] = useState<ChatAgentId>("claude-code");
  const [extractorModel, setExtractorModel] = useState(() => {
    const models = getModelsForAgent("claude-code");
    return models[0]?.cliValue || AGENT_CONFIGS["claude-code"].defaultModel;
  });
  const handleAgentChange = useCallback((agentId: ChatAgentId) => {
    setExtractorAgent(agentId);
    const models = getModelsForAgent(agentId);
    setExtractorModel(models[0]?.cliValue || "");
  }, []);

  const handleCreate = useCallback(async () => {
    if (!homeDir || !projectPath) return;

    const sessionId = crypto.randomUUID();
    const now = Date.now();

    const extractorConfig: ExtractorConfig = {
      agentId: extractorAgent,
      model: extractorModel,
    };

    const defaultModels: Record<ChatAgentId, string> = {
      "claude-code": AGENT_CONFIGS["claude-code"].defaultModel,
      opencode: AGENT_CONFIGS.opencode.defaultModel,
      gemini: AGENT_CONFIGS.gemini.defaultModel,
      codex: AGENT_CONFIGS.codex.defaultModel,
    };

    const session: PersistedSession = {
      id: sessionId,
      name: name.trim() || "New Session",
      createdAt: now,
      updatedAt: now,
      activeAgentId: "claude-code",
      selectedModels: defaultModels,
      unifiedMessages: [],
      agentMessages: {},
      contextEntries: [],
      extractorConfig,
    };

    // Clear existing state
    clearAllSessions();
    useContextBridgeStore.getState().clearAll();
    useContextBridgeStore.getState().setEnabled(true);

    // Init CLI extractor (context sharing always active)
    initCliExtractor(projectPath, extractorConfig).catch(console.error);

    // Save to disk
    saveSession(homeDir, projectPath, session);

    // Set active and switch to chat
    setActiveSession(session);
    setView("chat");
    setOpen(false);

    // Reset form
    setName("");
  }, [
    homeDir, projectPath, name, extractorAgent, extractorModel,
    clearAllSessions, setActiveSession, setView, setOpen,
  ]);

  if (!isOpen) return null;

  const selectedAgentModels = getModelsForAgent(extractorAgent);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--vp-bg-overlay, rgba(0,0,0,0.5))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--vp-bg-surface, #1e1e1e)",
          border: "1px solid var(--vp-border-subtle)",
          borderRadius: "var(--vp-radius-lg, 8px)",
          padding: 20,
          width: 360,
          maxWidth: "90vw",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1, color: "var(--vp-text-primary)" }}>New Session</span>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--vp-text-dim)",
              padding: 2,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Session name */}
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: "var(--vp-text-dim)", display: "block", marginBottom: 4 }}>
            Session Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New Session"
            autoFocus
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 12,
              borderRadius: "var(--vp-radius-sm, 4px)",
              border: "1px solid var(--vp-input-border, var(--vp-border-subtle))",
              background: "var(--vp-input-bg, transparent)",
              color: "var(--vp-text-primary)",
              outline: "none",
              boxSizing: "border-box",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
        </label>

        {/* Context Extractor explanation */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "8px 10px",
            marginBottom: 12,
            borderRadius: "var(--vp-radius-md, 6px)",
            background: "var(--vp-accent-blue-bg, rgba(59, 130, 246, 0.06))",
            border: "1px solid var(--vp-accent-blue-border, rgba(59, 130, 246, 0.15))",
          }}
        >
          <Info size={14} style={{ color: "var(--vp-accent-blue, #3b82f6)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 11, color: "var(--vp-text-dim)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--vp-text-primary)" }}>Context Extractor</strong> runs as a
            separate background AI agent. After each agent message, it extracts key facts
            (file changes, decisions, errors) and shares them across all agents in the
            session so they stay aware of each other's work — automatically.
          </div>
        </div>

        {/* Extractor CLI */}
        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: "var(--vp-text-dim)", display: "block", marginBottom: 4 }}>
            Context Extractor CLI
          </span>
          <select
            value={extractorAgent}
            onChange={(e) => handleAgentChange(e.target.value as ChatAgentId)}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 12,
              borderRadius: "var(--vp-radius-sm, 4px)",
              border: "1px solid var(--vp-input-border, var(--vp-border-subtle))",
              background: "var(--vp-input-bg, transparent)",
              color: "var(--vp-text-primary)",
              outline: "none",
            }}
          >
            {AGENT_IDS.map((id) => (
              <option key={id} value={id}>
                {AGENT_CONFIGS[id].label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 10, color: "var(--vp-text-dim)", marginTop: 2, display: "block" }}>
            Which CLI tool to use for extracting context in the background
          </span>
        </label>

        {/* Extractor Model */}
        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: "var(--vp-text-dim)", display: "block", marginBottom: 4 }}>
            Context Extractor Model
          </span>
          <select
            value={extractorModel}
            onChange={(e) => setExtractorModel(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 12,
              borderRadius: "var(--vp-radius-sm, 4px)",
              border: "1px solid var(--vp-input-border, var(--vp-border-subtle))",
              background: "var(--vp-input-bg, transparent)",
              color: "var(--vp-text-primary)",
              outline: "none",
            }}
          >
            {selectedAgentModels.map((m) => (
              <option key={m.id} value={m.cliValue}>
                {m.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 10, color: "var(--vp-text-dim)", marginTop: 2, display: "block" }}>
            Smaller/faster models recommended to keep extraction cost low
          </span>
        </label>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              borderRadius: "var(--vp-radius-sm, 4px)",
              border: "1px solid var(--vp-border-subtle)",
              background: "transparent",
              color: "var(--vp-text-primary)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              borderRadius: "var(--vp-radius-sm, 4px)",
              border: "none",
              background: "var(--vp-button-primary-bg, var(--vp-accent-blue, #3b82f6))",
              color: "var(--vp-button-primary-text, #fff)",
              cursor: "pointer",
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
