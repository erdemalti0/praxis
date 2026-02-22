import { invoke, listen } from "../../ipc";
import { JsonlParser } from "../parsers/jsonlParser";
import { parseCodexEvent } from "../parsers/codexEventParser";
import type { ContentBlock } from "../../../types/agentPanel";
import type {
  AgentAdapter,
  AgentPermissionMode,
  LifecycleCallback,
  ContentBlockCallback,
  StreamingTextCallback,
  StreamingThinkingCallback,
  ToolResultCallback,
  MessageCompleteCallback,
  ErrorCallback,
  StatusCallback,
} from "./base";

/**
 * Codex CLI Adapter
 *
 * Uses per-message invocation pattern (same as Claude Code adapter):
 * - First message: `codex exec "msg" --json --full-auto`
 * - Subsequent messages: `codex exec resume <thread-id> "msg" --json --full-auto`
 *
 * Each message spawns a new PTY process. The session is preserved via Codex's
 * built-in thread persistence (thread_id from first response).
 */
export class CodexAdapter implements AgentAdapter {
  readonly agentId = "codex" as const;

  private cwd: string = "";
  private model?: string;
  private threadId: string | null = null;
  private activePtyId: string | null = null;
  private rawOutput: string = "";
  private parser: JsonlParser | null = null;
  private unlistenOutput: (() => void) | null = null;
  private unlistenExit: (() => void) | null = null;
  private currentMessageId: string | null = null;
  private isFirstMessage = true;
  private lastMessageText: string | null = null;
  private lastModel: string | undefined = undefined;
  private permissionMode: AgentPermissionMode = "auto-accept";

  private lifecycleCbs: LifecycleCallback[] = [];
  private contentBlockCbs: ContentBlockCallback[] = [];
  private streamingTextCbs: StreamingTextCallback[] = [];
  private streamingThinkingCbs: StreamingThinkingCallback[] = [];
  private toolResultCbs: ToolResultCallback[] = [];
  private messageCompleteCbs: MessageCompleteCallback[] = [];
  private errorCbs: ErrorCallback[] = [];
  private statusCbs: StatusCallback[] = [];

  constructor(permissionMode: AgentPermissionMode = "auto-accept") {
    this.permissionMode = permissionMode;
  }

  onLifecycleEvent(cb: LifecycleCallback) {
    this.lifecycleCbs.push(cb);
  }
  onContentBlock(cb: ContentBlockCallback) {
    this.contentBlockCbs.push(cb);
  }
  onStreamingText(cb: StreamingTextCallback) {
    this.streamingTextCbs.push(cb);
  }
  onStreamingThinking(cb: StreamingThinkingCallback) {
    this.streamingThinkingCbs.push(cb);
  }
  onToolResult(cb: ToolResultCallback) {
    this.toolResultCbs.push(cb);
  }
  onMessageComplete(cb: MessageCompleteCallback) {
    this.messageCompleteCbs.push(cb);
  }
  onError(cb: ErrorCallback) {
    this.errorCbs.push(cb);
  }
  onStatusChange(cb: StatusCallback) {
    this.statusCbs.push(cb);
  }

  async spawn(cwd: string, model?: string): Promise<{ ptySessionId: string; pid?: number }> {
    this.cwd = cwd;
    this.model = model;
    this.emitStatus("idle");
    // Don't spawn yet — PTY is created per-message
    return { ptySessionId: `agent-codex-${crypto.randomUUID()}`, pid: undefined };
  }

  sendMessage(message: string, model?: string): void {
    if (!this.cwd) return;
    this.lastMessageText = message;
    this.lastModel = model ?? this.model;
    if (model) this.model = model;
    this.currentMessageId = crypto.randomUUID();
    this.emitStatus("running");
    this.spawnForMessage(message).catch((err) => {
      this.emitError(`Failed to spawn Codex: ${err}`);
      this.emitStatus("error");
    });
  }

  resendLastMessage(): boolean {
    if (!this.lastMessageText) return false;
    this.sendMessage(this.lastMessageText, this.lastModel);
    return true;
  }

  getLastMessage(): string | undefined {
    return this.lastMessageText ?? undefined;
  }

  private async spawnForMessage(message: string): Promise<void> {
    // Cleanup previous PTY if still around
    this.cleanupPty();

    const ptyId = crypto.randomUUID();
    this.activePtyId = ptyId;

    // Set up parser
    this.parser = new JsonlParser((event) => this.handleEvent(event));

    this.rawOutput = "";
    this.unlistenOutput = listen(`pty-output-${ptyId}`, (data: string) => {
      this.rawOutput += data;
      this.parser?.feed(data);
    });

    this.unlistenExit = listen(`pty-exit-${ptyId}`, (info: { exitCode: number; signal?: number }) => {
      this.parser?.flush();

      // If we haven't received a "turn.completed" event, finalize the message
      if (this.currentMessageId) {
        if (info.exitCode !== 0) {
          const rawMsg = this.rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "").trim();
          const errorDetail = rawMsg
            ? `Codex exited with code ${info.exitCode}:\n${rawMsg.slice(0, 2000)}`
            : `Codex exited with code ${info.exitCode}`;
          console.error("[AgentPanel] Codex error output:", rawMsg);
          this.emitContentBlock({ type: "error", message: errorDetail }, this.currentMessageId);
        }
        this.emitMessageComplete(this.currentMessageId, {});
        this.currentMessageId = null;
      }
      this.emitStatus("idle");
      this.cleanupPty();
    });

    // Build args for codex CLI
    const args: string[] = ["exec"];

    if (!this.isFirstMessage && this.threadId) {
      args.push("resume", this.threadId);
    }

    // Message goes as the prompt argument (read from stdin via -)
    args.push(message);

    args.push(
      "--json",
      "--skip-git-repo-check",
    );

    if (this.permissionMode === "auto-accept") {
      args.push("--full-auto");
    }

    if (this.model) {
      args.push("--model", this.model);
    }

    await invoke<{ id: string; cwd: string; pid?: number }>("spawn_pty", {
      id: ptyId,
      cmd: "codex",
      args,
      cwd: this.cwd,
    });
  }

  private handleEvent(raw: unknown): void {
    const parsed = parseCodexEvent(raw);

    switch (parsed.kind) {
      case "init": {
        // Capture thread ID from first response for session continuity
        if (parsed.threadId) {
          this.threadId = parsed.threadId;
          this.isFirstMessage = false;
        }
        break;
      }

      case "thinking": {
        const msgId = this.currentMessageId;
        if (!msgId || !parsed.text) break;
        this.emitContentBlock({ type: "thinking", text: parsed.text }, msgId);
        break;
      }

      case "text": {
        const msgId = this.currentMessageId;
        if (!msgId || !parsed.text) break;
        this.emitContentBlock({ type: "text", text: parsed.text }, msgId);
        break;
      }

      case "command_start": {
        // Don't emit on start — wait for command_complete to avoid duplicate blocks
        break;
      }

      case "command_complete": {
        const msgId = this.currentMessageId;
        if (!msgId) break;
        // Strip shell wrapper from command display
        // Codex wraps commands in `/bin/zsh -lc "..."` — extract inner command
        let displayCmd = parsed.command || "";
        const shellWrap = displayCmd.match(/^\/bin\/(?:zsh|bash|sh)\s+-\w+\s+["'](.+)["']$/s);
        if (shellWrap) {
          displayCmd = shellWrap[1];
        }
        this.emitContentBlock(
          {
            type: "bash_command",
            command: displayCmd,
            output: parsed.commandOutput || "",
            exitCode: parsed.exitCode ?? undefined,
          },
          msgId,
        );
        break;
      }

      case "result": {
        const msgId = this.currentMessageId;
        if (!msgId) break;
        this.emitMessageComplete(msgId, {
          tokensIn: parsed.meta?.tokensIn,
          tokensOut: parsed.meta?.tokensOut,
        });
        this.currentMessageId = null;
        this.emitStatus("idle");
        break;
      }

      case "error": {
        const msgId = this.currentMessageId;
        if (msgId && parsed.errorMessage) {
          this.emitContentBlock({ type: "error", message: parsed.errorMessage }, msgId);
        }
        break;
      }

      case "unknown":
        break;
    }
  }

  private cleanupPty(): void {
    this.unlistenOutput?.();
    this.unlistenOutput = null;
    this.unlistenExit?.();
    this.unlistenExit = null;
    if (this.activePtyId) {
      invoke("close_pty", { id: this.activePtyId }).catch(() => {});
      this.activePtyId = null;
    }
    this.parser?.reset();
    this.parser = null;
  }

  getConversationSummary(): string {
    return "";
  }

  kill(): void {
    this.cleanupPty();
    this.emitStatus("stopped");
  }

  dispose(): void {
    this.kill();
    this.lifecycleCbs = [];
    this.contentBlockCbs = [];
    this.streamingTextCbs = [];
    this.streamingThinkingCbs = [];
    this.toolResultCbs = [];
    this.messageCompleteCbs = [];
    this.errorCbs = [];
    this.statusCbs = [];
  }

  private emitContentBlock(block: ContentBlock, messageId: string) {
    for (const cb of this.contentBlockCbs) cb(block, messageId);
  }
  private emitMessageComplete(messageId: string, meta: Parameters<MessageCompleteCallback>[1]) {
    for (const cb of this.messageCompleteCbs) cb(messageId, meta);
  }
  private emitError(error: string) {
    for (const cb of this.errorCbs) cb(error);
  }
  private emitStatus(status: Parameters<StatusCallback>[0]) {
    for (const cb of this.statusCbs) cb(status);
  }
}
