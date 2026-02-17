import { describe, it, expect } from "vitest";
import { parseHistoryJsonl, parseIncrementalLine } from "../historyParser";

describe("parseHistoryJsonl", () => {
  it("parses valid JSONL content", () => {
    const content = [
      JSON.stringify({ type: "human", display: "hello", timestamp: 1000, sessionId: "s1" }),
      JSON.stringify({ type: "assistant", display: "hi", timestamp: 2000, sessionId: "s1" }),
    ].join("\n");

    const entries = parseHistoryJsonl(content);
    expect(entries).toHaveLength(2);
    // Sorted by timestamp descending
    expect(entries[0].timestamp).toBe(2000);
    expect(entries[1].timestamp).toBe(1000);
  });

  it("skips malformed lines without crashing", () => {
    const content = [
      JSON.stringify({ type: "human", display: "hello", timestamp: 1000, sessionId: "s1" }),
      "this is not json{{{",
      JSON.stringify({ type: "assistant", display: "hi", timestamp: 2000, sessionId: "s1" }),
    ].join("\n");

    const entries = parseHistoryJsonl(content);
    expect(entries).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(parseHistoryJsonl("")).toEqual([]);
    expect(parseHistoryJsonl("   \n  \n  ")).toEqual([]);
  });

  it("handles alternative field names (snake_case)", () => {
    const content = JSON.stringify({
      message: "test message",
      session_id: "sess-1",
      cost_usd: 0.05,
      input_tokens: 100,
      output_tokens: 50,
    });

    const entries = parseHistoryJsonl(content);
    expect(entries).toHaveLength(1);
    expect(entries[0].display).toBe("test message");
    expect(entries[0].sessionId).toBe("sess-1");
    expect(entries[0].costUsd).toBe(0.05);
    expect(entries[0].tokensIn).toBe(100);
    expect(entries[0].tokensOut).toBe(50);
  });
});

describe("parseIncrementalLine", () => {
  it("parses a valid line", () => {
    const line = JSON.stringify({ type: "human", display: "hello", timestamp: 1000, sessionId: "s1" });
    const entry = parseIncrementalLine(line);
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe("human");
    expect(entry!.display).toBe("hello");
  });

  it("returns null for invalid JSON", () => {
    expect(parseIncrementalLine("not json")).toBeNull();
    expect(parseIncrementalLine("")).toBeNull();
  });
});
