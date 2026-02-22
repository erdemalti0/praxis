import type { EventBus, AgentEvent, AgentEventType } from "../../types/eventBus";
import type { ChatAgentId } from "../../types/agentPanel";
import type { AgentAdapter } from "./adapters/base";
import type { RetryPolicy, RetryState } from "../../types/errorRecovery";
import { DEFAULT_RETRY_POLICY } from "../../types/errorRecovery";

/**
 * RetryManager subscribes to the EventBus for error events and handles
 * automatic retry with exponential backoff. Includes a circuit breaker
 * that disables retry after consecutive failures.
 *
 * Design: works entirely through the EventBus -- does not directly mutate store state.
 * Partial content is preserved during retry (existing streaming blocks are NOT cleared).
 */
export class RetryManager {
  private readonly retryState = new Map<ChatAgentId, RetryState>();
  private readonly consecutiveFailures = new Map<ChatAgentId, number>();
  private readonly unsubs: Array<() => void> = [];
  private readonly adapters = new Map<ChatAgentId, AgentAdapter>();
  private readonly messageIdGetters = new Map<ChatAgentId, () => string | undefined>();
  private readonly retryTimers = new Map<ChatAgentId, ReturnType<typeof setTimeout>>();

  /** Number of consecutive message failures before the circuit breaker trips. */
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 3;

  constructor(
    private readonly eventBus: EventBus,
    private readonly policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  ) {}

  /**
   * Attach this retry manager to an adapter so it can intercept errors
   * and trigger resends.
   */
  attachToAdapter(
    adapter: AgentAdapter,
    agentId: ChatAgentId,
    getMessageId: () => string | undefined,
  ): void {
    this.adapters.set(agentId, adapter);
    this.messageIdGetters.set(agentId, getMessageId);

    // Subscribe to error events for this agent
    const unsubError = this.eventBus.subscribe("error", (event: AgentEvent) => {
      if (event.agentId !== agentId) return;
      const { error } = event.payload as { error: string };
      this.handleError(agentId, error);
    });
    this.unsubs.push(unsubError);

    // Subscribe to message_complete to reset consecutive failure count on success
    const unsubComplete = this.eventBus.subscribe("message_complete", (event: AgentEvent) => {
      if (event.agentId !== agentId) return;
      // A successful completion resets the circuit breaker
      const state = this.retryState.get(agentId);
      if (!state || !state.isRetrying) {
        this.consecutiveFailures.set(agentId, 0);
      }
    });
    this.unsubs.push(unsubComplete);
  }

  /**
   * Handle an error event. Determines if the error is retryable and,
   * if so, schedules a retry with exponential backoff.
   */
  private handleError(agentId: ChatAgentId, error: string): void {
    // Circuit breaker check
    const failures = this.consecutiveFailures.get(agentId) ?? 0;
    if (failures >= RetryManager.CIRCUIT_BREAKER_THRESHOLD) {
      console.warn(
        `[RetryManager] Circuit breaker open for ${agentId} (${failures} consecutive failures). Skipping retry.`,
      );
      return;
    }

    // Check if the error matches retryable patterns
    if (!this.isRetryable(error)) {
      this.incrementFailures(agentId);
      return;
    }

    const adapter = this.adapters.get(agentId);
    if (!adapter || !adapter.resendLastMessage || !adapter.getLastMessage) {
      // Adapter does not support resend
      this.incrementFailures(agentId);
      return;
    }

    // Check if there is actually a message to resend
    if (!adapter.getLastMessage()) {
      this.incrementFailures(agentId);
      return;
    }

    // Get or create retry state
    let state = this.retryState.get(agentId);
    if (!state || !state.isRetrying) {
      state = { attempt: 0, lastError: error, isRetrying: true };
      this.retryState.set(agentId, state);
    }

    state.attempt += 1;
    state.lastError = error;

    if (state.attempt > this.policy.maxRetries) {
      // Exhausted retries
      state.isRetrying = false;
      this.incrementFailures(agentId);
      this.emitRetryExhausted(agentId, error);
      return;
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.policy.baseDelayMs * Math.pow(2, state.attempt - 1),
      this.policy.maxDelayMs,
    );

    // Emit an info content block showing retry attempt
    const msgId = this.messageIdGetters.get(agentId)?.();
    if (msgId) {
      this.eventBus.emit({
        type: "content_block" as AgentEventType,
        agentId,
        timestamp: Date.now(),
        payload: {
          block: {
            type: "text" as const,
            text: `Retrying (attempt ${state.attempt}/${this.policy.maxRetries})...`,
          },
          messageId: msgId,
        },
      });
    }

    console.info(
      `[RetryManager] Scheduling retry ${state.attempt}/${this.policy.maxRetries} for ${agentId} in ${delay}ms`,
    );

    // Clear any existing timer for this agent
    const existingTimer = this.retryTimers.get(agentId);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.retryTimers.delete(agentId);
      const currentAdapter = this.adapters.get(agentId);
      if (currentAdapter?.resendLastMessage) {
        const sent = currentAdapter.resendLastMessage();
        if (!sent) {
          // Could not resend -- treat as exhausted
          const s = this.retryState.get(agentId);
          if (s) s.isRetrying = false;
          this.incrementFailures(agentId);
        }
      }
    }, delay);

    this.retryTimers.set(agentId, timer);
  }

  /**
   * Check if an error string matches any retryable pattern.
   */
  private isRetryable(error: string): boolean {
    // Check retryable patterns
    for (const pattern of this.policy.retryablePatterns) {
      if (pattern.test(error)) return true;
    }
    // Check retryable exit codes embedded in the error message
    for (const code of this.policy.retryableExitCodes) {
      if (error.includes(`exited with code ${code}`)) return true;
    }
    return false;
  }

  private incrementFailures(agentId: ChatAgentId): void {
    const current = this.consecutiveFailures.get(agentId) ?? 0;
    this.consecutiveFailures.set(agentId, current + 1);
  }

  private emitRetryExhausted(agentId: ChatAgentId, lastError: string): void {
    this.eventBus.emit({
      type: "error" as AgentEventType,
      agentId,
      timestamp: Date.now(),
      payload: {
        error: `Retry exhausted after ${this.policy.maxRetries} attempts. Last error: ${lastError}`,
      },
    });
  }

  /** Reset retry state for a specific agent. */
  reset(agentId?: ChatAgentId): void {
    if (agentId) {
      this.retryState.delete(agentId);
      this.consecutiveFailures.delete(agentId);
      const timer = this.retryTimers.get(agentId);
      if (timer) {
        clearTimeout(timer);
        this.retryTimers.delete(agentId);
      }
    } else {
      this.retryState.clear();
      this.consecutiveFailures.clear();
      for (const timer of this.retryTimers.values()) clearTimeout(timer);
      this.retryTimers.clear();
    }
  }

  /** Get the current retry state for an agent (for UI display). */
  getRetryState(agentId: ChatAgentId): RetryState | undefined {
    return this.retryState.get(agentId);
  }

  /** Dispose all subscriptions and timers. */
  dispose(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    this.adapters.clear();
    this.messageIdGetters.clear();
    this.retryState.clear();
    this.consecutiveFailures.clear();
  }
}
