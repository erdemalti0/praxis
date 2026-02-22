import type { ChatAgentId } from "./agentPanel";

/** The three debate modes users can choose from */
export type DebateMode = "side-by-side" | "sequential" | "multi-round";

/** Configuration for a debate session */
export interface DebateConfig {
  mode: DebateMode;
  agentA: ChatAgentId;
  agentB: ChatAgentId;
  /** Number of rounds for multi-round mode (default: 3) */
  rounds: number;
  /** The initial prompt / question from the user */
  topic: string;
  /** Model CLI value for Agent A (optional, uses agent default if omitted) */
  modelA?: string;
  /** Model CLI value for Agent B (optional, uses agent default if omitted) */
  modelB?: string;
}

export type DebateRoundStatus =
  | "pending"
  | "agent-a-running"
  | "agent-b-running"
  | "synthesizing"
  | "complete";

/** Tracks progress of a single debate round */
export interface DebateRound {
  roundNumber: number;
  agentAMessageId: string | null;
  agentBMessageId: string | null;
  status: DebateRoundStatus;
}

export type DebateSessionStatus = "setup" | "running" | "complete" | "error" | "cancelled";

/** Full state of an active debate */
export interface DebateSession {
  id: string;
  config: DebateConfig;
  rounds: DebateRound[];
  status: DebateSessionStatus;
  activeTab: "a" | "b" | "unified" | "synthesis";
  currentRound: number;
  error?: string;
  /** Message ID of the synthesis/consensus output (added after all rounds) */
  synthesisMessageId?: string;
  /** Which agent produced the synthesis */
  synthesisAgentId?: ChatAgentId;
}

/** Divider inserted into unified messages between debate rounds */
export interface DebateRoundDivider {
  id: string;
  type: "debate-round";
  roundNumber: number;
  debateSessionId: string;
  timestamp: number;
}
