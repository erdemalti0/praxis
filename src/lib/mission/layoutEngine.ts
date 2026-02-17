import type { MissionStep } from "../../types/mission";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 110;
const HORIZONTAL_GAP = 50;
const VERTICAL_GAP = 80;

export { NODE_WIDTH, NODE_HEIGHT };

export interface LayoutResult {
  positions: Record<string, { x: number; y: number }>;
  totalWidth: number;
  totalHeight: number;
}

/**
 * Compute top-to-bottom DAG layout for mission steps.
 * Uses Kahn's algorithm (iterative topological sort) for correct layer assignment.
 * Within each layer, nodes are arranged side by side with subtree width consideration.
 */
export function computeTreeLayout(steps: MissionStep[]): LayoutResult {
  if (steps.length === 0) {
    return { positions: {}, totalWidth: 0, totalHeight: 0 };
  }

  const stepMap = new Map<string, MissionStep>();
  for (const s of steps) {
    stepMap.set(s.id, s);
  }

  // Find all leaf descendants of a node's subtree (nodes with no children)
  function getSubtreeLeaves(id: string, visited: Set<string>): string[] {
    if (visited.has(id)) return [];
    visited.add(id);
    const step = stepMap.get(id);
    if (!step || step.children.length === 0) return [id];
    const leaves: string[] = [];
    for (const childId of step.children) {
      if (stepMap.has(childId)) {
        leaves.push(...getSubtreeLeaves(childId, visited));
      }
    }
    return leaves.length > 0 ? leaves : [id];
  }

  // Build incoming edges: for each step, collect all parents (via children arrays) + dependencies
  const incomingEdges = new Map<string, Set<string>>();
  const outgoingEdges = new Map<string, Set<string>>();

  for (const s of steps) {
    if (!incomingEdges.has(s.id)) incomingEdges.set(s.id, new Set());
    if (!outgoingEdges.has(s.id)) outgoingEdges.set(s.id, new Set());

    for (const childId of s.children) {
      if (!incomingEdges.has(childId)) incomingEdges.set(childId, new Set());
      if (!outgoingEdges.has(childId)) outgoingEdges.set(childId, new Set());
      incomingEdges.get(childId)!.add(s.id);
      outgoingEdges.get(s.id)!.add(childId);
    }

    for (const depId of (s.dependencies || [])) {
      const depStep = stepMap.get(depId);
      if (depStep && depStep.children.length > 0) {
        // Dependency has children: connect from leaf descendants so we're placed after the whole subtree
        const leaves = getSubtreeLeaves(depId, new Set());
        for (const leafId of leaves) {
          if (!outgoingEdges.has(leafId)) outgoingEdges.set(leafId, new Set());
          incomingEdges.get(s.id)!.add(leafId);
          outgoingEdges.get(leafId)!.add(s.id);
        }
      } else {
        // No children: direct dependency edge
        if (!outgoingEdges.has(depId)) outgoingEdges.set(depId, new Set());
        incomingEdges.get(s.id)!.add(depId);
        outgoingEdges.get(depId)!.add(s.id);
      }
    }
  }

  // ── Kahn's algorithm: assign layers via longest-path topological ordering ──
  // inDegree tracks how many incoming edges remain for each node
  const inDegree = new Map<string, number>();
  for (const s of steps) {
    inDegree.set(s.id, (incomingEdges.get(s.id) || new Set()).size);
  }

  // Layer = longest path from any root to this node
  const layer = new Map<string, number>();

  // Start with all nodes that have no incoming edges (roots)
  const queue: string[] = [];
  for (const s of steps) {
    if (inDegree.get(s.id) === 0) {
      queue.push(s.id);
      layer.set(s.id, 0);
    }
  }

  // Process nodes in topological order
  let head = 0;
  while (head < queue.length) {
    const nodeId = queue[head++];
    const nodeLayer = layer.get(nodeId)!;
    const outgoing = outgoingEdges.get(nodeId) || new Set();

    for (const childId of outgoing) {
      if (!stepMap.has(childId)) continue;
      // Child's layer is at least nodeLayer + 1 (longest path)
      const currentChildLayer = layer.get(childId) ?? 0;
      layer.set(childId, Math.max(currentChildLayer, nodeLayer + 1));

      const remaining = (inDegree.get(childId) || 1) - 1;
      inDegree.set(childId, remaining);
      if (remaining === 0) {
        queue.push(childId);
      }
    }
  }

  // Handle any nodes not reached (cycles) — assign layer 0
  for (const s of steps) {
    if (!layer.has(s.id)) {
      layer.set(s.id, 0);
    }
  }

  // Group steps by layer
  const layers: string[][] = [];
  for (const s of steps) {
    const l = layer.get(s.id) || 0;
    while (layers.length <= l) layers.push([]);
    layers[l].push(s.id);
  }

  // Build position index per layer for O(1) lookups
  const layerPosition = new Map<string, number>();
  for (let l = 0; l < layers.length; l++) {
    for (let i = 0; i < layers[l].length; i++) {
      layerPosition.set(layers[l][i], i);
    }
  }

  // Sort within each layer: prefer order based on parent position in previous layer
  function getMinParentIdx(id: string): number {
    const incoming = incomingEdges.get(id);
    if (!incoming || incoming.size === 0) return Infinity;
    let min = Infinity;
    for (const p of incoming) {
      const idx = layerPosition.get(p);
      if (idx !== undefined && idx < min) min = idx;
    }
    return min;
  }

  for (let l = 1; l < layers.length; l++) {
    layers[l].sort((a, b) => getMinParentIdx(a) - getMinParentIdx(b));
    for (let i = 0; i < layers[l].length; i++) {
      layerPosition.set(layers[l][i], i);
    }
  }

  // Position nodes: each layer is a row, nodes arranged side by side
  const positions: Record<string, { x: number; y: number }> = {};

  // ── Compute subtree widths iteratively (bottom-up by layer) ──
  const subtreeWidth = new Map<string, number>();

  // Process layers bottom-up so children are computed before parents
  for (let l = layers.length - 1; l >= 0; l--) {
    for (const id of layers[l]) {
      const step = stepMap.get(id);
      if (!step || step.children.length === 0) {
        subtreeWidth.set(id, NODE_WIDTH);
        continue;
      }
      const childrenTotalWidth = step.children.reduce((sum, childId, idx) => {
        const w = subtreeWidth.get(childId) || NODE_WIDTH;
        return sum + w + (idx > 0 ? HORIZONTAL_GAP : 0);
      }, 0);
      subtreeWidth.set(id, Math.max(NODE_WIDTH, childrenTotalWidth));
    }
  }

  // Position each layer
  for (let l = 0; l < layers.length; l++) {
    const y = l * (NODE_HEIGHT + VERTICAL_GAP);
    const layerNodes = layers[l];

    let x = 0;
    for (const id of layerNodes) {
      const w = subtreeWidth.get(id) || NODE_WIDTH;
      positions[id] = { x: x + (w - NODE_WIDTH) / 2, y };
      x += w + HORIZONTAL_GAP;
    }
  }

  // Second pass: for nodes with children, center parent over its children
  for (let l = layers.length - 2; l >= 0; l--) {
    for (const id of layers[l]) {
      const step = stepMap.get(id);
      if (!step || step.children.length === 0) continue;
      const childPositions = step.children
        .map((cid) => positions[cid])
        .filter(Boolean);
      if (childPositions.length === 0) continue;
      const minX = Math.min(...childPositions.map((p) => p.x));
      const maxX = Math.max(...childPositions.map((p) => p.x + NODE_WIDTH));
      const centerX = minX + (maxX - minX - NODE_WIDTH) / 2;
      positions[id] = { ...positions[id], x: centerX };
    }
  }

  // Final pass: ensure no overlaps within each layer
  for (let l = 0; l < layers.length; l++) {
    const sorted = layers[l]
      .filter((id) => positions[id])
      .sort((a, b) => positions[a].x - positions[b].x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = positions[sorted[i - 1]];
      const curr = positions[sorted[i]];
      const minX = prev.x + NODE_WIDTH + HORIZONTAL_GAP;
      if (curr.x < minX) {
        curr.x = minX;
      }
    }
  }

  // Calculate total bounds
  let totalWidth = 0;
  let totalHeight = 0;
  for (const pos of Object.values(positions)) {
    totalWidth = Math.max(totalWidth, pos.x + NODE_WIDTH);
    totalHeight = Math.max(totalHeight, pos.y + NODE_HEIGHT);
  }

  return { positions, totalWidth, totalHeight };
}
