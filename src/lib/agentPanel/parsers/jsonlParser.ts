/**
 * Line-buffered JSONL parser for PTY output streams.
 * Handles partial lines from 12ms output batching — buffers incomplete
 * lines and emits complete JSON objects as they arrive.
 */
export class JsonlParser {
  private buffer = "";
  private onEvent: (event: unknown) => void;

  constructor(onEvent: (event: unknown) => void) {
    this.onEvent = onEvent;
  }

  feed(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        this.onEvent(JSON.parse(trimmed));
      } catch {
        // Not valid JSON — skip (ANSI noise, PTY control sequences, etc.)
      }
    }
  }

  flush(): void {
    const trimmed = this.buffer.trim();
    if (trimmed) {
      try {
        this.onEvent(JSON.parse(trimmed));
      } catch {
        // ignore
      }
      this.buffer = "";
    }
  }

  reset(): void {
    this.buffer = "";
  }
}
