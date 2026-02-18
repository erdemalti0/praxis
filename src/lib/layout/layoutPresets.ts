import type { LayoutNode } from "../../types/layout";

export interface LayoutPreset {
  id: string;
  name: string;
  /** Number of terminal panes in this layout */
  paneCount: number;
  /** CSS grid template for the miniature icon (rows x cols visual) */
  iconGrid: string[][];
  /** Factory that returns a fresh LayoutNode tree with null sessionIds */
  createLayout: () => LayoutNode;
}

const leaf = (): LayoutNode => ({ type: "leaf", sessionId: null });

const split = (
  direction: "horizontal" | "vertical",
  a: LayoutNode,
  b: LayoutNode,
  ratio = 0.5
): LayoutNode => ({
  type: "split",
  direction,
  ratio,
  children: [a, b],
});

export const LAYOUT_PRESETS: LayoutPreset[] = [
  {
    id: "side-by-side",
    name: "Side by Side",
    paneCount: 2,
    iconGrid: [["a", "b"]],
    createLayout: () => split("horizontal", leaf(), leaf()),
  },
  {
    id: "stacked",
    name: "Stacked",
    paneCount: 2,
    iconGrid: [["a"], ["b"]],
    createLayout: () => split("vertical", leaf(), leaf()),
  },
  {
    id: "three-columns",
    name: "Three Columns",
    paneCount: 3,
    iconGrid: [["a", "b", "c"]],
    createLayout: () =>
      split("horizontal", leaf(), split("horizontal", leaf(), leaf()), 1 / 3),
  },
  {
    id: "three-rows",
    name: "Three Rows",
    paneCount: 3,
    iconGrid: [["a"], ["b"], ["c"]],
    createLayout: () =>
      split("vertical", leaf(), split("vertical", leaf(), leaf()), 1 / 3),
  },
  {
    id: "grid-2x2",
    name: "2x2 Grid",
    paneCount: 4,
    iconGrid: [
      ["a", "b"],
      ["c", "d"],
    ],
    createLayout: () =>
      split(
        "horizontal",
        split("vertical", leaf(), leaf()),
        split("vertical", leaf(), leaf())
      ),
  },
  {
    id: "main-right",
    name: "Main + 2 Right",
    paneCount: 3,
    iconGrid: [
      ["a", "b"],
      ["a", "c"],
    ],
    createLayout: () =>
      split("horizontal", leaf(), split("vertical", leaf(), leaf()), 0.6),
  },
  {
    id: "main-bottom",
    name: "Main + 2 Bottom",
    paneCount: 3,
    iconGrid: [
      ["a", "a"],
      ["b", "c"],
    ],
    createLayout: () =>
      split("vertical", leaf(), split("horizontal", leaf(), leaf()), 0.6),
  },
];

/** Count the number of leaves in a layout tree */
export function countLeaves(layout: LayoutNode): number {
  if (layout.type === "leaf") return 1;
  return countLeaves(layout.children[0]) + countLeaves(layout.children[1]);
}
