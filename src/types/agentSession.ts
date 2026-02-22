import type { ChatAgentId, UnifiedItem, ChatMessage } from "./agentPanel";
import type { ContextEntry } from "./contextBridge";

export interface ExtractorConfig {
  agentId: ChatAgentId;
  model: string;
}

export interface PersistedAgentData {
  messages: ChatMessage[];
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface PersistedSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeAgentId: ChatAgentId;
  selectedModels: Record<ChatAgentId, string>;
  unifiedMessages: UnifiedItem[];
  agentMessages: Partial<Record<ChatAgentId, PersistedAgentData>>;
  contextEntries: ContextEntry[];
  extractorConfig: ExtractorConfig;
  parentSessionId?: string;
  forkPointMessageId?: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  totalCost: number;
  agentsUsed: ChatAgentId[];
}
