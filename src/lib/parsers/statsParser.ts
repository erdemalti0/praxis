import type { DailyStats } from "../../types/stats";

export function parseStatsCache(content: string): DailyStats | null {
  try {
    const raw = JSON.parse(content);
    const today = new Date().toISOString().slice(0, 10);

    if (raw.daily && Array.isArray(raw.daily)) {
      const todayEntry = raw.daily.find(
        (d: { date: string }) => d.date === today
      );
      if (todayEntry) return todayEntry as DailyStats;
    }

    if (raw.date === today || !raw.date) {
      return {
        date: today,
        totalMessages: raw.totalMessages ?? raw.total_messages ?? 0,
        totalTokensIn: raw.totalTokensIn ?? raw.total_tokens_in ?? 0,
        totalTokensOut: raw.totalTokensOut ?? raw.total_tokens_out ?? 0,
        totalCostUsd: raw.totalCostUsd ?? raw.total_cost_usd ?? 0,
        byModel: raw.byModel ?? raw.by_model ?? {},
      };
    }

    return null;
  } catch {
    return null;
  }
}
