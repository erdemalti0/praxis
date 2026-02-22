import type { ChatAgentId } from "../../../types/agentPanel";
import type { AdapterCapabilities } from "../../../types/adapterCapabilities";

/**
 * Static capability registry for each CLI adapter.
 *
 * Values populated from Phase 2.1 canary test results.
 * Re-run `scripts/canary-test.ts` after CLI version updates to refresh.
 */
export const ADAPTER_CAPABILITIES: Record<ChatAgentId, AdapterCapabilities> = {
  "claude-code": {
    agentId: "claude-code",
    supportsSessionResume: true,
    permissionSkipFlag: "--dangerously-skip-permissions",
    emitsCompactionSignal: true,
    supportsStreamingDeltas: true,
    slashCommands: [
      { command: "/model", description: "Switch model mid-conversation", args: "<model-name>" },
      { command: "/clear", description: "Clear conversation context" },
      { command: "/compact", description: "Force context compaction" },
      { command: "/help", description: "Show available commands" },
      { command: "/cost", description: "Show session cost summary" },
    ],
    interactivePromptPatterns: [
      {
        id: "claude-permission-tool",
        pattern: /Do you want to allow .+\? \(y\/n\)/,
        description: "Tool execution permission prompt",
        responseType: "yes_no",
        autoResponse: "y",
      },
    ],
  },

  codex: {
    agentId: "codex",
    supportsSessionResume: true,
    permissionSkipFlag: "--full-auto",
    emitsCompactionSignal: false,
    supportsStreamingDeltas: false,
    slashCommands: [],
    interactivePromptPatterns: [],
  },

  gemini: {
    agentId: "gemini",
    supportsSessionResume: true,
    permissionSkipFlag: "-y",
    emitsCompactionSignal: false,
    supportsStreamingDeltas: true,
    slashCommands: [],
    interactivePromptPatterns: [],
  },

  opencode: {
    agentId: "opencode",
    supportsSessionResume: true,
    permissionSkipFlag: null, // TBD — canary testing needed
    emitsCompactionSignal: false,
    supportsStreamingDeltas: false,
    slashCommands: [],
    interactivePromptPatterns: [],
  },
};
