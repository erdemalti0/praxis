import { describe, it, expect, beforeEach } from "vitest";
import { SLOMonitor } from "../sloMonitor";

describe("SLOMonitor", () => {
  let monitor: SLOMonitor;

  beforeEach(() => {
    monitor = new SLOMonitor();
  });

  it("reports healthy with no data", () => {
    expect(monitor.isHealthy()).toBe(true);
    expect(monitor.shouldDegrade()).toBe(false);
  });

  it("reports healthy with fast latencies", () => {
    for (let i = 0; i < 20; i++) {
      monitor.record(50 + Math.random() * 50); // 50-100ms
    }
    expect(monitor.isHealthy()).toBe(true);
    expect(monitor.shouldDegrade()).toBe(false);
  });

  it("reports unhealthy with slow latencies", () => {
    for (let i = 0; i < 20; i++) {
      monitor.record(250 + Math.random() * 100); // 250-350ms
    }
    expect(monitor.isHealthy()).toBe(false);
  });

  it("triggers degradation at p95 > 300ms", () => {
    for (let i = 0; i < 20; i++) {
      monitor.record(350); // all above 300ms
    }
    expect(monitor.shouldDegrade()).toBe(true);
  });

  it("does not degrade with insufficient samples", () => {
    monitor.record(500);
    monitor.record(500);
    expect(monitor.shouldDegrade()).toBe(false); // need 5+ samples
  });

  it("provides degrade config with reduced limits", () => {
    const config = monitor.getDegradeConfig();
    expect(config.maxCandidateScan).toBeLessThan(500);
    expect(config.topK).toBeLessThan(15);
  });

  it("calculates p95 correctly", () => {
    // Add 100 values: 1, 2, 3, ..., 100
    for (let i = 1; i <= 100; i++) {
      monitor.record(i);
    }
    // p95 should be ~95
    expect(monitor.getP95()).toBeGreaterThanOrEqual(94);
    expect(monitor.getP95()).toBeLessThanOrEqual(96);
  });

  it("reports full stats", () => {
    for (let i = 0; i < 10; i++) {
      monitor.record(100);
    }
    const stats = monitor.getStats();
    expect(stats.sampleCount).toBe(10);
    expect(stats.p50Ms).toBe(100);
    expect(stats.healthy).toBe(true);
    expect(stats.degraded).toBe(false);
  });

  it("resets correctly", () => {
    monitor.record(100);
    monitor.reset();
    expect(monitor.getStats().sampleCount).toBe(0);
  });
});
