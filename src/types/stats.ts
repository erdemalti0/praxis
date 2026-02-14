export interface DailyStats {
  date: string;
  totalMessages: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
  byModel: Record<
    string,
    {
      messages: number;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
    }
  >;
}

export interface StatsCache {
  daily: DailyStats[];
  lastUpdated: number;
}
