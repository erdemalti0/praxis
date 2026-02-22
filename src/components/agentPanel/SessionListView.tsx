import { useEffect, useCallback } from "react";
import { useSessionStore } from "../../stores/sessionStore";
import { useAgentPanelStore } from "../../stores/agentPanelStore";
import { useContextBridgeStore } from "../../stores/contextBridgeStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUIStore } from "../../stores/uiStore";
import { AGENT_CONFIGS } from "../../types/agentPanel";
import type { ChatAgentId } from "../../types/agentPanel";
import type { SessionSummary } from "../../types/agentSession";
import { listSessions, loadSession, deleteSession } from "../../lib/agentPanel/sessionPersistence";
import { initCliExtractor } from "../../lib/contextBridge/extractor";
import { Plus, Trash2, MessageSquare, Clock } from "lucide-react";

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function AgentDots({ agents }: { agents: ChatAgentId[] }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {agents.map((id) => (
        <span
          key={id}
          title={AGENT_CONFIGS[id].label}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: AGENT_CONFIGS[id].color,
            flexShrink: 0,
          }}
        />
      ))}
    </div>
  );
}

function SessionCard({
  session,
  onOpen,
  onDelete,
}: {
  session: SessionSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        padding: "10px 12px",
        borderRadius: 6,
        border: "1px solid var(--vp-border-subtle)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 10,
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--vp-bg-hover, rgba(255,255,255,0.04))")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {session.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--vp-text-dim)" }}>
          <AgentDots agents={session.agentsUsed} />
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <MessageSquare size={10} />
            {session.messageCount}
          </span>
          {session.totalCost > 0 && (
            <span style={{ fontFamily: "var(--vp-font-mono, monospace)" }}>
              ${session.totalCost.toFixed(4)}
            </span>
          )}
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Clock size={10} />
            {formatDate(session.updatedAt)}
          </span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete session"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--vp-text-dim)",
          padding: 4,
          borderRadius: 4,
          opacity: 0.5,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.5")}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function SessionListView() {
  const sessionList = useSessionStore((s) => s.sessionList);
  const isLoadingList = useSessionStore((s) => s.isLoadingList);
  const setSessionList = useSessionStore((s) => s.setSessionList);
  const setLoadingList = useSessionStore((s) => s.setLoadingList);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const setView = useSessionStore((s) => s.setView);
  const setCreateDialogOpen = useSessionStore((s) => s.setCreateDialogOpen);

  const restoreSession = useAgentPanelStore((s) => s.restoreSession);

  const homeDir = useSettingsStore((s) => s.homeDir);
  const selectedProject = useUIStore((s) => s.selectedProject);
  const projectPath = selectedProject?.path || "";

  const refreshList = useCallback(async () => {
    if (!homeDir || !projectPath) return;
    setLoadingList(true);
    try {
      const list = await listSessions(homeDir, projectPath);
      setSessionList(list);
    } catch {
      setSessionList([]);
    } finally {
      setLoadingList(false);
    }
  }, [homeDir, projectPath, setLoadingList, setSessionList]);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const handleOpenSession = useCallback(
    async (summary: SessionSummary) => {
      if (!homeDir || !projectPath) return;

      const session = loadSession(homeDir, projectPath, summary.id);
      if (!session) return;

      // Restore agent panel state
      restoreSession(session);

      // Restore context bridge entries
      const contextStore = useContextBridgeStore.getState();
      contextStore.clearAll();
      if (session.contextEntries.length > 0) {
        contextStore.addEntries(session.contextEntries);
      }

      // Init CLI extractor
      if (session.extractorConfig) {
        initCliExtractor(projectPath, session.extractorConfig).catch(console.error);
      }

      setActiveSession(session);
      setView("chat");
    },
    [homeDir, projectPath, restoreSession, setActiveSession, setView],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      if (!homeDir || !projectPath) return;
      await deleteSession(homeDir, projectPath, id);
      refreshList();
    },
    [homeDir, projectPath, refreshList],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
      }}
    >
      {/* Header */}
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
        <span style={{ fontSize: 13, fontWeight: 500 }}>Agent Sessions</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setCreateDialogOpen(true)}
          title="New Session"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "none",
            border: "1px solid var(--vp-border-subtle)",
            cursor: "pointer",
            color: "var(--vp-text)",
            padding: "3px 8px",
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          <Plus size={12} />
          New Session
        </button>
      </div>

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {isLoadingList && (
          <div style={{ textAlign: "center", padding: 20, color: "var(--vp-text-dim)", fontSize: 12 }}>
            Loading sessions...
          </div>
        )}

        {!isLoadingList && sessionList.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--vp-text-dim)", fontSize: 12 }}>
            No sessions yet. Start a new session to begin.
          </div>
        )}

        {sessionList.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            onOpen={() => handleOpenSession(s)}
            onDelete={() => handleDeleteSession(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
