import { useState } from "react";
import { Play, Pause, CheckCircle, AlertCircle, Clock, ChevronDown } from "lucide-react";
import type { ChatAgentId } from "../../types/agentPanel";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import type { BuildExecutorState, StepExecutionState, StepExecutionStatus } from "../../lib/agentPanel/buildExecutor";

const STATUS_CONFIG: Record<StepExecutionStatus, { color: string; icon: typeof Play }> = {
  pending: { color: "var(--vp-text-dim)", icon: Clock },
  running: { color: "#3b82f6", icon: Play },
  complete: { color: "#22c55e", icon: CheckCircle },
  error: { color: "#ef4444", icon: AlertCircle },
  skipped: { color: "var(--vp-text-dim)", icon: Clock },
};

const AGENT_IDS: ChatAgentId[] = ["claude-code", "opencode", "gemini", "codex"];

interface Props {
  executorState: BuildExecutorState | null;
  stepTitles: Record<string, string>;
  onPlay: () => void;
  onPause: () => void;
  onConfigureStep: (stepId: string, agentId: ChatAgentId, model?: string) => void;
}

export default function BuildModePanel({
  executorState,
  stepTitles,
  onPlay,
  onPause,
  onConfigureStep,
}: Props) {
  if (!executorState) {
    return (
      <div style={{ padding: 16, color: "var(--vp-text-dim)", fontSize: 13, textAlign: "center" }}>
        <p>No active build.</p>
        <p style={{ fontSize: 11, marginTop: 4 }}>
          Generate a plan in Plan mode first, then import to MissionBoard.
        </p>
      </div>
    );
  }

  const { status, steps, currentStepId } = executorState;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12 }}>
      {/* Header with controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--vp-text-primary)" }}>
          Build Mode
        </span>
        <span style={{
          fontSize: 10,
          padding: "2px 6px",
          borderRadius: 4,
          background: status === "running" ? "rgba(59,130,246,0.15)" : "var(--vp-bg-surface-hover)",
          color: status === "running" ? "#3b82f6" : "var(--vp-text-dim)",
          fontWeight: 500,
        }}>
          {status}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {(status === "idle" || status === "paused") && (
            <button
              onClick={onPlay}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: 6,
                border: "1px solid #22c55e",
                background: "rgba(34,197,94,0.1)",
                color: "#22c55e", fontSize: 11, cursor: "pointer",
              }}
            >
              <Play size={11} /> {status === "paused" ? "Resume" : "Start"}
            </button>
          )}
          {status === "running" && (
            <button
              onClick={onPause}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: 6,
                border: "1px solid #f59e0b",
                background: "rgba(245,158,11,0.1)",
                color: "#f59e0b", fontSize: 11, cursor: "pointer",
              }}
            >
              <Pause size={11} /> Pause
            </button>
          )}
        </div>
      </div>

      {/* Step list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {steps.map((step) => (
          <StepRow
            key={step.stepId}
            step={step}
            title={stepTitles[step.stepId] || step.stepId}
            isCurrent={step.stepId === currentStepId}
            onConfigure={(agentId, model) => onConfigureStep(step.stepId, agentId, model)}
          />
        ))}
      </div>
    </div>
  );
}

function StepRow({
  step,
  title,
  isCurrent,
  onConfigure,
}: {
  step: StepExecutionState;
  title: string;
  isCurrent: boolean;
  onConfigure: (agentId: ChatAgentId, model?: string) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const statusCfg = STATUS_CONFIG[step.status];
  const StatusIcon = statusCfg.icon;
  const agentConfig = AGENT_CONFIGS[step.config.agentId];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 8,
        border: isCurrent ? `1px solid ${statusCfg.color}` : "1px solid transparent",
        background: isCurrent ? `${statusCfg.color}08` : "transparent",
      }}
    >
      <StatusIcon size={14} color={statusCfg.color} />
      <span style={{
        flex: 1,
        fontSize: 12,
        color: step.status === "complete" ? "var(--vp-text-dim)" : "var(--vp-text-primary)",
        fontWeight: isCurrent ? 500 : 400,
        textDecoration: step.status === "complete" ? "line-through" : "none",
      }}>
        {title}
      </span>

      {/* Agent selector dropdown */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          disabled={step.status === "running" || step.status === "complete"}
          style={{
            display: "flex", alignItems: "center", gap: 3,
            padding: "2px 6px", borderRadius: 4,
            border: "1px solid var(--vp-border-subtle)",
            background: "transparent",
            color: agentConfig.color, fontSize: 10, cursor: "pointer",
            opacity: step.status === "running" || step.status === "complete" ? 0.5 : 1,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: agentConfig.color }} />
          {agentConfig.shortLabel}
          <ChevronDown size={8} />
        </button>

        {dropdownOpen && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 99 }} onClick={() => setDropdownOpen(false)} />
            <div style={{
              position: "absolute", bottom: "calc(100% + 2px)", right: 0,
              background: "var(--vp-bg-surface)", border: "1px solid var(--vp-border-panel)",
              borderRadius: 6, padding: 3, zIndex: 100, minWidth: 120,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}>
              {AGENT_IDS.map((id) => {
                const cfg = AGENT_CONFIGS[id];
                return (
                  <button
                    key={id}
                    onClick={() => {
                      onConfigure(id);
                      setDropdownOpen(false);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      width: "100%", padding: "4px 8px", borderRadius: 4,
                      border: "none",
                      background: id === step.config.agentId ? `${cfg.color}15` : "transparent",
                      color: id === step.config.agentId ? cfg.color : "var(--vp-text-secondary)",
                      fontSize: 11, cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color }} />
                    {cfg.shortLabel}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Duration if complete */}
      {step.completedAt && step.startedAt && (
        <span style={{ fontSize: 9, color: "var(--vp-text-dim)" }}>
          {((step.completedAt - step.startedAt) / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}
