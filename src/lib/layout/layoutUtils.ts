import type { LayoutNode } from "../../types/layout";

export function splitPane(
  layout: LayoutNode,
  targetSessionId: string,
  direction: "horizontal" | "vertical",
  newSessionId: string | null
): LayoutNode {
  if (layout.type === "leaf") {
    if (layout.sessionId === targetSessionId) {
      return {
        type: "split",
        direction,
        ratio: 0.5,
        children: [
          { type: "leaf", sessionId: targetSessionId },
          { type: "leaf", sessionId: newSessionId },
        ],
      };
    }
    return layout;
  }

  return {
    ...layout,
    children: [
      splitPane(layout.children[0], targetSessionId, direction, newSessionId),
      splitPane(layout.children[1], targetSessionId, direction, newSessionId),
    ],
  };
}

export function closePane(
  layout: LayoutNode,
  targetSessionId: string
): LayoutNode | null {
  if (layout.type === "leaf") {
    if (layout.sessionId === targetSessionId) {
      return null;
    }
    return layout;
  }

  const [left, right] = layout.children;

  if (left.type === "leaf" && left.sessionId === targetSessionId) {
    return right;
  }
  if (right.type === "leaf" && right.sessionId === targetSessionId) {
    return left;
  }

  const newLeft = closePane(left, targetSessionId);
  const newRight = closePane(right, targetSessionId);

  if (newLeft === null) return newRight;
  if (newRight === null) return newLeft;

  return {
    ...layout,
    children: [newLeft, newRight],
  };
}

export function updateRatio(
  layout: LayoutNode,
  path: number[],
  newRatio: number
): LayoutNode {
  const clamped = Math.min(0.85, Math.max(0.15, newRatio));

  if (path.length === 0) {
    if (layout.type === "split") {
      return { ...layout, ratio: clamped };
    }
    return layout;
  }

  if (layout.type === "leaf") return layout;

  const [head, ...rest] = path;
  const newChildren: [LayoutNode, LayoutNode] = [
    head === 0 ? updateRatio(layout.children[0], rest, newRatio) : layout.children[0],
    head === 1 ? updateRatio(layout.children[1], rest, newRatio) : layout.children[1],
  ];

  return { ...layout, children: newChildren };
}

export function swapPanes(
  layout: LayoutNode,
  sessionA: string,
  sessionB: string
): LayoutNode {
  if (sessionA === sessionB) return layout;

  if (layout.type === "leaf") {
    if (layout.sessionId === sessionA) {
      return { type: "leaf", sessionId: sessionB };
    }
    if (layout.sessionId === sessionB) {
      return { type: "leaf", sessionId: sessionA };
    }
    return layout;
  }

  return {
    ...layout,
    children: [
      swapPanes(layout.children[0], sessionA, sessionB),
      swapPanes(layout.children[1], sessionA, sessionB),
    ],
  };
}

/** Replace a specific sessionId with a new value (including null) throughout the tree */
export function replaceSession(
  layout: LayoutNode,
  targetSessionId: string,
  newSessionId: string | null
): LayoutNode {
  if (layout.type === "leaf") {
    if (layout.sessionId === targetSessionId) {
      return { type: "leaf", sessionId: newSessionId };
    }
    return layout;
  }
  return {
    ...layout,
    children: [
      replaceSession(layout.children[0], targetSessionId, newSessionId),
      replaceSession(layout.children[1], targetSessionId, newSessionId),
    ],
  };
}

/** Remove a pane and collapse the tree; returns empty leaf if last pane removed */
export function removePaneAndCollapse(layout: LayoutNode, sessionId: string): LayoutNode {
  const result = closePane(layout, sessionId);
  return result ?? { type: "leaf", sessionId: null };
}

/** Add a session to a layout: fills first empty leaf, or splits the first occupied leaf */
export function addSessionToLayout(layout: LayoutNode, sessionId: string): LayoutNode {
  const { layout: filled, filled: didFill } = fillEmptyLeaf(layout, sessionId);
  if (didFill) return filled;

  const firstSession = getFirstSessionId(layout);
  if (firstSession) {
    return splitPane(layout, firstSession, "horizontal", sessionId);
  }

  return { type: "leaf", sessionId };
}

function getFirstSessionId(layout: LayoutNode): string | null {
  if (layout.type === "leaf") return layout.sessionId;
  return getFirstSessionId(layout.children[0]) ?? getFirstSessionId(layout.children[1]);
}

export function getSessionIds(layout: LayoutNode): string[] {
  if (layout.type === "leaf") {
    return layout.sessionId ? [layout.sessionId] : [];
  }
  return [
    ...getSessionIds(layout.children[0]),
    ...getSessionIds(layout.children[1]),
  ];
}

/** Fill the first empty leaf (sessionId === null) in the layout tree */
export function fillEmptyLeaf(layout: LayoutNode, newSessionId: string): { layout: LayoutNode; filled: boolean } {
  if (layout.type === "leaf") {
    if (!layout.sessionId) {
      return { layout: { type: "leaf", sessionId: newSessionId }, filled: true };
    }
    return { layout, filled: false };
  }

  // Try left child first
  const left = fillEmptyLeaf(layout.children[0], newSessionId);
  if (left.filled) {
    return {
      layout: { ...layout, children: [left.layout, layout.children[1]] },
      filled: true,
    };
  }

  // Then right child
  const right = fillEmptyLeaf(layout.children[1], newSessionId);
  if (right.filled) {
    return {
      layout: { ...layout, children: [layout.children[0], right.layout] },
      filled: true,
    };
  }

  return { layout, filled: false };
}

/** Check if layout contains any empty leaf */
export function hasEmptyLeaf(layout: LayoutNode): boolean {
  if (layout.type === "leaf") return !layout.sessionId;
  return hasEmptyLeaf(layout.children[0]) || hasEmptyLeaf(layout.children[1]);
}

/**
 * Rebalance a layout tree so that same-direction split chains
 * distribute space equally among all their segments.
 *
 * Example: H-split(0.5)[A, H-split(0.5)[B, C]] → H-split(1/3)[A, H-split(0.5)[B, C]]
 * Result: A=33%, B=33%, C=33%
 */
export function rebalanceLayout(layout: LayoutNode): LayoutNode {
  if (layout.type === "leaf") return layout;

  const dir = layout.direction;
  // Flatten all segments along the same direction
  const segments = flattenSameDirection(layout, dir);
  // Rebuild as a right-leaning tree with equal ratios
  return buildBalanced(segments, dir);
}

/** Collect all child segments by flattening same-direction splits */
function flattenSameDirection(
  node: LayoutNode,
  dir: "horizontal" | "vertical"
): LayoutNode[] {
  if (node.type === "leaf") return [node];
  if (node.direction === dir) {
    return [
      ...flattenSameDirection(node.children[0], dir),
      ...flattenSameDirection(node.children[1], dir),
    ];
  }
  // Different direction — rebalance internally, treat as single segment
  return [rebalanceLayout(node)];
}

/** Build a right-leaning binary tree with equal ratios for N segments */
function buildBalanced(
  segments: LayoutNode[],
  dir: "horizontal" | "vertical"
): LayoutNode {
  if (segments.length === 1) return segments[0];
  // First segment gets 1/N of the space
  const ratio = 1 / segments.length;
  return {
    type: "split",
    direction: dir,
    ratio,
    children: [segments[0], buildBalanced(segments.slice(1), dir)],
  };
}
