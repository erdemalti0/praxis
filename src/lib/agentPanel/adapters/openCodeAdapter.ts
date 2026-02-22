import { invoke, listen } from "../../ipc";
import { JsonlParser } from "../parsers/jsonlParser";
import { parseOpenCodeEvent } from "../parsers/openCodeEventParser";
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
 * OpenCode Adapter
 *
 * Uses per-message invocation pattern:
 * - First message:  `opencode run --format json "msg"`
 * - Subsequent:     `opencode run --format json --session <id> "msg"`
 *
 * Each message spawns a new PTY process. The session is preserved via
 * OpenCode's built-in session persistence (--session flag).
 *
 * OpenCode's JSON format delivers complete text/thinking blocks (not token-level
 * deltas). To provide the same fluid streaming UX as Claude Code, this adapter
 * simulates token-by-token streaming by progressively revealing received text.
 */
export class OpenCodeAdapter implements AgentAdapter {
  readonly agentId = "opencode" as const;

  private cwd: string = "";
  private model?: string;
  private sessionId: string | null = null;
  private activePtyId: string | null = null;
  private rawOutput: string = "";
  private parser: JsonlParser | null = null;
  private unlistenOutput: (() => void) | null = null;
  private unlistenExit: (() => void) | null = null;
  private currentMessageId: string | null = null;
  private isFirstMessage = true;
  private lastMessageText: string | null = null;
  private lastModel: string | undefined = undefined;
  /** Accumulate tokens across steps within a single message */
  private msgTokensIn = 0;
  private msgTokensOut = 0;
  private msgCost = 0;

  private permissionMode: AgentPermissionMode;

  /** Streaming simulation state */
  private streamTimer: ReturnType<typeof setTimeout> | null = null;
  private streamQueue: Array<{ type: "text" | "thinking"; text: string; msgId: string }> = [];
  private isStreaming = false;
  /** Pending finalization — deferred until streaming simulation completes */
  private pendingFinalize: { msgId: string; meta: Parameters<MessageCompleteCallback>[1] } | null = null;

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
    return { ptySessionId: `agent-opencode-${crypto.randomUUID()}`, pid: undefined };
  }

  sendMessage(message: string, model?: string): void {
    if (!this.cwd) return;
    this.lastMessageText = message;
    this.lastModel = model ?? this.model;
    if (model) this.model = model;
    this.currentMessageId = crypto.randomUUID();
    this.msgTokensIn = 0;
    this.msgTokensOut = 0;
    this.msgCost = 0;
    this.cancelStreaming();
    this.emitStatus("running");
    this.spawnForMessage(message).catch((err) => {
      this.emitError(`Failed to spawn OpenCode: ${err}`);
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

      // If we haven't finalized the message yet, do it now
      if (this.currentMessageId) {
        if (info.exitCode !== 0) {
          const rawMsg = this.rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "").trim();
          const errorDetail = rawMsg
            ? `OpenCode exited with code ${info.exitCode}:\n${rawMsg.slice(0, 2000)}`
            : `OpenCode exited with code ${info.exitCode}`;
          console.error("[AgentPanel] OpenCode error output:", rawMsg);
          this.emitContentBlock({ type: "error", message: errorDetail }, this.currentMessageId);
        }

        // If streaming simulation is still running, defer finalization
        const meta = {
          tokensIn: this.msgTokensIn || undefined,
          tokensOut: this.msgTokensOut || undefined,
          costUsd: this.msgCost || undefined,
        };
        if (this.isStreaming) {
          this.pendingFinalize = { msgId: this.currentMessageId, meta };
          this.currentMessageId = null;
        } else {
          this.emitMessageComplete(this.currentMessageId, meta);
          this.currentMessageId = null;
          this.emitStatus("idle");
        }
      }
      this.cleanupPty();
    });

    // Build args for opencode CLI
    const args: string[] = [
      "run",
      "--format", "json",
      "--thinking",
    ];

    // TODO: OpenCode permission flag TBD after Phase 2 canary testing
    // For now permissionMode is stored but no CLI flag is emitted
    if (this.permissionMode === "auto-accept") {
      // OpenCode does not yet have a known auto-accept flag
    }

    if (!this.isFirstMessage && this.sessionId) {
      args.push("--session", this.sessionId);
    }

    if (this.model) {
      args.push("--model", this.model);
    }

    // Message goes as positional argument
    args.push(message);

    await invoke<{ id: string; cwd: string; pid?: number }>("spawn_pty", {
      id: ptyId,
      cmd: "opencode",
      args,
      cwd: this.cwd,
    });
  }

  // ─── Streaming simulation ───────────────────────────────────────────
  // OpenCode delivers complete text blocks. To match Claude Code's fluid UX,
  // we progressively reveal text via the streaming callbacks.

  private static readonly STREAM_CHUNK = 4;   // characters per tick
  private static readonly STREAM_INTERVAL = 12; // ms between ticks

  /**
   * Queue a text or thinking block for simulated streaming.
   * Multiple blocks can arrive before the first finishes streaming;
   * they are queued and played in order.
   */
  private enqueueStreamBlock(type: "text" | "thinking", text: string, msgId: string): void {
    this.streamQueue.push({ type, text, msgId });
    if (!this.isStreaming) {
      this.processStreamQueue();
    }
  }

  private processStreamQueue(): void {
    const item = this.streamQueue.shift();
    if (!item) {
      this.isStreaming = false;
      // If finalization was deferred, run it now
      if (this.pendingFinalize) {
        const { msgId, meta } = this.pendingFinalize;
        this.pendingFinalize = null;
        this.emitMessageComplete(msgId, meta);
        this.emitStatus("idle");
      }
      return;
    }

    this.isStreaming = true;
    const { type, text, msgId } = item;
    let pos = 0;

    const tick = () => {
      pos = Math.min(pos + OpenCodeAdapter.STREAM_CHUNK, text.length);
      const partial = text.slice(0, pos);

      if (type === "text") {
        this.emitStreamingText(msgId, partial);
      } else {
        this.emitStreamingThinking(msgId, partial);
      }

      if (pos < text.length) {
        this.streamTimer = setTimeout(tick, OpenCodeAdapter.STREAM_INTERVAL);
      } else {
        // Done with this block — emit the final complete content block
        this.streamTimer = null;
        if (type === "text") {
          this.emitContentBlock({ type: "text", text }, msgId);
        } else {
          this.emitContentBlock({ type: "thinking", text }, msgId);
        }
        // Process next queued block
        this.processStreamQueue();
      }
    };

    tick();
  }

  private cancelStreaming(): void {
    if (this.streamTimer) {
      clearTimeout(this.streamTimer);
      this.streamTimer = null;
    }
    this.streamQueue = [];
    this.isStreaming = false;
    this.pendingFinalize = null;
  }

  // ─── Event handling ─────────────────────────────────────────────────

  private handleEvent(raw: unknown): void {
    const parsed = parseOpenCodeEvent(raw);

    switch (parsed.kind) {
      case "init": {
        // Capture session ID from first response for session continuity
        if (parsed.sessionId && !this.sessionId) {
          this.sessionId = parsed.sessionId;
          this.isFirstMessage = false;
        }
        break;
      }

      case "thinking": {
        const msgId = this.currentMessageId;
        if (!msgId || !parsed.text) break;
        this.enqueueStreamBlock("thinking", parsed.text, msgId);
        break;
      }

      case "text": {
        const msgId = this.currentMessageId;
        if (!msgId || !parsed.text) break;
        this.enqueueStreamBlock("text", parsed.text, msgId);
        break;
      }

      case "tool_use": {
        const msgId = this.currentMessageId;
        if (!msgId || !parsed.block) break;
        this.emitContentBlock(parsed.block, msgId);
        break;
      }

      case "result": {
        // OpenCode sends step_finish per step — accumulate tokens/cost
        if (parsed.meta) {
          this.msgTokensIn += parsed.meta.tokensIn || 0;
          this.msgTokensOut += parsed.meta.tokensOut || 0;
          this.msgCost += parsed.meta.costUsd || 0;
        }

        // If reason is "stop", this is the final step — finalize
        if (parsed.meta?.reason === "stop") {
          const msgId = this.currentMessageId;
          if (msgId) {
            const meta = {
              tokensIn: this.msgTokensIn || undefined,
              tokensOut: this.msgTokensOut || undefined,
              costUsd: this.msgCost || undefined,
            };
            // If streaming is still running, defer finalization
            if (this.isStreaming) {
              this.pendingFinalize = { msgId, meta };
              this.currentMessageId = null;
            } else {
              this.emitMessageComplete(msgId, meta);
              this.currentMessageId = null;
              this.emitStatus("idle");
            }
          }
        }
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
    this.cancelStreaming();
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

  /** @internal Lifecycle emission — no signals discovered yet for OpenCode; canary tests TBD */
  protected emitLifecycle(event: Parameters<LifecycleCallback>[0]) {
    for (const cb of this.lifecycleCbs) cb(event);
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
  private emitError(error: string) {
    for (const cb of this.errorCbs) cb(error);
  }
  private emitStatus(status: Parameters<StatusCallback>[0]) {
    for (const cb of this.statusCbs) cb(status);
  }
}
