import { invoke, listen } from "../../ipc";
import { JsonlParser } from "../parsers/jsonlParser";
import { parseClaudeEvent } from "../parsers/claudeEventParser";
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
 * Claude Code Adapter
 *
 * Uses per-message invocation pattern:
 * - First message: `claude -p "msg" --output-format stream-json --session-id <uuid>`
 * - Subsequent messages: `claude -p "msg" --output-format stream-json --resume <session-id>`
 *
 * Each message spawns a new PTY process. The session is preserved via Claude Code's
 * built-in session persistence (--session-id / --resume flags).
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  readonly agentId = "claude-code" as const;

  private cwd: string = "";
  private model?: string;
  private sessionId: string;
  private activePtyId: string | null = null;
  private rawOutput: string = "";
  private parser: JsonlParser | null = null;
  private streamingText: string = "";
  private streamingThinking: string = "";
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
    this.sessionId = crypto.randomUUID();
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
    return { ptySessionId: `agent-claude-${this.sessionId}`, pid: undefined };
  }

  sendMessage(message: string, model?: string): void {
    if (!this.cwd) return;
    this.lastMessageText = message;
    this.lastModel = model ?? this.model;
    if (model) this.model = model;
    this.currentMessageId = crypto.randomUUID();
    this.emitStatus("running");
    this.spawnForMessage(message).catch((err) => {
      this.emitError(`Failed to spawn Claude Code: ${err}`);
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
      // PTY exited — this is normal for per-message pattern
      this.parser?.flush();

      // If we haven't received a "result" event, finalize the message
      if (this.currentMessageId) {
        if (info.exitCode !== 0) {
          // Show raw output for debugging
          // Strip ANSI escape codes from raw output
          const rawMsg = this.rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "").trim();
          const errorDetail = rawMsg
            ? `Claude Code exited with code ${info.exitCode}:\n${rawMsg.slice(0, 2000)}`
            : `Claude Code exited with code ${info.exitCode}`;
          console.error("[AgentPanel] Claude Code error output:", rawMsg);
          this.emitContentBlock({ type: "error", message: errorDetail }, this.currentMessageId);
        }
        this.emitMessageComplete(this.currentMessageId, {});
        this.currentMessageId = null;
      }
      this.emitStatus("idle");
      this.cleanupPty();
    });

    // Build args for claude CLI
    const args = [
      "-p", message,
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
    ];

    if (this.permissionMode === "auto-accept") {
      args.push("--dangerously-skip-permissions");
    }

    if (this.isFirstMessage) {
      args.push("--session-id", this.sessionId);
      this.isFirstMessage = false;
    } else {
      args.push("--resume", this.sessionId);
    }

    if (this.model) {
      args.push("--model", this.model);
    }

    await invoke<{ id: string; cwd: string; pid?: number }>("spawn_pty", {
      id: ptyId,
      cmd: "claude",
      args,
      cwd: this.cwd,
    });
  }

  private handleEvent(raw: unknown): void {
    const parsed = parseClaudeEvent(raw);

    switch (parsed.kind) {
      case "init":
        this.emitLifecycle({ type: "session_start", sessionId: parsed.sessionId || this.sessionId, data: { model: parsed.model } });
        break;

      case "compaction":
        // Lifecycle event: context was compacted by Claude Code
        this.emitLifecycle({ type: "compaction", sessionId: parsed.sessionId || this.sessionId });
        break;

      case "streaming_text": {
        const msgId = this.currentMessageId;
        if (!msgId || !parsed.text) break;
        this.streamingText += parsed.text;
        // Update the text block in-place for streaming effect
        this.emitStreamingText(msgId, this.streamingText);
        break;
      }

      case "streaming_thinking": {
        const msgId = this.currentMessageId;
        if (!msgId || !parsed.text) break;
        this.streamingThinking += parsed.text;
        this.emitStreamingThinking(msgId, this.streamingThinking);
        break;
      }

      case "blocks": {
        const msgId = this.currentMessageId;
        if (!msgId || !parsed.blocks) break;
        for (const block of parsed.blocks) {
          if (block.type === "text" && this.streamingText) {
            // Streaming already placed a text block — update in-place with final version
            this.emitStreamingText(msgId, (block as { type: "text"; text: string }).text);
          } else if (block.type === "thinking" && this.streamingThinking) {
            // Streaming already placed a thinking block — update in-place with final version
            this.emitStreamingThinking(msgId, (block as { type: "thinking"; text: string }).text);
          } else {
            // New block type (tool_use, file_edit, etc.) — append
            this.emitContentBlock(block, msgId);
          }
        }
        this.streamingText = "";
        this.streamingThinking = "";
        break;
      }

      case "user_tool_results": {
        const msgId = this.currentMessageId;
        if (!msgId || !parsed.blocks) break;
        for (const block of parsed.blocks) {
          if (block.type === "tool_result") {
            // Merge result into the corresponding tool block
            this.emitToolResult(msgId, block.toolUseId, block.output, block.isError);
          } else {
            this.emitContentBlock(block, msgId);
          }
        }
        break;
      }

      case "result": {
        const msgId = this.currentMessageId;
        if (!msgId) break;
        this.streamingText = "";
        this.streamingThinking = "";
        this.emitMessageComplete(msgId, {
          tokensIn: parsed.meta?.tokensIn,
          tokensOut: parsed.meta?.tokensOut,
          costUsd: parsed.meta?.costUsd,
          durationMs: parsed.meta?.durationMs,
        });
        if (parsed.meta?.isError) {
          this.emitContentBlock(
            { type: "error", message: "Claude Code returned an error result" },
            msgId,
          );
        }
        this.currentMessageId = null;
        this.emitStatus("idle");
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
    this.emitLifecycle({ type: "session_end", sessionId: this.sessionId, data: { reason: "user" } });
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

  private emitLifecycle(event: { type: string; sessionId: string; data?: Record<string, unknown> }) {
    for (const cb of this.lifecycleCbs) cb(event as Parameters<LifecycleCallback>[0]);
  }
  private emitContentBlock(block: ContentBlock, messageId: string) {
    for (const cb of this.contentBlockCbs) cb(block, messageId);
  }
  private emitMessageComplete(messageId: string, meta: Parameters<MessageCompleteCallback>[1]) {
    for (const cb of this.messageCompleteCbs) cb(messageId, meta);
  }
  private emitStreamingText(messageId: string, fullText: string) {
    for (const cb of this.streamingTextCbs) cb(messageId, fullText);
  }
  private emitStreamingThinking(messageId: string, fullText: string) {
    for (const cb of this.streamingThinkingCbs) cb(messageId, fullText);
  }
  private emitToolResult(messageId: string, toolUseId: string, output: string, isError?: boolean) {
    for (const cb of this.toolResultCbs) cb(messageId, toolUseId, output, isError);
  }
  private emitError(error: string) {
    for (const cb of this.errorCbs) cb(error);
  }
  private emitStatus(status: Parameters<StatusCallback>[0]) {
    for (const cb of this.statusCbs) cb(status);
  }
}
