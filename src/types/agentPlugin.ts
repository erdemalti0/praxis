import type { ModelOption } from "./agentPanel";

/**
 * Plugin manifest for defining custom agent integrations.
 * Loaded from ~/.praxis/agents/<plugin-id>.json
 */
export interface AgentPlugin {
  /** Unique identifier for this agent (e.g., "my-custom-agent") */
  id: string;
  /** Display name (e.g., "My Custom Agent") */
  label: string;
  /** Short label for compact UI (e.g., "Custom") */
  shortLabel: string;
  /** Brand color in hex (e.g., "#ff6600") */
  color: string;
  /** CLI command to execute (e.g., "my-agent") */
  command: string;
  /** CLI arguments template. Placeholders: {message}, {sessionId}, {model} */
  argsTemplate: string[];
  /** Output format: "stream-json" (JSONL) or "text" (plain text) */
  outputFormat: "stream-json" | "text";
  /** Available models */
  models: ModelOption[];
  /** Default model ID */
  defaultModel: string;
  /** Optional: flag for session resume (e.g., "--resume") */
  resumeFlag?: string;
  /** Optional: flag for model selection (e.g., "--model") */
  modelFlag?: string;
}

/**
 * Loaded plugin with resolved metadata.
 */
export interface LoadedPlugin extends AgentPlugin {
  /** File path of the manifest */
  manifestPath: string;
}
