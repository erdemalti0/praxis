import { commandRegistry } from "./commandRegistry";
import type { CommandContext } from "./commandRegistry";
import { AGENT_CONFIGS } from "../../../types/agentPanel";
import type { ChatAgentId } from "../../../types/agentPanel";
import { executeRemember, executeForget, executePin, executeMemoryCommand } from "../../memory/commands";

/**
 * Register all Praxis-native commands.
 * Call once at app initialization.
 */
export function registerBuiltinCommands(): void {
  commandRegistry.register({
    name: "help",
    description: "List all available commands",
    owner: "praxis",
    async execute(_args: string, context: CommandContext) {
      const all = commandRegistry.getAll();
      const lines = ["**Available Commands:**", ""];

      const vpCmds = all.filter((c) => c.owner === "praxis");
      if (vpCmds.length > 0) {
        lines.push("*Praxis:*");
        for (const cmd of vpCmds) {
          lines.push(`  /${cmd.name}${cmd.args ? " " + cmd.args : ""} — ${cmd.description}`);
        }
        lines.push("");
      }

      const agentCmds = all.filter((c) => c.owner !== "praxis");
      if (agentCmds.length > 0) {
        lines.push("*Agent Commands:*");
        for (const cmd of agentCmds) {
          const label = AGENT_CONFIGS[cmd.owner as ChatAgentId]?.shortLabel ?? cmd.owner;
          lines.push(`  /${cmd.name}${cmd.args ? " " + cmd.args : ""} — ${cmd.description} [${label}]`);
        }
        lines.push("");
      }

      lines.push("  /raw <text> — Send text directly to CLI (escape hatch)");

      context.showSystemMessage(lines.join("\n"));
      return true;
    },
  });

  commandRegistry.register({
    name: "switch",
    description: "Switch active agent",
    owner: "praxis",
    args: "<agent>",
    async execute(args: string, context: CommandContext) {
      const target = args.trim().toLowerCase();
      const agentIds = Object.keys(AGENT_CONFIGS) as ChatAgentId[];
      const matched = agentIds.find(
        (id) =>
          id === target ||
          AGENT_CONFIGS[id].label.toLowerCase() === target ||
          AGENT_CONFIGS[id].shortLabel.toLowerCase() === target,
      );

      if (!matched) {
        context.showSystemMessage(
          `Unknown agent: "${args}". Available: ${agentIds.map((id) => AGENT_CONFIGS[id].shortLabel).join(", ")}`,
        );
        return true;
      }

      if (matched === context.activeAgentId) {
        context.showSystemMessage(`Already using ${AGENT_CONFIGS[matched].label}`);
        return true;
      }

      context.setActiveAgent(matched);
      context.showSystemMessage(`Switched to ${AGENT_CONFIGS[matched].label}`);
      return true;
    },
  });

  commandRegistry.register({
    name: "clear",
    description: "Clear conversation messages",
    owner: "praxis",
    async execute(_args: string, context: CommandContext) {
      context.clearMessages(context.activeAgentId);
      context.clearUnifiedMessages();
      context.showSystemMessage("Conversation cleared.");
      return true;
    },
  });

  commandRegistry.register({
    name: "budget",
    description: "Set session cost budget",
    owner: "praxis",
    args: "<amount-usd>",
    async execute(_args: string, context: CommandContext) {
      context.showSystemMessage("Budget management coming soon. Track costs in the session header.");
      return true;
    },
  });

  // ─── Memory Commands ────────────────────────────────────────────────

  commandRegistry.register({
    name: "remember",
    description: "Save knowledge to project memory",
    owner: "praxis",
    args: "<text>",
    async execute(args: string, context: CommandContext) {
      return executeRemember(args, context);
    },
  });

  commandRegistry.register({
    name: "memory",
    description: "Memory system commands",
    owner: "praxis",
    args: "<status|list|search|budget|alias>",
    async execute(args: string, context: CommandContext) {
      return executeMemoryCommand(args, context);
    },
  });

  commandRegistry.register({
    name: "forget",
    description: "Remove entry from project memory",
    owner: "praxis",
    args: "<keyword or id>",
    async execute(args: string, context: CommandContext) {
      return executeForget(args, context);
    },
  });

  commandRegistry.register({
    name: "pin",
    description: "Pin/unpin memory entry for always-inject",
    owner: "praxis",
    args: "<keyword or id>",
    async execute(args: string, context: CommandContext) {
      return executePin(args, context);
    },
  });
}
