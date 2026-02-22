/**
 * SLO soft-enforcement monitor for memory retrieval.
 * Tracks retrieval latency and degrades gracefully when p95 exceeds thresholds.
 */

import type { SearchOptions } from "./types";

// ─── Constants ───────────────────────────────────────────────────────

const WINDOW_SIZE = 100;       // rolling window of last N retrievals
const HEALTHY_P95_MS = 200;    // p95 < 200ms = healthy
const DEGRADE_P95_MS = 300;    // p95 > 300ms = should degrade

// ─── SLO Monitor ─────────────────────────────────────────────────────

export class SLOMonitor {
  private latencies: number[] = [];

  /**
   * Record a retrieval latency measurement.
   */
  record(latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > WINDOW_SIZE) {
      this.latencies.shift();
    }
  }

  /**
   * Check if retrieval performance is healthy (p95 < 200ms).
   */
  isHealthy(): boolean {
    return this.getP95() < HEALTHY_P95_MS;
  }

  /**
   * Check if retrieval should degrade (p95 > 300ms).
   */
  shouldDegrade(): boolean {
    if (this.latencies.length < 5) return false; // need minimum samples
    return this.getP95() > DEGRADE_P95_MS;
  }

  /**
   * Get degraded search options to reduce retrieval cost.
   */
  getDegradeConfig(): Partial<SearchOptions> {
    return {
      maxCandidateScan: 100,   // reduced from 500
      topK: 5,                 // reduced from 15
      maxRetrievalMs: 100,     // tighter deadline
    };
  }

  /**
   * Get p95 latency from the rolling window.
   */
  getP95(): number {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.95);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  /**
   * Get current stats for diagnostics.
   */
  getStats(): {
    sampleCount: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    healthy: boolean;
    degraded: boolean;
  } {
    if (this.latencies.length === 0) {
      return { sampleCount: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, healthy: true, degraded: false };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const percentile = (p: number) => sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];

    return {
      sampleCount: this.latencies.length,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      healthy: this.isHealthy(),
      degraded: this.shouldDegrade(),
    };
  }

  /**
   * Reset the monitor (for testing).
   */
  reset(): void {
    this.latencies = [];
  }
}
