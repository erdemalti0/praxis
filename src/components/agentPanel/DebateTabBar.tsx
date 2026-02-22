import { AGENT_CONFIGS } from "../../types/agentPanel";
import { useDebateStore } from "../../stores/debateStore";
import { Swords, X } from "lucide-react";

export default function DebateTabBar() {
  const activeDebate = useDebateStore((s) => s.activeDebate);
  const setActiveTab = useDebateStore((s) => s.setActiveTab);
  const cancelDebate = useDebateStore((s) => s.cancelDebate);
  const clearDebate = useDebateStore((s) => s.clearDebate);

  if (!activeDebate) return null;

  const { config, activeTab, status, currentRound, rounds } = activeDebate;
  const configA = AGENT_CONFIGS[config.agentA];
  const configB = AGENT_CONFIGS[config.agentB];
  if (!configA || !configB) return null;
  const isRunning = status === "running";
  const isComplete = status === "complete";

  const hasSynthesis = !!activeDebate.synthesisMessageId;

  const tabs: Array<{ id: "a" | "b" | "unified" | "synthesis"; label: string; color?: string }> = [
    { id: "unified", label: "Combined" },
    { id: "a", label: configA.shortLabel, color: configA.color },
    { id: "b", label: configB.shortLabel, color: configB.color },
  ];

  if (hasSynthesis || isComplete) {
    tabs.push({ id: "synthesis", label: "Consensus", color: "#8b5cf6" });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "6px 12px",
        borderBottom: "1px solid var(--vp-border-subtle)",
        background: "rgba(139, 92, 246, 0.04)",
        flexShrink: 0,
      }}
    >
      {/* Debate indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginRight: 8,
          fontSize: 10,
          fontWeight: 600,
          color: "#8b5cf6",
        }}
      >
        <Swords size={12} />
        {config.mode === "multi-round" ? `Round ${currentRound}/${rounds.length}` : config.mode === "sequential" ? "Sequential" : "Side-by-Side"}
      </div>

      {/* Tab buttons */}
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "3px 10px",
              borderRadius: 4,
              border: "none",
              background: isActive ? (tab.color ? `${tab.color}20` : "rgba(139, 92, 246, 0.15)") : "transparent",
              color: isActive ? (tab.color || "#8b5cf6") : "var(--vp-text-dim)",
              fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {tab.color && (
              <span
                style={{
                  display: "inline-block",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: tab.color,
                  marginRight: 4,
                  verticalAlign: "middle",
                }}
              />
            )}
            {tab.label}
          </button>
        );
      })}

      {/* Status indicator */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        {isRunning && (
          <span style={{ fontSize: 10, color: "#f59e0b", display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "#f59e0b",
                animation: "pulse 1.5s infinite",
              }}
            />
            {rounds.some((r) => r.status === "synthesizing") ? "Synthesizing..." : "Running..."}
          </span>
        )}
        {isComplete && (
          <span style={{ fontSize: 10, color: "#22c55e" }}>Complete</span>
        )}
        {status === "error" && (
          <span style={{ fontSize: 10, color: "#ef4444" }}>Error</span>
        )}

        {/* Close / Cancel button */}
        <button
          onClick={() => {
            if (isRunning) {
              cancelDebate();
            } else {
              clearDebate();
            }
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--vp-text-dim)",
            padding: 2,
            display: "flex",
            alignItems: "center",
          }}
          title={isRunning ? "Cancel debate" : "Close debate"}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
