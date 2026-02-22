import type { ChatAgentId } from "./agentPanel";

/**
 * Static capability descriptor for each CLI adapter.
 * Populated from canary test results (Phase 2.1).
 */
export interface AdapterCapabilities {
  agentId: ChatAgentId;
  /** Whether the CLI supports --resume / --session for conversation continuity */
  supportsSessionResume: boolean;
  /** CLI flag to skip permission prompts (null if unsupported) */
  permissionSkipFlag: string | null;
  /** Whether the CLI emits compaction/context boundary signals */
  emitsCompactionSignal: boolean;
  /** Whether the CLI supports token-level streaming deltas */
  supportsStreamingDeltas: boolean;
  /** Slash commands supported by this CLI */
  slashCommands: SlashCommandDef[];
  /** Patterns for detecting interactive permission prompts in raw PTY output */
  interactivePromptPatterns: InteractivePromptPattern[];
}

export interface SlashCommandDef {
  /** The command name, e.g. "/model" */
  command: string;
  /** Human-readable description */
  description: string;
  /** Argument placeholder, e.g. "<model-name>" */
  args?: string;
}

export interface InteractivePromptPattern {
  /** Unique identifier for this pattern */
  id: string;
  /** Regex to match against raw PTY output */
  pattern: RegExp;
  /** Human-readable description of when this prompt appears */
  description: string;
  /** Type of response expected */
  responseType: "yes_no" | "choice" | "freeform";
  /** Auto-response when in auto-accept mode (if applicable) */
  autoResponse?: string;
}
