import type { HistoryEntry } from "../../types/session";

export function parseHistoryJsonl(content: string): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const lines = content.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    try {
      const raw = JSON.parse(line);
      entries.push({
        type: raw.type ?? "assistant",
        display: raw.display ?? raw.message ?? "",
        timestamp: raw.timestamp ?? Date.now(),
        project: raw.project ?? raw.cwd ?? undefined,
        sessionId: raw.sessionId ?? raw.session_id ?? "unknown",
        model: raw.model,
        costUsd: raw.costUsd ?? raw.cost_usd,
        tokensIn: raw.tokensIn ?? raw.input_tokens,
        tokensOut: raw.tokensOut ?? raw.output_tokens,
      });
    } catch {
      // skip malformed lines
    }
  }

  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

export function parseIncrementalLine(line: string): HistoryEntry | null {
  try {
    const raw = JSON.parse(line);
    return {
      type: raw.type ?? "assistant",
      display: raw.display ?? raw.message ?? "",
      timestamp: raw.timestamp ?? Date.now(),
      project: raw.project ?? raw.cwd ?? undefined,
      sessionId: raw.sessionId ?? raw.session_id ?? "unknown",
      model: raw.model,
      costUsd: raw.costUsd ?? raw.cost_usd,
      tokensIn: raw.tokensIn ?? raw.input_tokens,
      tokensOut: raw.tokensOut ?? raw.output_tokens,
    };
  } catch {
    return null;
  }
}
