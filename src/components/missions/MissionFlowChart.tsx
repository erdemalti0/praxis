import { useMemo, useState, useCallback, useRef } from "react";
import type { Mission, MissionStep } from "../../types/mission";
import { computeTreeLayout, NODE_WIDTH, NODE_HEIGHT } from "../../lib/mission/layoutEngine";
import MissionStepNode from "./MissionStepNode";
import MissionStepEdge from "./MissionStepEdge";
import MissionStepDialog from "./MissionStepDialog";
import { useMissionStore } from "../../stores/missionStore";
import { Plus, RotateCcw, ZoomIn, ZoomOut, Workflow, Link } from "lucide-react";

interface MissionFlowChartProps {
  mission: Mission;
  projectPath: string;
}

const PADDING = 60;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const PORT_RADIUS = 6;

export default function MissionFlowChart({ mission, projectPath }: MissionFlowChartProps) {
  const addStep = useMissionStore((s) => s.addStep);
  const updateStep = useMissionStore((s) => s.updateStep);
  const deleteStep = useMissionStore((s) => s.deleteStep);
  const cycleStepStatus = useMissionStore((s) => s.cycleStepStatus);
  const connectSteps = useMissionStore((s) => s.connectSteps);
  const disconnectSteps = useMissionStore((s) => s.disconnectSteps);
  const [view, setView] = useState({ panX: PADDING, panY: PADDING, zoom: 1 });
  const pan = { x: view.panX, y: view.panY };
  const zoom = view.zoom;
  const setPan = (p: { x: number; y: number }) => setView((v) => ({ ...v, panX: p.x, panY: p.y }));
  const setZoom = (fn: (z: number) => number) => setView((v) => ({ ...v, zoom: fn(v.zoom) }));
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Step dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogParentId, setDialogParentId] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<MissionStep | null>(null);

  // Connection drag state
  const [connecting, setConnecting] = useState<{
    fromStepId: string;
    fromX: number;
    fromY: number;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const layout = useMemo(() => computeTreeLayout(mission.steps), [mission.steps]);

  // Convert screen coordinates to SVG canvas coordinates
  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }, [pan, zoom]);

  // Find which node the mouse is over (by checking bounds)
  const findNodeAtPosition = useCallback((canvasX: number, canvasY: number): string | null => {
    for (const step of mission.steps) {
      const pos = layout.positions[step.id];
      if (!pos) continue;
      if (
        canvasX >= pos.x && canvasX <= pos.x + NODE_WIDTH &&
        canvasY >= pos.y && canvasY <= pos.y + NODE_HEIGHT
      ) {
        return step.id;
      }
    }
    return null;
  }, [mission.steps, layout.positions]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    // Mouse position relative to container
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Smooth zoom factor — multiplicative scaling with dampened trackpad sensitivity
    const rawDelta = -e.deltaY;
    const dampened = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), 60);
    const factor = 1 + dampened * 0.002;

    // Single atomic update for both zoom and pan
    setView((prev) => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * factor));
      const scale = newZoom / prev.zoom;
      return {
        zoom: newZoom,
        panX: mouseX - scale * (mouseX - prev.panX),
        panY: mouseY - scale * (mouseY - prev.panY),
      };
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (connecting) return; // Don't pan while connecting
    if ((e.target as HTMLElement).closest("[data-step-node]")) return;
    if ((e.target as SVGElement).closest("[data-port]")) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan, connecting]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (connecting) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setConnecting((prev) => prev ? { ...prev, mouseX: canvasPos.x, mouseY: canvasPos.y } : null);
      return;
    }
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, [isPanning, connecting, screenToCanvas]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (connecting) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      const targetId = findNodeAtPosition(canvasPos.x, canvasPos.y);
      if (targetId && targetId !== connecting.fromStepId) {
        // Dragged node becomes child of the target node
        connectSteps(projectPath, mission.id, targetId, connecting.fromStepId);
      }
      setConnecting(null);
      return;
    }
    setIsPanning(false);
  }, [connecting, screenToCanvas, findNodeAtPosition, connectSteps, projectPath, mission.id]);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    setConnecting(null);
  }, []);

  // Start connection from a node's output port
  const handleStartConnect = useCallback((stepId: string) => {
    const pos = layout.positions[stepId];
    if (!pos) return;
    const fromX = pos.x + NODE_WIDTH / 2;
    const fromY = pos.y + NODE_HEIGHT;
    setConnecting({
      fromStepId: stepId,
      fromX,
      fromY,
      mouseX: fromX,
      mouseY: fromY + 20,
    });
  }, [layout.positions]);

  const handleDisconnect = useCallback((parentId: string, childId: string) => {
    disconnectSteps(projectPath, mission.id, parentId, childId);
  }, [projectPath, mission.id, disconnectSteps]);

  const handleAddChild = useCallback((parentId: string) => {
    setDialogParentId(parentId);
    setEditingStep(null);
    setDialogOpen(true);
  }, []);

  const handleAddRoot = useCallback(() => {
    setDialogParentId(null);
    setEditingStep(null);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((step: MissionStep) => {
    setEditingStep(step);
    setDialogParentId(null);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback((stepId: string) => {
    deleteStep(projectPath, mission.id, stepId);
  }, [projectPath, mission.id, deleteStep]);

  const handleStatusCycle = useCallback((stepId: string) => {
    cycleStepStatus(projectPath, mission.id, stepId);
  }, [projectPath, mission.id, cycleStepStatus]);

  const handleDialogSubmit = useCallback((title: string, description: string, prompt?: string) => {
    if (editingStep) {
      updateStep(projectPath, mission.id, editingStep.id, { title, description, prompt });
    } else {
      addStep(projectPath, mission.id, dialogParentId, title, description, prompt);
    }
  }, [editingStep, dialogParentId, projectPath, mission.id, addStep, updateStep]);

  const handleReset = useCallback(() => {
    setView({ panX: PADDING, panY: PADDING, zoom: 1 });
  }, []);

  // Build edges (parent-child + dependency)
  const edges: { fromId: string; toId: string; status: import("../../types/mission").MissionStepStatus; isDependency: boolean }[] = [];
  const stepMap = new Map(mission.steps.map((s) => [s.id, s]));
  for (const step of mission.steps) {
    for (const childId of step.children) {
      const child = stepMap.get(childId);
      edges.push({ fromId: step.id, toId: childId, status: child?.status || "pending", isDependency: false });
    }
    for (const depId of (step.dependencies || [])) {
      if (stepMap.has(depId)) {
        edges.push({ fromId: depId, toId: step.id, status: step.status, isDependency: true });
      }
    }
  }

  const svgWidth = Math.max(layout.totalWidth + PADDING * 2, 800);
  const svgHeight = Math.max(layout.totalHeight + PADDING * 2, 600);

  // Progress stats
  const total = mission.steps.length;
  const done = mission.steps.filter((s) => s.status === "done").length;
  const inProgress = mission.steps.filter((s) => s.status === "in_progress").length;

  // Check which node the connecting line is hovering over
  const connectTarget = connecting ? findNodeAtPosition(connecting.mouseX, connecting.mouseY) : null;
  const validTarget = connectTarget && connectTarget !== connecting?.fromStepId;

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{
        overflow: "hidden",
        position: "relative",
        cursor: connecting ? "crosshair" : isPanning ? "grabbing" : "grab",
        background: "var(--vp-bg-secondary)",
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Dot grid background */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <defs>
          <pattern id="dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="12" cy="12" r="0.8" fill="var(--vp-bg-surface)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>

      {/* Top toolbar */}
      <div
        style={{
          position: "absolute", top: 12, left: 12, right: 12, zIndex: 10,
          display: "flex", alignItems: "center", gap: 8,
        }}
      >
        {/* Mission title */}
        <div style={{
          fontSize: 13, fontWeight: 600, color: "var(--vp-text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          flex: 1,
        }}>
          {mission.title}
        </div>

        {/* Progress badge */}
        {total > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 8,
            background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-subtle)",
            fontSize: 10, color: "var(--vp-text-muted)",
          }}>
            <div style={{
              width: 50, height: 3, borderRadius: 2,
              background: "var(--vp-bg-surface-hover)",
              overflow: "hidden",
            }}>
              <div style={{
                width: `${(done / total) * 100}%`,
                height: "100%", borderRadius: 2,
                background: "linear-gradient(90deg, var(--vp-accent-green), var(--vp-accent-green-bright))",
                transition: "width 0.3s ease",
              }} />
            </div>
            <span>{done}/{total}</span>
            {inProgress > 0 && (
              <span style={{ color: "var(--vp-accent-blue)" }}>{inProgress} active</span>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 3 }}>
          <button
            onClick={handleAddRoot}
            title="Add root step"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 8,
              background: "var(--vp-accent-blue-bg)", border: "1px solid var(--vp-accent-blue-border)",
              color: "var(--vp-accent-blue)", fontSize: 11, fontWeight: 500, cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-accent-blue-bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--vp-accent-blue-bg)"; }}
          >
            <Plus size={12} /> Add Step
          </button>

          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 0.15))}
            title="Zoom in"
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-subtle)",
              color: "var(--vp-text-dim)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <ZoomIn size={12} />
          </button>

          <button
            onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 0.15))}
            title="Zoom out"
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-subtle)",
              color: "var(--vp-text-dim)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <ZoomOut size={12} />
          </button>

          <button
            onClick={handleReset}
            title="Reset view"
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-subtle)",
              color: "var(--vp-text-dim)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <RotateCcw size={12} />
          </button>

          <span style={{
            fontSize: 9, color: "var(--vp-text-subtle)", alignSelf: "center", marginLeft: 2,
            fontFamily: "monospace",
          }}>
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* Connection hint */}
      {connecting && (
        <div style={{
          position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
          zIndex: 10, padding: "6px 16px", borderRadius: 8,
          background: "var(--vp-accent-blue-bg)", border: "1px solid var(--vp-accent-blue-border)",
          color: "var(--vp-accent-blue)", fontSize: 11, fontWeight: 500,
          display: "flex", alignItems: "center", gap: 6,
          pointerEvents: "none",
        }}>
          <Link size={12} />
          {validTarget ? "Release to connect" : "Drag to a node to connect"}
        </div>
      )}

      {/* Empty state */}
      {mission.steps.length === 0 && (
        <div
          className="flex flex-col items-center justify-center h-full"
          style={{ color: "var(--vp-text-subtle)", gap: 12, position: "relative", zIndex: 5 }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "var(--vp-accent-blue-bg)", border: "1px solid var(--vp-accent-blue-bg)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Workflow size={24} style={{ color: "var(--vp-accent-blue)", opacity: 0.5 }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--vp-text-faint)", marginBottom: 4 }}>
              Start building your workflow
            </div>
            <div style={{ fontSize: 11, color: "var(--vp-text-subtle)" }}>
              Click "Add Step" to create your first step, then branch out
            </div>
          </div>
        </div>
      )}

      {/* SVG Canvas */}
      {mission.steps.length > 0 && (
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            pointerEvents: "none",
            position: "relative",
          }}
        >
          {/* Edges */}
          {edges.map(({ fromId, toId, status, isDependency }) => {
            const fromPos = layout.positions[fromId];
            const toPos = layout.positions[toId];
            if (!fromPos || !toPos) return null;
            return (
              <MissionStepEdge
                key={`${isDependency ? "dep" : "edge"}-${fromId}-${toId}`}
                edgeId={`${fromId}-${toId}`}
                fromX={fromPos.x}
                fromY={fromPos.y}
                toX={toPos.x}
                toY={toPos.y}
                status={status}
                isDependency={isDependency}
                onDisconnect={isDependency ? undefined : () => handleDisconnect(fromId, toId)}
              />
            );
          })}

          {/* Temporary connection line while dragging */}
          {connecting && (
            <g>
              <line
                x1={connecting.fromX}
                y1={connecting.fromY}
                x2={connecting.mouseX}
                y2={connecting.mouseY}
                stroke={validTarget ? "var(--vp-accent-blue)" : "var(--vp-accent-blue-glow)"}
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeLinecap="round"
              />
              {/* Target highlight */}
              {validTarget && connectTarget && layout.positions[connectTarget] && (
                <rect
                  x={layout.positions[connectTarget].x - 3}
                  y={layout.positions[connectTarget].y - 3}
                  width={NODE_WIDTH + 6}
                  height={NODE_HEIGHT + 6}
                  rx={16}
                  ry={16}
                  fill="none"
                  stroke="var(--vp-accent-blue)"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  opacity={0.6}
                />
              )}
            </g>
          )}

          {/* Output connector ports (bottom center of each node) */}
          {mission.steps.map((step) => {
            const pos = layout.positions[step.id];
            if (!pos) return null;
            const cx = pos.x + NODE_WIDTH / 2;
            const cy = pos.y + NODE_HEIGHT;
            const isSource = connecting?.fromStepId === step.id;
            return (
              <g
                key={`port-out-${step.id}`}
                data-port
                style={{ pointerEvents: "auto", cursor: "crosshair" }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleStartConnect(step.id);
                }}
              >
                {/* Invisible larger hit area */}
                <circle cx={cx} cy={cy} r={12} fill="transparent" />
                {/* Visible port */}
                <circle
                  cx={cx} cy={cy} r={PORT_RADIUS}
                  fill={isSource ? "var(--vp-accent-blue)" : "var(--vp-bg-tertiary)"}
                  stroke={isSource ? "var(--vp-accent-blue)" : "var(--vp-border-medium)"}
                  strokeWidth={1.5}
                  style={{ transition: "all 0.15s" }}
                />
                {/* Plus icon in port */}
                <line x1={cx - 2.5} y1={cy} x2={cx + 2.5} y2={cy}
                  stroke={isSource ? "var(--vp-text-primary)" : "var(--vp-border-strong)"} strokeWidth={1.2} strokeLinecap="round" />
                <line x1={cx} y1={cy - 2.5} x2={cx} y2={cy + 2.5}
                  stroke={isSource ? "var(--vp-text-primary)" : "var(--vp-border-strong)"} strokeWidth={1.2} strokeLinecap="round" />
              </g>
            );
          })}

          {/* Input connector ports (top center of each node) — only visible when connecting */}
          {connecting && mission.steps.map((step) => {
            if (step.id === connecting.fromStepId) return null;
            const pos = layout.positions[step.id];
            if (!pos) return null;
            const cx = pos.x + NODE_WIDTH / 2;
            const cy = pos.y;
            const isTarget = connectTarget === step.id;
            return (
              <g key={`port-in-${step.id}`}>
                <circle
                  cx={cx} cy={cy} r={PORT_RADIUS}
                  fill={isTarget ? "var(--vp-accent-blue)" : "var(--vp-bg-tertiary)"}
                  stroke={isTarget ? "var(--vp-accent-blue)" : "var(--vp-accent-blue-border)"}
                  strokeWidth={1.5}
                  style={{ transition: "all 0.15s" }}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {mission.steps.map((step) => {
            const pos = layout.positions[step.id];
            if (!pos) return null;
            return (
              <foreignObject
                key={step.id}
                x={pos.x}
                y={pos.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                style={{ overflow: "visible", pointerEvents: "auto" }}
              >
                <div data-step-node>
                  <MissionStepNode
                    step={step}
                    projectPath={projectPath}
                    onAddChild={handleAddChild}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onStatusCycle={handleStatusCycle}
                  />
                </div>
              </foreignObject>
            );
          })}
        </svg>
      )}

      {/* Step Dialog */}
      <MissionStepDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleDialogSubmit}
        editStep={editingStep}
      />
    </div>
  );
}
