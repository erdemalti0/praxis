import type { ChatAgentId } from "./agentPanel";

export interface RetryPolicy {
  /** Maximum number of retry attempts per message. Default: 3 */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff. Default: 1000 */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds. Default: 30000 */
  maxDelayMs: number;
  /** Process exit codes that are considered retryable. */
  retryableExitCodes: number[];
  /** Error message patterns that are considered retryable. */
  retryablePatterns: RegExp[];
}

export interface FailoverConfig {
  enabled: boolean;
  /** Ordered preference list of fallback agents. */
  fallbackAgents: ChatAgentId[];
}

export interface RetryState {
  attempt: number;
  lastError: string;
  isRetrying: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableExitCodes: [1, 137, 143],
  retryablePatterns: [/rate.limit/i, /timeout/i, /429/, /overloaded/i],
};
