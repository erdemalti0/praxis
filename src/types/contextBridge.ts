import type { ChatAgentId } from "./agentPanel";

export type ContextCategory =
  | "discovery"
  | "decision"
  | "file_change"
  | "error"
  | "architecture"
  | "task_progress"
  | "general";

export interface ContextEntry {
  id: string;
  sourceAgent: ChatAgentId;
  sourceMessageId: string;
  timestamp: number;
  category: ContextCategory;
  content: string;
  relevance: number;
  filePaths?: string[];
}

export interface ExtractionResult {
  entries: Omit<ContextEntry, "id" | "timestamp">[];
}
