import { useState } from "react";
import { NODE_WIDTH, NODE_HEIGHT } from "../../lib/mission/layoutEngine";
import type { MissionStepStatus } from "../../types/mission";

interface MissionStepEdgeProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  status?: MissionStepStatus;
  edgeId: string;
  isDependency?: boolean;
  onDisconnect?: () => void;
}

const STATUS_COLORS: Record<string, { stroke: string; glow: string }> = {
  pending: { stroke: "var(--vp-border-medium)", glow: "" },
  in_progress: { stroke: "var(--vp-accent-blue)", glow: "var(--vp-accent-blue-bg-hover)" },
  done: { stroke: "var(--vp-accent-green)", glow: "" },
  blocked: { stroke: "var(--vp-accent-amber)", glow: "" },
};

export default function MissionStepEdge({ fromX, fromY, toX, toY, status = "pending", edgeId, isDependency = false, onDisconnect }: MissionStepEdgeProps) {
  const [hovered, setHovered] = useState(false);

  const startX = fromX + NODE_WIDTH / 2;
  const startY = fromY + NODE_HEIGHT;
  const endX = toX + NODE_WIDTH / 2;
  const endY = toY;

  const midY = (startY + endY) / 2;
  const midX = (startX + endX) / 2;

  const d = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;

  const colors = STATUS_COLORS[status] || STATUS_COLORS.pending;

  return (
    <g style={{ pointerEvents: "auto" }}>
      {/* Glow layer for in_progress */}
      {colors.glow && (
        <path
          d={d}
          fill="none"
          stroke={colors.glow}
          strokeWidth={8}
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />
      )}
      {/* Invisible wide hit area for hover/click */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        strokeLinecap="round"
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          if (onDisconnect) {
            e.stopPropagation();
            onDisconnect();
          }
        }}
      />
      {/* Main edge */}
      <path
        d={d}
        fill="none"
        stroke={hovered ? "var(--vp-accent-red)" : colors.stroke}
        strokeWidth={hovered ? 2.5 : 2}
        strokeLinecap="round"
        strokeDasharray={isDependency ? "8 5" : status === "blocked" ? "6 4" : undefined}
        opacity={isDependency ? 0.7 : 1}
        style={{ transition: "stroke 0.15s, stroke-width 0.15s", pointerEvents: "none" }}
      />
      {/* Arrow dot at end */}
      <circle
        cx={endX}
        cy={endY}
        r={3.5}
        fill={hovered ? "var(--vp-accent-red)" : colors.stroke}
        style={{ transition: "fill 0.15s", pointerEvents: "none" }}
      />
      {/* Disconnect button — shown on hover at midpoint */}
      {hovered && onDisconnect && (
        <g
          onClick={(e) => { e.stopPropagation(); onDisconnect(); }}
          style={{ cursor: "pointer" }}
        >
          <circle cx={midX} cy={midY} r={11} fill="var(--vp-bg-tertiary)" stroke="var(--vp-accent-red)" strokeWidth={1.5} />
          {/* X icon */}
          <line x1={midX - 3.5} y1={midY - 3.5} x2={midX + 3.5} y2={midY + 3.5} stroke="var(--vp-accent-red)" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={midX + 3.5} y1={midY - 3.5} x2={midX - 3.5} y2={midY + 3.5} stroke="var(--vp-accent-red)" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}
