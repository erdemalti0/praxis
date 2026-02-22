import type { ChatAgentId } from "../../../types/agentPanel";
import type { AgentAdapter } from "../adapters/base";

export type CommandOwner = "praxis" | ChatAgentId;

export interface CommandDefinition {
  /** The command name without leading slash, e.g. "help" */
  name: string;
  /** Human-readable description */
  description: string;
  /** Who owns this command — "praxis" for local, or an agent ID for CLI-passthrough */
  owner: CommandOwner;
  /** Argument placeholder for display, e.g. "<model-name>" */
  args?: string;
  /** Execute the command. Returns true if handled, false to pass through. */
  execute: (args: string, context: CommandContext) => Promise<boolean>;
}

export interface CommandContext {
  activeAgentId: ChatAgentId;
  activeAdapter: AgentAdapter | null;
  projectPath: string;
  /** Send raw text directly to the active CLI's PTY stdin */
  sendRaw: (text: string) => void;
  /** Show a system message in the chat UI */
  showSystemMessage: (text: string) => void;
  /** Switch the active agent */
  setActiveAgent: (id: ChatAgentId) => void;
  /** Clear messages for a specific agent */
  clearMessages: (agentId: ChatAgentId) => void;
  /** Clear the unified message timeline */
  clearUnifiedMessages: () => void;
}

export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>();

  register(command: CommandDefinition): void {
    this.commands.set(command.name.toLowerCase(), command);
  }

  unregister(name: string): void {
    this.commands.delete(name.toLowerCase());
  }

  getAll(owner?: CommandOwner): CommandDefinition[] {
    const all = Array.from(this.commands.values());
    if (owner) return all.filter((c) => c.owner === owner);
    return all;
  }

  getMatches(prefix: string): CommandDefinition[] {
    const lower = prefix.toLowerCase().replace(/^\//, "");
    if (!lower) return Array.from(this.commands.values());
    return Array.from(this.commands.values()).filter((c) =>
      c.name.toLowerCase().startsWith(lower),
    );
  }

  /**
   * Resolve user input. If it starts with "/", try to match a command.
   *
   * Resolution order:
   * 1. "/raw <text>" — escape hatch, sends <text> directly to PTY
   * 2. Praxis local commands
   * 3. Active adapter's CLI commands
   * 4. Unmatched "/" input — pass through as regular message
   */
  async resolve(
    input: string,
    context: CommandContext,
  ): Promise<{ handled: boolean; passthrough?: string }> {
    const trimmed = input.trim();
    if (!trimmed.startsWith("/")) {
      return { handled: false, passthrough: trimmed };
    }

    // Parse command and args
    const match = trimmed.match(/^\/(\S+)\s*(.*)?$/);
    if (!match) return { handled: false, passthrough: trimmed };

    const [, cmdName, cmdArgs = ""] = match;
    const lower = cmdName.toLowerCase();

    // 1. "/raw" escape hatch
    if (lower === "raw") {
      const rawText = cmdArgs.trim();
      if (rawText) {
        context.sendRaw(rawText);
        return { handled: true };
      }
      context.showSystemMessage("Usage: /raw <text to send directly to CLI>");
      return { handled: true };
    }

    // 2. Look up registered command
    const cmd = this.commands.get(lower);
    if (cmd) {
      // If command belongs to a specific agent, check it's active
      if (cmd.owner !== "praxis" && cmd.owner !== context.activeAgentId) {
        context.showSystemMessage(
          `/${cmd.name} is a ${cmd.owner} command. Switch to ${cmd.owner} first, or use /raw /${cmd.name} ${cmdArgs}`,
        );
        return { handled: true };
      }
      const handled = await cmd.execute(cmdArgs.trim(), context);
      return { handled };
    }

    // 3. Unmatched — pass through as regular message
    return { handled: false, passthrough: trimmed };
  }
}

/** Singleton command registry */
export const commandRegistry = new CommandRegistry();
