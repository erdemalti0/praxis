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
 * Uses topological layering: each step is placed in the layer after its deepest parent/dependency.
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

  // Build incoming edges: for each step, collect all parents (via children arrays) + dependencies
  const incomingEdges = new Map<string, Set<string>>();
  for (const s of steps) {
    if (!incomingEdges.has(s.id)) incomingEdges.set(s.id, new Set());
    for (const childId of s.children) {
      if (!incomingEdges.has(childId)) incomingEdges.set(childId, new Set());
      incomingEdges.get(childId)!.add(s.id);
    }
    for (const depId of (s.dependencies || [])) {
      if (!incomingEdges.has(s.id)) incomingEdges.set(s.id, new Set());
      incomingEdges.get(s.id)!.add(depId);
    }
  }

  // Assign layers via longest-path topological ordering
  const layer = new Map<string, number>();

  function computeLayer(id: string, visited: Set<string>): number {
    if (layer.has(id)) return layer.get(id)!;
    if (visited.has(id)) return 0; // cycle guard
    visited.add(id);
    const incoming = incomingEdges.get(id) || new Set();
    let maxParentLayer = -1;
    for (const parentId of incoming) {
      if (stepMap.has(parentId)) {
        maxParentLayer = Math.max(maxParentLayer, computeLayer(parentId, visited));
      }
    }
    const myLayer = maxParentLayer + 1;
    layer.set(id, myLayer);
    return myLayer;
  }

  for (const s of steps) {
    computeLayer(s.id, new Set());
  }

  // Group steps by layer
  const layers: string[][] = [];
  for (const s of steps) {
    const l = layer.get(s.id) || 0;
    while (layers.length <= l) layers.push([]);
    layers[l].push(s.id);
  }

  // Sort within each layer: prefer order based on parent position in previous layer
  // For root layer (0), use original step order
  for (let l = 1; l < layers.length; l++) {
    layers[l].sort((a, b) => {
      const aIncoming = [...(incomingEdges.get(a) || [])];
      const bIncoming = [...(incomingEdges.get(b) || [])];
      const aParentIdx = Math.min(...aIncoming.map((p) => {
        const pLayer = layer.get(p);
        if (pLayer === undefined) return Infinity;
        return layers[pLayer]?.indexOf(p) ?? Infinity;
      }));
      const bParentIdx = Math.min(...bIncoming.map((p) => {
        const pLayer = layer.get(p);
        if (pLayer === undefined) return Infinity;
        return layers[pLayer]?.indexOf(p) ?? Infinity;
      }));
      return aParentIdx - bParentIdx;
    });
  }

  // Position nodes: each layer is a row, nodes arranged side by side
  const positions: Record<string, { x: number; y: number }> = {};

  // First pass: compute subtree widths for each node (only counting direct children)
  const subtreeWidth = new Map<string, number>();

  function computeWidth(id: string, visited: Set<string>): number {
    if (subtreeWidth.has(id)) return subtreeWidth.get(id)!;
    if (visited.has(id)) { subtreeWidth.set(id, NODE_WIDTH); return NODE_WIDTH; }
    visited.add(id);
    const step = stepMap.get(id);
    if (!step || step.children.length === 0) {
      subtreeWidth.set(id, NODE_WIDTH);
      return NODE_WIDTH;
    }
    const childrenTotalWidth = step.children.reduce((sum, childId, idx) => {
      const w = computeWidth(childId, visited);
      return sum + w + (idx > 0 ? HORIZONTAL_GAP : 0);
    }, 0);
    const width = Math.max(NODE_WIDTH, childrenTotalWidth);
    subtreeWidth.set(id, width);
    return width;
  }

  for (const s of steps) {
    computeWidth(s.id, new Set());
  }

  // Position each layer
  for (let l = 0; l < layers.length; l++) {
    const y = l * (NODE_HEIGHT + VERTICAL_GAP);
    const layerNodes = layers[l];

    // Total width of this layer
    const totalLayerWidth = layerNodes.reduce((sum, id, idx) => {
      return sum + (subtreeWidth.get(id) || NODE_WIDTH) + (idx > 0 ? HORIZONTAL_GAP : 0);
    }, 0);

    // Center layer if it's narrower than the widest layer
    let x = 0;
    for (const id of layerNodes) {
      const w = subtreeWidth.get(id) || NODE_WIDTH;
      positions[id] = { x: x + (w - NODE_WIDTH) / 2, y };
      x += w + HORIZONTAL_GAP;
    }
  }

  // Second pass: for nodes with children, try to center parent over its children
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
      // Only recenter if it doesn't overlap with siblings
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
