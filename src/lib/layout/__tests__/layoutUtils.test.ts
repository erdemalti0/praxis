import { describe, it, expect } from "vitest";
import {
  splitPane,
  closePane,
  fillEmptyLeaf,
  hasEmptyLeaf,
  getSessionIds,
  swapPanes,
} from "../layoutUtils";
import type { LayoutNode } from "../../../types/layout";

describe("splitPane", () => {
  it("splits a leaf into a split node", () => {
    const leaf: LayoutNode = { type: "leaf", sessionId: "s1" };
    const result = splitPane(leaf, "s1", "horizontal", "s2");
    expect(result.type).toBe("split");
    if (result.type === "split") {
      expect(result.direction).toBe("horizontal");
      expect(result.ratio).toBe(0.5);
      expect(result.children[0]).toEqual({ type: "leaf", sessionId: "s1" });
      expect(result.children[1]).toEqual({ type: "leaf", sessionId: "s2" });
    }
  });

  it("does not split a leaf with a different sessionId", () => {
    const leaf: LayoutNode = { type: "leaf", sessionId: "s1" };
    const result = splitPane(leaf, "s99", "vertical", "s2");
    expect(result).toEqual(leaf);
  });

  it("recursively finds the target in a split tree", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", sessionId: "s1" },
        { type: "leaf", sessionId: "s2" },
      ],
    };
    const result = splitPane(tree, "s2", "vertical", "s3");
    expect(result.type).toBe("split");
    if (result.type === "split") {
      expect(result.children[0]).toEqual({ type: "leaf", sessionId: "s1" });
      expect(result.children[1].type).toBe("split");
    }
  });
});

describe("closePane", () => {
  it("returns null when closing the only leaf", () => {
    const leaf: LayoutNode = { type: "leaf", sessionId: "s1" };
    expect(closePane(leaf, "s1")).toBeNull();
  });

  it("returns the sibling when closing one side of a split", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", sessionId: "s1" },
        { type: "leaf", sessionId: "s2" },
      ],
    };
    const result = closePane(tree, "s1");
    expect(result).toEqual({ type: "leaf", sessionId: "s2" });
  });
});

describe("fillEmptyLeaf", () => {
  it("fills an empty root leaf", () => {
    const leaf: LayoutNode = { type: "leaf", sessionId: null };
    const { layout, filled } = fillEmptyLeaf(leaf, "s1");
    expect(filled).toBe(true);
    expect(layout).toEqual({ type: "leaf", sessionId: "s1" });
  });

  it("does not fill a non-empty leaf", () => {
    const leaf: LayoutNode = { type: "leaf", sessionId: "existing" };
    const { layout, filled } = fillEmptyLeaf(leaf, "s1");
    expect(filled).toBe(false);
    expect(layout).toEqual(leaf);
  });

  it("fills the first empty leaf in a split tree", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", sessionId: "s1" },
        { type: "leaf", sessionId: null },
      ],
    };
    const { layout, filled } = fillEmptyLeaf(tree, "s2");
    expect(filled).toBe(true);
    expect(getSessionIds(layout)).toContain("s2");
  });
});

describe("hasEmptyLeaf", () => {
  it("returns true for empty leaf", () => {
    expect(hasEmptyLeaf({ type: "leaf", sessionId: null })).toBe(true);
  });

  it("returns false for non-empty leaf", () => {
    expect(hasEmptyLeaf({ type: "leaf", sessionId: "s1" })).toBe(false);
  });
});

describe("getSessionIds", () => {
  it("returns session ids from a tree", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", sessionId: "s1" },
        { type: "leaf", sessionId: "s2" },
      ],
    };
    expect(getSessionIds(tree)).toEqual(["s1", "s2"]);
  });

  it("skips null session ids", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", sessionId: "s1" },
        { type: "leaf", sessionId: null },
      ],
    };
    expect(getSessionIds(tree)).toEqual(["s1"]);
  });
});

describe("swapPanes", () => {
  it("swaps two session ids", () => {
    const tree: LayoutNode = {
      type: "split",
      direction: "horizontal",
      ratio: 0.5,
      children: [
        { type: "leaf", sessionId: "s1" },
        { type: "leaf", sessionId: "s2" },
      ],
    };
    const result = swapPanes(tree, "s1", "s2");
    expect(getSessionIds(result)).toEqual(["s2", "s1"]);
  });
});
