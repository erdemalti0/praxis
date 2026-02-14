export interface UsageWindow {
  name: string;
  utilization: number;
  resetsAt?: string;
}

export interface CostBreakdown {
  model: string;
  cost: number;
}

export interface ProviderUsage {
  id: string;
  name: string;
  available: boolean;
  error?: string;
  rateLimits?: {
    windows: UsageWindow[];
  };
  cost?: {
    total: number;
    period: string;
    breakdown?: CostBreakdown[];
  };
  quota?: {
    used: number;
    limit: number;
    period: string;
  };
}

export interface UsageResponse {
  providers: ProviderUsage[];
  fetchedAt: number;
}
