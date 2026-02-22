import { useEffect, useRef, useCallback } from "react";
import { useAgentPanelStore } from "../../stores/agentPanelStore";
import { useContextBridgeStore } from "../../stores/contextBridgeStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import type { ChatAgentId, ChatMessage, ContentBlock } from "../../types/agentPanel";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import type { AgentAdapter } from "../../lib/agentPanel/adapters/base";
import { createAdapter } from "../../lib/agentPanel/adapters";
import { wireAdapterToEventBus, wireEventBusToStore } from "../../lib/agentPanel/adapterBridge";
import { buildContextPrefix } from "../../lib/contextBridge/injector";
import { extractContext, initCliExtractor, disposeCliExtractor } from "../../lib/contextBridge/extractor";
import { saveSession } from "../../lib/agentPanel/sessionPersistence";
import type { PersistedSession, PersistedAgentData } from "../../types/agentSession";
import { AlertTriangle } from "lucide-react";
import AgentPanelHeader from "./AgentPanelHeader";
import ChatMessageList from "./ChatMessageList";
import ChatInput from "./ChatInput";
import SessionListView from "./SessionListView";
import CreateSessionDialog from "./CreateSessionDialog";
import DebateTabBar from "./DebateTabBar";
import DebateModeSelector from "./DebateModeSelector";
import { useDebateStore } from "../../stores/debateStore";
import { DebateOrchestrator } from "../../lib/agentPanel/debateOrchestrator";
import type { DebateConfig } from "../../types/debate";
import { commandRegistry } from "../../lib/agentPanel/commands/commandRegistry";
import { registerBuiltinCommands } from "../../lib/agentPanel/commands/builtinCommands";
import { registerAdapterCommands } from "../../lib/agentPanel/commands/adapterCommands";
import { wrapWithPlanPrompt } from "../../lib/agentPanel/planModeHandler";
import { wrapWithBuildPrompt } from "../../lib/agentPanel/buildModeHandler";
import { initMemorySystem, isMemoryReady, getMemoryInjectionPrefix, allocateBudget } from "../../lib/memory";
import { useMemoryStore } from "../../stores/memoryStore";

// Initialize command registry (idempotent — only registers once)
let _commandsRegistered = false;
function ensureCommandsRegistered() {
  if (_commandsRegistered) return;
  registerBuiltinCommands();
  registerAdapterCommands();
  _commandsRegistered = true;
}
ensureCommandsRegistered();

/** Fire-and-forget context extraction after agent message completes */
async function extractAndStore(agentId: ChatAgentId, messageId: string) {
  // Track message pointer for memory system (Phase 5)
  const session0 = useAgentPanelStore.getState().sessions[agentId];
  const msg0 = session0?.messages.find((m) => m.id === messageId);
  if (msg0 && msg0.role === "assistant") {
    const textContent = msg0.blocks
      .filter((b): b is ContentBlock & { type: "text" } => b.type === "text")
      .map((b) => b.text)
      .join(" ");
    if (textContent.length > 20) {
      useMemoryStore.getState().addMessagePointer(messageId, textContent);
    }
  }

  const contextStore = useContextBridgeStore.getState();
  if (!contextStore.enabled) return;

  const session = useAgentPanelStore.getState().sessions[agentId];
  const message = session?.messages.find((m) => m.id === messageId);
  if (!message || message.role !== "assistant" || message.blocks.length === 0) return;

  // Find the preceding user message to include question context
  const msgIndex = session!.messages.findIndex((m) => m.id === messageId);
  const userMsg = msgIndex > 0 ? session!.messages[msgIndex - 1] : null;

  // Build combined blocks: user question + assistant answer for richer extraction
  const blocksForExtraction: ContentBlock[] = [];
  if (userMsg && userMsg.role === "user") {
    const userText = userMsg.blocks
      .filter((b): b is ContentBlock & { type: "text" } => b.type === "text")
      .map((b) => b.text)
      .join(" ");
    if (userText) {
      blocksForExtraction.push({ type: "text", text: `User asked: ${userText}` });
    }
  }
  blocksForExtraction.push(...message.blocks);

  contextStore.setExtracting(true);
  try {
    const entries = await extractContext(blocksForExtraction, agentId, messageId);
    if (entries.length > 0) contextStore.addEntries(entries);
    contextStore.setLastError(null);
  } catch (err) {
    contextStore.setLastError(String(err));
  } finally {
    contextStore.setExtracting(false);
  }
}

/** Build the current session snapshot for persistence */
function buildSessionSnapshot(): PersistedSession | null {
  const sessionState = useSessionStore.getState();
  const active = sessionState.activeSession;
  if (!active) return null;

  const panelState = useAgentPanelStore.getState();
  const contextEntries = useContextBridgeStore.getState().entries;

  const agentMessages: Partial<Record<ChatAgentId, PersistedAgentData>> = {};
  for (const [agentId, agentSession] of Object.entries(panelState.sessions)) {
    if (!agentSession) continue;
    agentMessages[agentId as ChatAgentId] = {
      messages: agentSession.messages.map((m) => ({ ...m, isStreaming: false })),
      totalCost: agentSession.totalCost,
      totalTokensIn: agentSession.totalTokensIn,
      totalTokensOut: agentSession.totalTokensOut,
    };
  }

  return {
    ...active,
    updatedAt: Date.now(),
    activeAgentId: panelState.activeAgentId,
    selectedModels: panelState.selectedModels,
    unifiedMessages: panelState.unifiedMessages,
    agentMessages,
    contextEntries,
  };
}

/** The main chat view (previously the entire AgentChatPanel) */
function AgentChatView() {
  const activeAgentId = useAgentPanelStore((s) => s.activeAgentId);
  const sessions = useAgentPanelStore((s) => s.sessions);
  const inputValue = useAgentPanelStore((s) => s.inputValue);
  const selectedModels = useAgentPanelStore((s) => s.selectedModels);
  const unifiedMessages = useAgentPanelStore((s) => s.unifiedMessages);
  const inputMode = useAgentPanelStore((s) => s.inputMode);

  const setActiveAgent = useAgentPanelStore((s) => s.setActiveAgent);
  const setSelectedModel = useAgentPanelStore((s) => s.setSelectedModel);
  const initSession = useAgentPanelStore((s) => s.initSession);
  const addMessage = useAgentPanelStore((s) => s.addMessage);
  const addUnifiedMessage = useAgentPanelStore((s) => s.addUnifiedMessage);
  const finalizeMessage = useAgentPanelStore((s) => s.finalizeMessage);
  const clearMessages = useAgentPanelStore((s) => s.clearMessages);
  const clearUnifiedMessages = useAgentPanelStore((s) => s.clearUnifiedMessages);
  const setInputValue = useAgentPanelStore((s) => s.setInputValue);
  const setInputMode = useAgentPanelStore((s) => s.setInputMode);

  const refreshModels = useAgentPanelStore((s) => s.refreshModels);
  const agentAvailability = useAgentPanelStore((s) => s.agentAvailability);

  const activeSession = useSessionStore((s) => s.activeSession);
  const setView = useSessionStore((s) => s.setView);
  const setActiveSessionStore = useSessionStore((s) => s.setActiveSession);

  const homeDir = useSettingsStore((s) => s.homeDir);
  const selectedProject = useUIStore((s) => s.selectedProject);
  const projectPath = selectedProject?.path || "";

  // Keep adapters alive across renders
  const adaptersRef = useRef<Partial<Record<ChatAgentId, AgentAdapter>>>({});
  const streamingMsgRef = useRef<Partial<Record<ChatAgentId, string>>>({});

  // Wire EventBus → Store (once on mount)
  const eventBusUnsubRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    eventBusUnsubRef.current = wireEventBusToStore(
      (agentId) => streamingMsgRef.current[agentId],
      (agentId) => { streamingMsgRef.current[agentId] = undefined; },
      (agentId, messageId) => { extractAndStore(agentId, messageId).catch(console.error); },
    );
    return () => {
      eventBusUnsubRef.current?.();
      eventBusUnsubRef.current = null;
    };
  }, []);

  const getOrCreateAdapter = useCallback(
    async (agentId: ChatAgentId): Promise<AgentAdapter> => {
      if (adaptersRef.current[agentId]) {
        return adaptersRef.current[agentId]!;
      }

      const adapter = createAdapter(agentId);

      // Wire adapter callbacks → EventBus (EventBus → Store is handled above)
      wireAdapterToEventBus(adapter, agentId, () => streamingMsgRef.current[agentId]);

      const { ptySessionId, pid } = await adapter.spawn(projectPath);

      initSession(agentId, {
        agentId,
        ptySessionId,
        status: "idle",
        messages: [],
        totalCost: 0,
        totalTokensIn: 0,
        totalTokensOut: 0,
        pid,
      });

      adaptersRef.current[agentId] = adapter;
      return adapter;
    },
    [projectPath, initSession],
  );

  // Discover available models on mount
  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  // Init CLI extractor on mount if session has config
  useEffect(() => {
    if (activeSession?.extractorConfig && projectPath) {
      initCliExtractor(projectPath, activeSession.extractorConfig).catch(console.error);
    }
    return () => {
      disposeCliExtractor();
    };
  }, [activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Init memory system when project is available
  useEffect(() => {
    if (homeDir && projectPath) {
      initMemorySystem(homeDir, projectPath);
    }
  }, [homeDir, projectPath]);

  // Auto-save: debounced save on state changes
  useEffect(() => {
    if (!homeDir || !projectPath || !activeSession) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsub = useAgentPanelStore.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const snapshot = buildSessionSnapshot();
        if (snapshot) {
          saveSession(homeDir, projectPath, snapshot);
        }
      }, 1500);
    });

    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [homeDir, projectPath, activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush on beforeunload
  useEffect(() => {
    if (!homeDir || !projectPath || !activeSession) return;

    const flush = () => {
      const snapshot = buildSessionSnapshot();
      if (snapshot) {
        saveSession(homeDir, projectPath, snapshot);
      }

      // Sync finalize session memory before window closes
      const memState = useMemoryStore.getState();
      if (memState.isLoaded && memState.store.metadata.autoMemoryEnabled && activeSession?.id && activeAgentId) {
        const agentSession = useAgentPanelStore.getState().sessions[activeAgentId];
        memState.finalizeCurrentSessionSync(
          activeSession.id,
          agentSession?.messages || [],
          activeAgentId,
        );
      }
    };

    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [homeDir, projectPath, activeSession?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const adapter of Object.values(adaptersRef.current)) {
        adapter?.dispose();
      }
      adaptersRef.current = {};
    };
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      if (!message.trim() || !projectPath) return;

      try {
        const adapter = await getOrCreateAdapter(activeAgentId);
        const modelId = selectedModels[activeAgentId];
        const agentConfig = AGENT_CONFIGS[activeAgentId];
        const modelList = agentAvailability[activeAgentId]?.models ?? agentConfig.models;
        const model = modelList.find((m) => m.id === modelId)?.cliValue || modelId;

        // Insert agent-switch divider if agent changed
        const currentUnified = useAgentPanelStore.getState().unifiedMessages;
        if (currentUnified.length > 0) {
          const lastItem = currentUnified[currentUnified.length - 1];
          const lastAgent = "agentId" in lastItem ? lastItem.agentId : null;
          if (lastAgent && lastAgent !== activeAgentId) {
            addUnifiedMessage({
              id: crypto.randomUUID(),
              type: "agent-switch",
              fromAgent: lastAgent,
              toAgent: activeAgentId,
              timestamp: Date.now(),
            });
          }
        }

        // Add user message
        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          blocks: [{ type: "text", text: message }],
          timestamp: Date.now(),
          agentId: activeAgentId,
        };
        addMessage(activeAgentId, userMsg);

        // Create streaming assistant message
        const assistantMsgId = crypto.randomUUID();
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          role: "assistant",
          blocks: [],
          timestamp: Date.now(),
          agentId: activeAgentId,
          model,
          isStreaming: true,
        };
        addMessage(activeAgentId, assistantMsg);
        streamingMsgRef.current[activeAgentId] = assistantMsgId;

        // Mode-specific prompt wrapping
        let messageToSend = message;
        const currentInputMode = useAgentPanelStore.getState().inputMode;
        if (currentInputMode === "plan") {
          messageToSend = wrapWithPlanPrompt(message);
        } else if (currentInputMode === "build") {
          messageToSend = wrapWithBuildPrompt(message);
        }

        // Memory + Context Bridge injection (unified budget)
        const contextState = useContextBridgeStore.getState();
        const recentPaths = contextState.recentFilePaths?.[activeAgentId] ?? [];

        if (isMemoryReady()) {
          // Allocate unified budget (memory + context bridge share one pool)
          const budget = allocateBudget(100_000); // approximate remaining context

          // 1. Memory injection (highest priority after safety pins)
          if (budget) {
            try {
              const memoryPrefix = getMemoryInjectionPrefix(
                messageToSend,
                activeAgentId,
                budget.memoryRetrieval + budget.memoryAlwaysInject,
                recentPaths,
              );
              if (memoryPrefix) messageToSend = memoryPrefix + messageToSend;
            } catch (err) {
              console.error("[memory] Injection failed, continuing without memory:", err);
            }
          }

          // 2. Context Bridge injection (with budget-aware token limit)
          if (contextState.enabled) {
            if (budget) contextState.maxInjectionTokens = budget.contextBridge;
            const entries = contextState.getEntriesForInjection(activeAgentId);
            const prefix = buildContextPrefix(entries, activeAgentId);
            if (prefix) messageToSend = prefix + messageToSend;
          }
        } else {
          // Fallback: existing context bridge behavior (no memory system)
          if (contextState.enabled) {
            const entries = contextState.getEntriesForInjection(activeAgentId);
            const prefix = buildContextPrefix(entries, activeAgentId);
            if (prefix) messageToSend = prefix + messageToSend;
          }
        }

        setInputValue("");
        adapter.sendMessage(messageToSend, model);
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    },
    [activeAgentId, projectPath, selectedModels, getOrCreateAdapter, addMessage, addUnifiedMessage, setInputValue, agentAvailability],
  );

  const handleStop = useCallback(() => {
    const adapter = adaptersRef.current[activeAgentId];
    if (adapter) {
      adapter.kill();
      delete adaptersRef.current[activeAgentId];
      const msgId = streamingMsgRef.current[activeAgentId];
      if (msgId) {
        finalizeMessage(activeAgentId, msgId);
        streamingMsgRef.current[activeAgentId] = undefined;
      }
    }
  }, [activeAgentId, finalizeMessage]);

  const handleSelectAgent = useCallback(
    (id: ChatAgentId) => {
      setActiveAgent(id);
    },
    [setActiveAgent],
  );

  const handleSelectModel = useCallback(
    (model: string) => {
      setSelectedModel(activeAgentId, model);
    },
    [activeAgentId, setSelectedModel],
  );

  const handleClear = useCallback(() => {
    clearMessages(activeAgentId);
    clearUnifiedMessages();
  }, [activeAgentId, clearMessages, clearUnifiedMessages]);

  /** Resolve slash commands via the command registry */
  const handleResolveCommand = useCallback(
    async (input: string) => {
      const adapter = adaptersRef.current[activeAgentId] ?? null;
      return commandRegistry.resolve(input, {
        activeAgentId,
        activeAdapter: adapter,
        projectPath,
        sendRaw: (text: string) => adapter?.sendMessage(text),
        showSystemMessage: (text: string) => {
          addUnifiedMessage({
            id: crypto.randomUUID(),
            type: "system-event",
            eventType: "session_start",
            agentId: activeAgentId,
            timestamp: Date.now(),
            message: text,
          });
        },
        setActiveAgent,
        clearMessages,
        clearUnifiedMessages,
      });
    },
    [activeAgentId, projectPath, addUnifiedMessage, setActiveAgent, clearMessages, clearUnifiedMessages],
  );

  const handleBack = useCallback(() => {
    // Save current state before going back
    if (homeDir && projectPath) {
      const snapshot = buildSessionSnapshot();
      if (snapshot) saveSession(homeDir, projectPath, snapshot);
    }
    setView("list");
  }, [homeDir, projectPath, setView]);

  const handleEndSession = useCallback(() => {
    // Save final state
    if (homeDir && projectPath) {
      const snapshot = buildSessionSnapshot();
      if (snapshot) saveSession(homeDir, projectPath, snapshot);
    }

    // Finalize session memory (auto-extract findings + run promotion)
    const memState = useMemoryStore.getState();
    if (memState.isLoaded && memState.store.metadata.autoMemoryEnabled && activeSession?.id && activeAgentId) {
      const agentSession = useAgentPanelStore.getState().sessions[activeAgentId];
      const msgs = agentSession?.messages || [];
      memState.finalizeCurrentSession(activeSession.id, msgs, activeAgentId)
        .catch(err => console.error("[memory] Session finalization failed:", err));
    }

    // Dispose CLI extractor
    disposeCliExtractor();

    // Dispose all adapters
    for (const adapter of Object.values(adaptersRef.current)) {
      adapter?.dispose();
    }
    adaptersRef.current = {};

    // Clear active session and go back to list
    setActiveSessionStore(null);
    setView("list");
  }, [homeDir, projectPath, setActiveSessionStore, setView]);

  // Debate mode
  const activeDebate = useDebateStore((s) => s.activeDebate);
  const setupOpen = useDebateStore((s) => s.setupOpen);
  const closeSetup = useDebateStore((s) => s.closeSetup);
  const debateOrchestratorRef = useRef<DebateOrchestrator | null>(null);
  const debateConfigRef = useRef<DebateConfig | null>(null);

  /** Called by DebateModeSelector whenever config changes */
  const handleDebateConfigChange = useCallback((config: DebateConfig) => {
    debateConfigRef.current = config;
  }, []);

  /** Actually launch the debate */
  const launchDebate = useCallback(
    async (config: DebateConfig, topic: string) => {
      if (!projectPath || !topic) return;

      const fullConfig: DebateConfig = { ...config, topic };
      useDebateStore.getState().startDebate(fullConfig);
      useDebateStore.getState().closeSetup();
      setInputValue("");

      const modelA = config.modelA ?? selectedModels[config.agentA];
      const modelB = config.modelB ?? selectedModels[config.agentB];

      const orchestrator = new DebateOrchestrator(projectPath, (agentId, msgId) => {
        streamingMsgRef.current[agentId] = msgId ?? undefined;
      });
      debateOrchestratorRef.current = orchestrator;

      try {
        await orchestrator.start(fullConfig, modelA, modelB);
      } catch (err) {
        console.error("Debate error:", err);
      }
    },
    [projectPath, selectedModels, setInputValue],
  );

  /** Wraps normal send — if debate setup is open, launch debate instead of normal send */
  const handleSendWithDebate = useCallback(
    (message: string) => {
      if (setupOpen && debateConfigRef.current) {
        launchDebate(debateConfigRef.current, message);
      } else {
        handleSend(message);
      }
    },
    [setupOpen, launchDebate, handleSend],
  );

  // Dispose orchestrator when debate is cancelled or cleared
  useEffect(() => {
    if (activeDebate?.status === "cancelled" || activeDebate === null) {
      if (debateOrchestratorRef.current) {
        debateOrchestratorRef.current.dispose();
        debateOrchestratorRef.current = null;
      }
    }
  }, [activeDebate?.status, activeDebate]);

  // Cleanup debate orchestrator on unmount
  useEffect(() => {
    return () => {
      debateOrchestratorRef.current?.dispose();
    };
  }, []);

  const currentSession = sessions[activeAgentId];
  const isStreaming = currentSession?.status === "running" || activeDebate?.status === "running";

  // Filter messages for debate tab view
  const displayMessages = activeDebate
    ? activeDebate.activeTab === "unified"
      ? unifiedMessages
      : activeDebate.activeTab === "synthesis"
        ? unifiedMessages.filter((item) => {
            if (!("role" in item)) return false; // Hide dividers in synthesis view
            const msg = item as ChatMessage;
            // Show only the synthesis message
            return msg.id === activeDebate.synthesisMessageId;
          })
        : unifiedMessages.filter((item) => {
            if (!("role" in item)) return true; // Keep dividers
            return (item as ChatMessage).agentId ===
              (activeDebate.activeTab === "a" ? activeDebate.config.agentA : activeDebate.config.agentB);
          })
    : unifiedMessages;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
      }}
    >
      <AgentPanelHeader
        activeAgentId={activeAgentId}
        session={currentSession}
        onClear={handleClear}
        sessionName={activeSession?.name}
        onBack={handleBack}
        onEndSession={handleEndSession}
      />
      {activeDebate && <DebateTabBar />}
      <ChatMessageList messages={displayMessages} />
      {setupOpen && (!activeDebate || activeDebate.status !== "running") && (
        <DebateModeSelector
          onConfigChange={handleDebateConfigChange}
          onClose={closeSetup}
        />
      )}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={handleSendWithDebate}
        onStop={handleStop}
        isStreaming={isStreaming}
        disabled={!projectPath}
        activeAgentId={activeAgentId}
        selectedModel={selectedModels[activeAgentId]}
        onSelectAgent={handleSelectAgent}
        onSelectModel={handleSelectModel}
        onResolveCommand={handleResolveCommand}
        inputMode={inputMode}
        onInputModeChange={setInputMode}
      />
    </div>
  );
}

function TestDisclaimer() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        background: "rgba(234, 179, 8, 0.08)",
        borderBottom: "1px solid rgba(234, 179, 8, 0.2)",
        fontSize: 11,
        color: "#eab308",
        flexShrink: 0,
      }}
    >
      <AlertTriangle size={12} style={{ flexShrink: 0 }} />
      <span>
        Test phase — agents run with permissions auto-skipped. All actions and consequences are the user's responsibility.
      </span>
    </div>
  );
}

export default function AgentChatPanel() {
  const view = useSessionStore((s) => s.view);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <TestDisclaimer />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {view === "list" ? <SessionListView /> : <AgentChatView />}
      </div>
      <CreateSessionDialog />
    </div>
  );
}
