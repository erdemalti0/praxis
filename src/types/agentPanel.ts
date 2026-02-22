import claudeLogo from "../assets/logos/claude.png";
import opencodeLogo from "../assets/logos/opencode.svg";
import codexLogo from "../assets/logos/codex.svg";
import geminiLogo from "../assets/logos/gemini.svg";

export type ChatAgentId = "claude-code" | "opencode" | "gemini" | "codex";

export type ChatMessageRole = "user" | "assistant" | "system";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string; collapsed?: boolean }
  | { type: "tool_use"; tool: string; input: Record<string, unknown>; id?: string }
  | { type: "tool_result"; toolUseId: string; output: string; isError?: boolean }
  | { type: "file_edit"; path: string; diff: string; language?: string }
  | { type: "file_write"; path: string; content: string; language?: string }
  | { type: "file_read"; path: string; content: string; lineCount?: number }
  | { type: "bash_command"; command: string; output?: string; exitCode?: number }
  | { type: "error"; message: string };

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  blocks: ContentBlock[];
  timestamp: number;
  agentId: ChatAgentId;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  durationMs?: number;
  isStreaming?: boolean;
  contextInjectionTokens?: number;
}

export type AgentSessionStatus = "idle" | "running" | "error" | "starting" | "stopped";

export interface AgentSession {
  agentId: ChatAgentId;
  ptySessionId: string;
  status: AgentSessionStatus;
  model?: string;
  messages: ChatMessage[];
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  lastError?: string;
  pid?: number;
}

export interface ModelOption {
  id: string;
  label: string;
  /** How the model is passed to the CLI (may differ from display id) */
  cliValue: string;
}

export interface AgentConfig {
  id: ChatAgentId;
  label: string;
  shortLabel: string;
  color: string;
  logo?: string;
  defaultModel: string;
  models: ModelOption[];
}

export interface AgentSwitchDivider {
  id: string;
  type: "agent-switch";
  fromAgent: ChatAgentId;
  toAgent: ChatAgentId;
  timestamp: number;
}

export interface SystemEventItem {
  id: string;
  type: "system-event";
  eventType: "compaction" | "session_start" | "session_end" | "token_warning";
  agentId: ChatAgentId;
  timestamp: number;
  message: string;
}

export type UnifiedItem = ChatMessage | AgentSwitchDivider | SystemEventItem;

export type InputMode = "chat" | "plan" | "build";

export const AGENT_CONFIGS: Record<ChatAgentId, AgentConfig> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    shortLabel: "Claude",
    color: "#d97706",
    logo: claudeLogo,
    defaultModel: "sonnet",
    models: [
      { id: "opus", label: "Claude Opus 4.6", cliValue: "opus" },
      { id: "sonnet", label: "Claude Sonnet 4.6", cliValue: "sonnet" },
      { id: "haiku", label: "Claude Haiku 4.5", cliValue: "haiku" },
    ],
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    shortLabel: "OpenCode",
    color: "#22c55e",
    logo: opencodeLogo,
    defaultModel: "anthropic/claude-sonnet-4-6-20250620",
    models: [
      { id: "anthropic/claude-sonnet-4-6-20250620", label: "Claude Sonnet 4.6", cliValue: "anthropic/claude-sonnet-4-6-20250620" },
      { id: "openai/gpt-4.1", label: "GPT-4.1", cliValue: "openai/gpt-4.1" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", cliValue: "google/gemini-2.5-pro" },
    ],
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    shortLabel: "Gemini",
    color: "#3b82f6",
    logo: geminiLogo,
    defaultModel: "gemini-2.5-pro",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", cliValue: "gemini-2.5-pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", cliValue: "gemini-2.5-flash" },
      { id: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview", cliValue: "gemini-3-pro-preview" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", cliValue: "gemini-3-flash-preview" },
    ],
  },
  codex: {
    id: "codex",
    label: "Codex CLI",
    shortLabel: "Codex",
    color: "#10b981",
    logo: codexLogo,
    defaultModel: "gpt-5.3-codex",
    models: [
      { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", cliValue: "gpt-5.3-codex" },
      { id: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max", cliValue: "gpt-5.1-codex-max" },
      { id: "gpt-5.1-codex", label: "GPT-5.1 Codex", cliValue: "gpt-5.1-codex" },
      { id: "gpt-5-codex", label: "GPT-5 Codex", cliValue: "gpt-5-codex" },
      { id: "gpt-5-codex-mini", label: "GPT-5 Codex Mini", cliValue: "gpt-5-codex-mini" },
    ],
  },
};
