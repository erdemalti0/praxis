import { commandRegistry } from "./commandRegistry";
import type { CommandContext } from "./commandRegistry";
import { ADAPTER_CAPABILITIES } from "../adapters/capabilities";
import type { ChatAgentId } from "../../../types/agentPanel";

/**
 * Register per-adapter CLI commands from the capability registry.
 * These commands are passthrough — they send the slash command directly to the CLI's PTY.
 *
 * Call once at app initialization (after registerBuiltinCommands).
 */
export function registerAdapterCommands(): void {
  const agentIds = Object.keys(ADAPTER_CAPABILITIES) as ChatAgentId[];

  for (const agentId of agentIds) {
    const caps = ADAPTER_CAPABILITIES[agentId];
    for (const slashCmd of caps.slashCommands) {
      // Avoid collisions with Praxis builtins
      const existing = commandRegistry.getMatches(slashCmd.command.replace(/^\//, ""));
      if (existing.some((c) => c.owner === "praxis" && c.name === slashCmd.command.replace(/^\//, ""))) {
        continue;
      }

      commandRegistry.register({
        name: slashCmd.command.replace(/^\//, ""),
        description: slashCmd.description,
        owner: agentId,
        args: slashCmd.args,
        async execute(args: string, context: CommandContext) {
          // Send the original slash command directly to the CLI
          const fullCommand = args ? `${slashCmd.command} ${args}` : slashCmd.command;
          context.sendRaw(fullCommand);
          return true;
        },
      });
    }
  }
}
