import { create } from "zustand";
import type {
  ChatAgentId,
  AgentSession,
  ChatMessage,
  ContentBlock,
  AgentSessionStatus,
  ModelOption,
  UnifiedItem,
  InputMode,
} from "../types/agentPanel";
import type { PersistedSession } from "../types/agentSession";
import { AGENT_CONFIGS } from "../types/agentPanel";
import { invoke } from "../lib/ipc";
import { agentEventBus } from "../lib/eventBus";

export interface DiscoveryMeta {
  source: "live" | "disk-cache" | "fallback";
  fetchedAt: number;
  stale: boolean;
  lastError?: string;
}

export interface AgentAvailability {
  installed: boolean;
  models: ModelOption[];
  meta?: DiscoveryMeta;
}

/** Apply a message transform to the unified list (only affects ChatMessage items with matching id) */
function mapUnified(
  items: UnifiedItem[],
  msgId: string,
  fn: (m: ChatMessage) => ChatMessage,
): UnifiedItem[] {
  return items.map((item) => {
    if ("role" in item && (item as ChatMessage).id === msgId) {
      return fn(item as ChatMessage);
    }
    return item;
  });
}

interface AgentPanelState {
  activeAgentId: ChatAgentId;
  selectedModels: Record<ChatAgentId, string>;
  sessions: Record<ChatAgentId, AgentSession | null>;
  inputValue: string;
  inputMode: InputMode;
  isContextTransferring: boolean;
  agentAvailability: Record<ChatAgentId, AgentAvailability | null>;
  isDiscoveringModels: boolean;
  unifiedMessages: UnifiedItem[];
  sessionBudget: number | null;
  budgetAlertThreshold: number;

  // Budget
  setSessionBudget: (budget: number | null) => void;

  // Navigation
  setActiveAgent: (id: ChatAgentId) => void;
  setSelectedModel: (agentId: ChatAgentId, model: string) => void;

  // Model discovery
  refreshModels: () => Promise<void>;

  // Session lifecycle
  initSession: (id: ChatAgentId, session: AgentSession) => void;
  updateSessionStatus: (id: ChatAgentId, status: AgentSessionStatus) => void;
  updateSessionModel: (id: ChatAgentId, model: string) => void;
  destroySession: (id: ChatAgentId) => void;

  // Messages
  addMessage: (agentId: ChatAgentId, msg: ChatMessage) => void;
  appendBlock: (agentId: ChatAgentId, msgId: string, block: ContentBlock) => void;
  updateLastBlock: (agentId: ChatAgentId, msgId: string, block: ContentBlock) => void;
  updateStreamingBlock: (agentId: ChatAgentId, msgId: string, block: ContentBlock) => void;
  mergeToolResult: (agentId: ChatAgentId, msgId: string, toolUseId: string, output: string, isError?: boolean) => void;
  finalizeMessage: (
    agentId: ChatAgentId,
    msgId: string,
    meta?: { tokensIn?: number; tokensOut?: number; costUsd?: number; durationMs?: number },
  ) => void;
  clearMessages: (agentId: ChatAgentId) => void;

  // Unified messages
  addUnifiedMessage: (item: UnifiedItem) => void;
  clearUnifiedMessages: () => void;

  // Session restore/clear
  restoreSession: (data: PersistedSession) => void;
  clearAllSessions: () => void;

  // Input
  setInputValue: (val: string) => void;
  setInputMode: (mode: InputMode) => void;
  setContextTransferring: (val: boolean) => void;
}

export const useAgentPanelStore = create<AgentPanelState>((set) => ({
  activeAgentId: "claude-code",
  selectedModels: {
    "claude-code": "sonnet",
    opencode: "anthropic/claude-sonnet-4-6-20250620",
    gemini: "gemini-2.5-pro",
    codex: "gpt-5.3-codex",
  },
  sessions: { "claude-code": null, opencode: null, gemini: null, codex: null },
  inputValue: "",
  inputMode: "chat" as InputMode,
  isContextTransferring: false,
  agentAvailability: { "claude-code": null, opencode: null, gemini: null, codex: null },
  isDiscoveringModels: false,
  unifiedMessages: [],
  sessionBudget: null,
  budgetAlertThreshold: 0.8,

  setSessionBudget: (budget) => set({ sessionBudget: budget }),

  setActiveAgent: (id) => set({ activeAgentId: id }),
  setSelectedModel: (agentId, model) =>
    set((s) => ({ selectedModels: { ...s.selectedModels, [agentId]: model } })),

  refreshModels: async () => {
    set({ isDiscoveringModels: true });
    try {
      const result = await invoke<Record<ChatAgentId, AgentAvailability>>("discover_agent_models");
      set((s) => {
        const reconciledModels = { ...s.selectedModels };
        for (const [agentId, availability] of Object.entries(result) as [ChatAgentId, AgentAvailability][]) {
          if (!availability?.models?.length) continue;
          const currentSelection = reconciledModels[agentId];
          const stillExists = availability.models.some((m) => m.id === currentSelection);
          if (!stillExists) {
            const fallbackId = AGENT_CONFIGS[agentId].defaultModel;
            const defaultExists = availability.models.some((m) => m.id === fallbackId);
            reconciledModels[agentId] = defaultExists ? fallbackId : availability.models[0].id;
            console.warn(
              `[Models] Selected model "${currentSelection}" for ${agentId} no longer available, falling back to "${reconciledModels[agentId]}"`,
            );
          }
        }
        return {
          agentAvailability: result,
          selectedModels: reconciledModels,
          isDiscoveringModels: false,
        };
      });
    } catch {
      set({ isDiscoveringModels: false });
    }
  },

  initSession: (id, session) =>
    set((s) => ({
      sessions: { ...s.sessions, [id]: session },
    })),

  updateSessionStatus: (id, status) =>
    set((s) => {
      const session = s.sessions[id];
      if (!session) return s;
      return { sessions: { ...s.sessions, [id]: { ...session, status } } };
    }),

  updateSessionModel: (id, model) =>
    set((s) => {
      const session = s.sessions[id];
      if (!session) return s;
      return { sessions: { ...s.sessions, [id]: { ...session, model } } };
    }),

  destroySession: (id) =>
    set((s) => ({
      sessions: { ...s.sessions, [id]: null },
    })),

  addMessage: (agentId, msg) =>
    set((s) => {
      const session = s.sessions[agentId];
      if (!session) return s;
      return {
        sessions: {
          ...s.sessions,
          [agentId]: { ...session, messages: [...session.messages, msg] },
        },
        unifiedMessages: [...s.unifiedMessages, msg],
      };
    }),

  appendBlock: (agentId, msgId, block) =>
    set((s) => {
      const session = s.sessions[agentId];
      if (!session) return s;
      const transform = (m: ChatMessage): ChatMessage => ({ ...m, blocks: [...m.blocks, block] });
      const messages = session.messages.map((m) => (m.id === msgId ? transform(m) : m));
      return {
        sessions: { ...s.sessions, [agentId]: { ...session, messages } },
        unifiedMessages: mapUnified(s.unifiedMessages, msgId, transform),
      };
    }),

  updateLastBlock: (agentId, msgId, block) =>
    set((s) => {
      const session = s.sessions[agentId];
      if (!session) return s;
      const transform = (m: ChatMessage): ChatMessage => {
        const blocks = [...m.blocks];
        if (blocks.length > 0) {
          blocks[blocks.length - 1] = block;
        } else {
          blocks.push(block);
        }
        return { ...m, blocks };
      };
      const messages = session.messages.map((m) => (m.id === msgId ? transform(m) : m));
      return {
        sessions: { ...s.sessions, [agentId]: { ...session, messages } },
        unifiedMessages: mapUnified(s.unifiedMessages, msgId, transform),
      };
    }),

  updateStreamingBlock: (agentId, msgId, block) =>
    set((s) => {
      const session = s.sessions[agentId];
      if (!session) return s;
      const transform = (m: ChatMessage): ChatMessage => {
        const blocks = [...m.blocks];
        // Find last block of same type and replace it
        let lastIdx = -1;
        for (let i = blocks.length - 1; i >= 0; i--) {
          if (blocks[i].type === block.type) { lastIdx = i; break; }
        }
        if (lastIdx >= 0) {
          blocks[lastIdx] = block;
        } else {
          blocks.push(block);
        }
        return { ...m, blocks };
      };
      const messages = session.messages.map((m) => (m.id === msgId ? transform(m) : m));
      return {
        sessions: { ...s.sessions, [agentId]: { ...session, messages } },
        unifiedMessages: mapUnified(s.unifiedMessages, msgId, transform),
      };
    }),

  mergeToolResult: (agentId, msgId, toolUseId, output, isError) =>
    set((s) => {
      const session = s.sessions[agentId];
      if (!session) return s;
      const transform = (m: ChatMessage): ChatMessage => {
        const blocks = [...m.blocks];
        for (let i = blocks.length - 1; i >= 0; i--) {
          const b = blocks[i];
          if (b.type === "tool_use" && b.id === toolUseId) {
            blocks[i] = { ...b, input: { ...b.input, _result: output, _isError: isError } };
            return { ...m, blocks };
          }
          if (b.type === "bash_command" && !b.output) {
            blocks[i] = { ...b, output, exitCode: isError ? 1 : 0 };
            return { ...m, blocks };
          }
          if (b.type === "file_read" && !b.content) {
            blocks[i] = { ...b, content: output };
            return { ...m, blocks };
          }
        }
        return m;
      };
      const messages = session.messages.map((m) => (m.id === msgId ? transform(m) : m));
      return {
        sessions: { ...s.sessions, [agentId]: { ...session, messages } },
        unifiedMessages: mapUnified(s.unifiedMessages, msgId, transform),
      };
    }),

  finalizeMessage: (agentId, msgId, meta) =>
    set((s) => {
      const session = s.sessions[agentId];
      if (!session) return s;
      const transform = (m: ChatMessage): ChatMessage => ({ ...m, isStreaming: false, ...meta });
      const messages = session.messages.map((m) => (m.id === msgId ? transform(m) : m));
      const totalCost = session.totalCost + (meta?.costUsd ?? 0);
      const totalTokensIn = session.totalTokensIn + (meta?.tokensIn ?? 0);
      const totalTokensOut = session.totalTokensOut + (meta?.tokensOut ?? 0);

      // 3e: Budget alert check across all sessions
      if (s.sessionBudget !== null) {
        let globalCost = totalCost; // include this session's updated cost
        for (const [id, sess] of Object.entries(s.sessions)) {
          if (!sess || id === agentId) continue;
          globalCost += sess.totalCost;
        }
        if (globalCost > s.sessionBudget * s.budgetAlertThreshold) {
          agentEventBus.emit({
            type: "error",
            agentId,
            timestamp: Date.now(),
            payload: {
              error: `Budget warning: session cost $${globalCost.toFixed(4)} exceeds ${Math.round(s.budgetAlertThreshold * 100)}% of budget $${s.sessionBudget.toFixed(4)}`,
            },
          });
        }
      }

      return {
        sessions: {
          ...s.sessions,
          [agentId]: { ...session, messages, totalCost, totalTokensIn, totalTokensOut, status: "idle" },
        },
        unifiedMessages: mapUnified(s.unifiedMessages, msgId, transform),
      };
    }),

  clearMessages: (agentId) =>
    set((s) => {
      const session = s.sessions[agentId];
      if (!session) return s;
      return {
        sessions: {
          ...s.sessions,
          [agentId]: { ...session, messages: [], totalCost: 0, totalTokensIn: 0, totalTokensOut: 0 },
        },
      };
    }),

  addUnifiedMessage: (item) =>
    set((s) => ({ unifiedMessages: [...s.unifiedMessages, item] })),

  clearUnifiedMessages: () => set({ unifiedMessages: [] }),

  restoreSession: (data) =>
    set(() => {
      const sessions: Record<ChatAgentId, AgentSession | null> = {
        "claude-code": null,
        opencode: null,
        gemini: null,
        codex: null,
      };
      for (const [agentId, agentData] of Object.entries(data.agentMessages)) {
        if (!agentData) continue;
        sessions[agentId as ChatAgentId] = {
          agentId: agentId as ChatAgentId,
          ptySessionId: "",
          status: "idle",
          messages: agentData.messages.map((m) => ({ ...m, isStreaming: false })),
          totalCost: agentData.totalCost,
          totalTokensIn: agentData.totalTokensIn,
          totalTokensOut: agentData.totalTokensOut,
        };
      }
      return {
        activeAgentId: data.activeAgentId,
        selectedModels: data.selectedModels,
        sessions,
        unifiedMessages: data.unifiedMessages,
      };
    }),

  clearAllSessions: () =>
    set({
      sessions: { "claude-code": null, opencode: null, gemini: null, codex: null },
      unifiedMessages: [],
      inputValue: "",
    }),

  setInputValue: (val) => set({ inputValue: val }),
  setInputMode: (mode) => set({ inputMode: mode }),
  setContextTransferring: (val) => set({ isContextTransferring: val }),
}));

// ─── Non-reactive helpers (single source of truth for model lists) ───

/** Get the model list for an agent: discovered models with AGENT_CONFIGS fallback. */
export function getModelsForAgent(agentId: ChatAgentId): ModelOption[] {
  const availability = useAgentPanelStore.getState().agentAvailability[agentId];
  return availability?.models ?? AGENT_CONFIGS[agentId].models;
}

/** Resolve a model ID to its CLI value for a given agent. */
export function resolveModelCliValue(agentId: ChatAgentId, modelId: string): string {
  const models = getModelsForAgent(agentId);
  return models.find((m) => m.id === modelId)?.cliValue ?? modelId;
}
