import { describe, it, expect } from "vitest";
import { PromptBudgetAllocator } from "../budgetAllocator";

describe("PromptBudgetAllocator", () => {
  const allocator = new PromptBudgetAllocator();

  it("allocates within total ceiling for large context", () => {
    const budget = allocator.allocate(100_000);
    expect(budget.total).toBeLessThanOrEqual(5000);
    expect(budget.total).toBeGreaterThan(0);
  });

  it("uses floor values for small context", () => {
    const budget = allocator.allocate(5_000);
    // With 5000 * 0.08 = 400 total, floors should dominate
    expect(budget.memoryAlwaysInject).toBeGreaterThanOrEqual(200);
    expect(budget.memoryRetrieval).toBeGreaterThanOrEqual(300);
    expect(budget.contextBridge).toBeGreaterThanOrEqual(500);
    expect(budget.sessionSummary).toBeGreaterThanOrEqual(200);
  });

  it("uses ceiling values for very large context", () => {
    const budget = allocator.allocate(200_000);
    expect(budget.memoryAlwaysInject).toBeLessThanOrEqual(400);
    expect(budget.memoryRetrieval).toBeLessThanOrEqual(1500);
    expect(budget.contextBridge).toBeLessThanOrEqual(3000);
    expect(budget.sessionSummary).toBeLessThanOrEqual(600);
  });

  it("all categories sum to total", () => {
    const budget = allocator.allocate(50_000);
    const sum =
      budget.memoryAlwaysInject +
      budget.contextBridge +
      budget.memoryRetrieval +
      budget.sessionSummary;
    expect(budget.total).toBe(sum);
  });

  it("prioritizes always-inject over others", () => {
    // Even with tiny budget, always-inject gets its floor
    const budget = allocator.allocate(2_000);
    expect(budget.memoryAlwaysInject).toBeGreaterThanOrEqual(200);
  });

  it("can update config", () => {
    const custom = new PromptBudgetAllocator({ totalCeiling: 3000 });
    const budget = custom.allocate(100_000);
    expect(budget.total).toBeLessThanOrEqual(3000);
  });
});
