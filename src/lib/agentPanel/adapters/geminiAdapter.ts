import { invoke, listen } from "../../ipc";
import { JsonlParser } from "../parsers/jsonlParser";
import { parseGeminiEvent, inferLanguage } from "../parsers/geminiEventParser";
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
 * Gemini CLI Adapter
 *
 * Uses per-message invocation pattern:
 * - First message: `gemini -p "msg" --output-format stream-json -y`
 * - Subsequent messages: `gemini -p "msg" --output-format stream-json -y --resume <session-id>`
 *
 * Each message spawns a new PTY process. The session is preserved via Gemini CLI's
 * built-in session persistence (--resume flag with session_id from init event).
 */
export class GeminiAdapter implements AgentAdapter {
  readonly agentId = "gemini" as const;

  private cwd: string = "";
  private model?: string;
  private sessionId: string | null = null;
  private activePtyId: string | null = null;
  private rawOutput: string = "";
  private parser: JsonlParser | null = null;
  private streamingText: string = "";
  private unlistenOutput: (() => void) | null = null;
  private unlistenExit: (() => void) | null = null;
  private currentMessageId: string | null = null;
  private isFirstMessage = true;
  private lastMessageText: string | null = null;
  private lastModel: string | undefined = undefined;
  private permissionMode: AgentPermissionMode = "auto-accept";

  // Typewriter streaming: Gemini sends large chunks; we drip-feed word-by-word
  private typewriterQueue: string[] = [];
  private typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  private typewriterEmitted: string = ""; // what we've emitted so far
  private typewriterFull: string = ""; // full text received so far

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
    return { ptySessionId: `agent-gemini-${crypto.randomUUID()}`, pid: undefined };
  }

  sendMessage(message: string, model?: string): void {
    if (!this.cwd) return;
    this.lastMessageText = message;
    this.lastModel = model ?? this.model;
    if (model) this.model = model;
    this.currentMessageId = crypto.randomUUID();
    this.emitStatus("running");
    this.spawnForMessage(message).catch((err) => {
      this.emitError(`Failed to spawn Gemini CLI: ${err}`);
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
    this.streamingText = "";
    this.typewriterQueue = [];
    this.typewriterEmitted = "";
    this.typewriterFull = "";
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }

    this.unlistenOutput = listen(`pty-output-${ptyId}`, (data: string) => {
      this.rawOutput += data;
      this.parser?.feed(data);
    });

    this.unlistenExit = listen(`pty-exit-${ptyId}`, (info: { exitCode: number; signal?: number }) => {
      this.parser?.flush();

      if (this.currentMessageId) {
        if (info.exitCode !== 0) {
          const rawMsg = this.rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g, "").trim();
          const errorDetail = rawMsg
            ? `Gemini CLI exited with code ${info.exitCode}:\n${rawMsg.slice(0, 2000)}`
            : `Gemini CLI exited with code ${info.exitCode}`;
          console.error("[AgentPanel] Gemini CLI error output:", rawMsg);
          this.emitContentBlock({ type: "error", message: errorDetail }, this.currentMessageId);
        }
        this.emitMessageComplete(this.currentMessageId, {});
        this.currentMessageId = null;
      }
      this.emitStatus("idle");
      this.cleanupPty();
    });

    // Build args for gemini CLI
    const args: string[] = [
      "-p", message,
      "--output-format", "stream-json",
    ];

    if (this.permissionMode === "auto-accept") {
      args.push("-y"); // auto-accept all tool actions
    }

    if (!this.isFirstMessage && this.sessionId) {
      args.push("--resume", this.sessionId);
    }

    if (this.model) {
      args.push("--model", this.model);
    }

    await invoke<{ id: string; cwd: string; pid?: number }>("spawn_pty", {
      id: ptyId,
      cmd: "gemini",
      args,
      cwd: this.cwd,
    });
  }

  private handleEvent(raw: unknown): void {
    const parsed = parseGeminiEvent(raw);

    switch (parsed.kind) {
      case "init": {
        // Capture session ID for resume
        if (parsed.sessionId) {
          this.sessionId = parsed.sessionId;
          this.isFirstMessage = false;
        }
        break;
      }

      case "text_delta": {
        const msgId = this.currentMessageId;
        if (!msgId || !parsed.text) break;
        this.typewriterFull += parsed.text;
        this.enqueueTypewriter(parsed.text, msgId);
        break;
      }

      case "tool_use": {
        const msgId = this.currentMessageId;
        if (!msgId) break;

        const toolName = parsed.toolName || "";
        const input = parsed.toolInput || {};

        // Map Gemini tool names to our content block types
        if (toolName === "edit_file" || toolName === "write_file") {
          const path = (input.file_path as string) || (input.path as string) || "";
          const content = (input.content as string) || (input.new_content as string) || "";
          if (toolName === "edit_file") {
            const oldContent = (input.old_content as string) || "";
            const diff = `--- ${path}\n+++ ${path}\n${oldContent.split("\n").map((l: string) => `- ${l}`).join("\n")}\n${content.split("\n").map((l: string) => `+ ${l}`).join("\n")}`;
            this.emitContentBlock({ type: "file_edit", path, diff, language: inferLanguage(path) }, msgId);
          } else {
            this.emitContentBlock({ type: "file_write", path, content, language: inferLanguage(path) }, msgId);
          }
        } else if (toolName === "read_file") {
          const path = (input.file_path as string) || (input.path as string) || "";
          this.emitContentBlock({ type: "file_read", path, content: "" }, msgId);
        } else if (toolName === "shell" || toolName === "run_shell_command") {
          const command = (input.command as string) || "";
          this.emitContentBlock({ type: "bash_command", command }, msgId);
        } else {
          this.emitContentBlock({ type: "tool_use", tool: toolName, input, id: parsed.toolId }, msgId);
        }
        break;
      }

      case "tool_result": {
        const msgId = this.currentMessageId;
        if (!msgId) break;
        if (parsed.toolId) {
          this.emitToolResult(
            msgId,
            parsed.toolId,
            parsed.toolOutput || "",
            parsed.toolStatus === "error",
          );
        }
        break;
      }

      case "result": {
        const msgId = this.currentMessageId;
        if (!msgId) break;
        // Flush typewriter immediately — emit full text
        this.flushTypewriter(msgId);
        this.streamingText = "";
        this.emitMessageComplete(msgId, {
          tokensIn: parsed.meta?.tokensIn,
          tokensOut: parsed.meta?.tokensOut,
          durationMs: parsed.meta?.durationMs,
        });
        if (parsed.meta?.isError) {
          this.emitContentBlock(
            { type: "error", message: "Gemini CLI returned an error result" },
            msgId,
          );
        }
        this.currentMessageId = null;
        this.emitStatus("idle");
        break;
      }

      case "error":
      case "unknown":
        break;
    }
  }

  /**
   * Typewriter: split incoming chunk into words and drip-feed them at ~20ms intervals
   * to simulate token-by-token streaming like Claude Code.
   */
  private enqueueTypewriter(chunk: string, msgId: string): void {
    // Split chunk into words (preserving whitespace with each word)
    const words = chunk.match(/\S+\s*/g) || [chunk];
    this.typewriterQueue.push(...words);
    if (!this.typewriterTimer) {
      this.drainTypewriter(msgId);
    }
  }

  private drainTypewriter(msgId: string): void {
    if (this.typewriterQueue.length === 0) {
      this.typewriterTimer = null;
      return;
    }
    const word = this.typewriterQueue.shift()!;
    this.typewriterEmitted += word;
    this.streamingText = this.typewriterEmitted;
    this.emitStreamingText(msgId, this.streamingText);

    this.typewriterTimer = setTimeout(() => this.drainTypewriter(msgId), 20);
  }

  private flushTypewriter(msgId: string): void {
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
    // Emit all remaining queued words immediately
    if (this.typewriterQueue.length > 0) {
      this.typewriterEmitted += this.typewriterQueue.join("");
      this.typewriterQueue = [];
    }
    // Ensure we emit the full text (in case there's any mismatch)
    this.typewriterEmitted = this.typewriterFull;
    this.streamingText = this.typewriterFull;
    this.emitStreamingText(msgId, this.streamingText);
    // Reset for next message
    this.typewriterEmitted = "";
    this.typewriterFull = "";
  }

  private cleanupPty(): void {
    if (this.typewriterTimer) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
    this.typewriterQueue = [];
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
  private emitStreamingText(messageId: string, fullText: string) {
    for (const cb of this.streamingTextCbs) cb(messageId, fullText);
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
