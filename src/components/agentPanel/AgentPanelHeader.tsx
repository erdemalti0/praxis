import type { ChatAgentId, AgentSession } from "../../types/agentPanel";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import { Trash2, Loader, ArrowLeft, Square, ShieldAlert } from "lucide-react";

interface Props {
  activeAgentId: ChatAgentId;
  session: AgentSession | null;
  onClear: () => void;
  sessionName?: string;
  onBack?: () => void;
  onEndSession?: () => void;
}

export default function AgentPanelHeader({
  activeAgentId,
  session,
  onClear,
  sessionName,
  onBack,
  onEndSession,
}: Props) {
  const config = AGENT_CONFIGS[activeAgentId];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderBottom: "1px solid var(--vp-border-subtle)",
        flexShrink: 0,
        height: 40,
      }}
    >
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          title="Back to sessions"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--vp-text-dim)",
            padding: 4,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
          }}
        >
          <ArrowLeft size={14} />
        </button>
      )}

      {/* Agent name + status */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {config.logo ? (
          <img src={config.logo} alt={config.label} style={{ width: 18, height: 18, objectFit: "contain", flexShrink: 0 }} />
        ) : (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: session?.status === "running" ? "#f59e0b"
                : session?.status === "error" ? "#ef4444"
                : session ? "#22c55e"
                : "#374151",
              flexShrink: 0,
            }}
          />
        )}
        <span style={{ fontSize: 13, fontWeight: 500, color: config.color }}>
          {config.label}
        </span>
        {session?.status === "running" && (
          <Loader size={12} className="animate-spin" style={{ color: config.color }} />
        )}
      </div>

      {/* Session name */}
      {sessionName && (
        <span
          style={{
            fontSize: 11,
            color: "var(--vp-text-dim)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 120,
          }}
        >
          {sessionName}
        </span>
      )}

      {/* Auto-accept warning badge */}
      <span
        title="Auto-accept mode: Agent actions are not reviewed before execution"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 9,
          color: "#f59e0b",
          background: "rgba(245, 158, 11, 0.1)",
          border: "1px solid rgba(245, 158, 11, 0.2)",
          borderRadius: 4,
          padding: "1px 5px",
          fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        <ShieldAlert size={10} />
        Auto-accept
      </span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Cost + token info */}
      {session && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 11,
            color: "var(--vp-text-dim)",
            fontFamily: "var(--vp-font-mono, monospace)",
          }}
        >
          {session.totalCost > 0 && <span>${session.totalCost.toFixed(4)}</span>}
          {session.totalTokensIn + session.totalTokensOut > 0 && (
            <span>
              {((session.totalTokensIn + session.totalTokensOut) / 1000).toFixed(1)}k tok
            </span>
          )}
        </div>
      )}

      {/* Clear button */}
      <button
        onClick={onClear}
        title="Clear chat"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--vp-text-dim)",
          padding: 4,
          borderRadius: 4,
        }}
      >
        <Trash2 size={14} />
      </button>

      {/* End session button */}
      {onEndSession && (
        <button
          onClick={onEndSession}
          title="End session"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "none",
            border: "1px solid var(--vp-border-subtle)",
            cursor: "pointer",
            color: "var(--vp-text-dim)",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          <Square size={10} />
          End
        </button>
      )}
    </div>
  );
}
