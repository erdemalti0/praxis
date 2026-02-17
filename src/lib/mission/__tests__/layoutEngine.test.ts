import { describe, it, expect } from "vitest";
import { computeTreeLayout, NODE_WIDTH, NODE_HEIGHT } from "../layoutEngine";
import type { MissionStep } from "../../../types/mission";

function makeStep(overrides: Partial<MissionStep> & { id: string }): MissionStep {
  return {
    missionId: "m1",
    title: overrides.id,
    description: "",
    status: "pending",
    parentId: null,
    children: [],
    dependencies: [],
    position: { x: 0, y: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("computeTreeLayout", () => {
  it("returns empty layout for no steps", () => {
    const result = computeTreeLayout([]);
    expect(result.positions).toEqual({});
    expect(result.totalWidth).toBe(0);
    expect(result.totalHeight).toBe(0);
  });

  it("positions a single node at origin", () => {
    const steps = [makeStep({ id: "A" })];
    const result = computeTreeLayout(steps);
    expect(result.positions["A"]).toBeDefined();
    expect(result.positions["A"].x).toBe(0);
    expect(result.positions["A"].y).toBe(0);
    expect(result.totalWidth).toBe(NODE_WIDTH);
    expect(result.totalHeight).toBe(NODE_HEIGHT);
  });

  it("positions a linear chain A → B → C in increasing layers", () => {
    const steps = [
      makeStep({ id: "A", children: ["B"] }),
      makeStep({ id: "B", parentId: "A", children: ["C"] }),
      makeStep({ id: "C", parentId: "B" }),
    ];
    const result = computeTreeLayout(steps);
    expect(result.positions["A"].y).toBeLessThan(result.positions["B"].y);
    expect(result.positions["B"].y).toBeLessThan(result.positions["C"].y);
  });

  it("positions parallel siblings at the same y level", () => {
    const steps = [
      makeStep({ id: "A", children: ["B", "C"] }),
      makeStep({ id: "B", parentId: "A" }),
      makeStep({ id: "C", parentId: "A" }),
    ];
    const result = computeTreeLayout(steps);
    expect(result.positions["B"].y).toBe(result.positions["C"].y);
    expect(result.positions["A"].y).toBeLessThan(result.positions["B"].y);
  });

  it("handles diamond DAG correctly (A→B, A→C, B→D, C→D)", () => {
    // This is the key test case that was broken with the shared visited set
    const steps = [
      makeStep({ id: "A", children: ["B", "C"] }),
      makeStep({ id: "B", parentId: "A", children: ["D"] }),
      makeStep({ id: "C", parentId: "A", children: ["D"] }),
      makeStep({ id: "D", parentId: "B" }), // D has two parents via children edges
    ];
    const result = computeTreeLayout(steps);

    // A should be at layer 0
    expect(result.positions["A"].y).toBe(0);

    // B and C should be at layer 1 (same y)
    expect(result.positions["B"].y).toBe(result.positions["C"].y);
    expect(result.positions["B"].y).toBeGreaterThan(result.positions["A"].y);

    // D should be at layer 2 (after both B and C)
    expect(result.positions["D"].y).toBeGreaterThan(result.positions["B"].y);
  });

  it("handles dependency edges placing dependent after dependency", () => {
    const steps = [
      makeStep({ id: "A" }),
      makeStep({ id: "B", dependencies: ["A"] }),
    ];
    const result = computeTreeLayout(steps);
    expect(result.positions["B"].y).toBeGreaterThan(result.positions["A"].y);
  });

  it("does not crash on cycles (graceful degradation)", () => {
    // Cycles shouldn't happen in practice, but the engine should not hang
    const steps = [
      makeStep({ id: "A", dependencies: ["B"] }),
      makeStep({ id: "B", dependencies: ["A"] }),
    ];
    // Should not throw or hang
    const result = computeTreeLayout(steps);
    expect(result.positions["A"]).toBeDefined();
    expect(result.positions["B"]).toBeDefined();
  });

  it("ensures no overlapping nodes in the same layer", () => {
    const steps = [
      makeStep({ id: "A", children: ["B", "C", "D"] }),
      makeStep({ id: "B", parentId: "A" }),
      makeStep({ id: "C", parentId: "A" }),
      makeStep({ id: "D", parentId: "A" }),
    ];
    const result = computeTreeLayout(steps);

    // B, C, D are all at the same y — check no x overlap
    const positions = [
      result.positions["B"],
      result.positions["C"],
      result.positions["D"],
    ].sort((a, b) => a.x - b.x);

    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].x).toBeGreaterThanOrEqual(positions[i - 1].x + NODE_WIDTH);
    }
  });
});
