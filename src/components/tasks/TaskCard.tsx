import { useState, useCallback, useRef, useEffect } from "react";
import { useTaskStore } from "../../stores/taskStore";
import { useTerminalStore, isSessionWorking, getOutputActivity } from "../../stores/terminalStore";
import { useUIStore } from "../../stores/uiStore";
import { send } from "../../lib/ipc";
import { getSessionIds } from "../../lib/layout/layoutUtils";
import { getAgentConfig } from "../../lib/agentTypes";
import type { PraxisTask, TaskStatus } from "../../types/session";
import {
  Trash2,
  Play,
  Terminal,
  Pencil,
  Check,
  X,
  GripVertical,
} from "lucide-react";

/* ─── Deterministic tag colors ─── */
const TAG_PALETTE = [
  { bg: "var(--vp-tag-blue-bg)", border: "var(--vp-tag-blue-border)", text: "var(--vp-tag-blue-text)" },
  { bg: "var(--vp-tag-purple-bg)", border: "var(--vp-tag-purple-border)", text: "var(--vp-tag-purple-text)" },
  { bg: "var(--vp-tag-pink-bg)", border: "var(--vp-tag-pink-border)", text: "var(--vp-tag-pink-text)" },
  { bg: "var(--vp-tag-amber-bg)", border: "var(--vp-tag-amber-border)", text: "var(--vp-tag-amber-text)" },
  { bg: "var(--vp-tag-emerald-bg)", border: "var(--vp-tag-emerald-border)", text: "var(--vp-tag-emerald-text)" },
  { bg: "var(--vp-tag-cyan-bg)", border: "var(--vp-tag-cyan-border)", text: "var(--vp-tag-cyan-text)" },
  { bg: "var(--vp-tag-rose-bg)", border: "var(--vp-tag-rose-border)", text: "var(--vp-tag-rose-text)" },
  { bg: "var(--vp-tag-indigo-bg)", border: "var(--vp-tag-indigo-border)", text: "var(--vp-tag-indigo-text)" },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getTagColor(tag: string) {
  return TAG_PALETTE[hashString(tag.toLowerCase()) % TAG_PALETTE.length];
}

const statusColors: Record<TaskStatus, string> = {
  todo: "var(--vp-text-muted)",
  in_progress: "var(--vp-accent-blue)",
  done: "var(--vp-accent-green)",
};

interface Props {
  task: PraxisTask;
  projectPath: string;
}

export default function TaskCard({ task, projectPath }: Props) {
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const moveTask = useTaskStore((s) => s.moveTask);
  const [editing, setEditing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Edit state
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description);
  const [editPrompt, setEditPrompt] = useState(task.prompt || "");
  const [editTags, setEditTags] = useState(task.tags.join(", "));

  // Sync edit state when task changes externally
  useEffect(() => {
    if (!editing) {
      setEditTitle(task.title);
      setEditDesc(task.description);
      setEditPrompt(task.prompt || "");
      setEditTags(task.tags.join(", "));
    }
  }, [task, editing]);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handle = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [showPicker]);

  const handleSave = () => {
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    updateTask(projectPath, task.id, {
      title: editTitle.trim() || task.title,
      description: editDesc.trim(),
      prompt: editPrompt.trim() || undefined,
      tags,
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(task.title);
    setEditDesc(task.description);
    setEditPrompt(task.prompt || "");
    setEditTags(task.tags.join(", "));
    setEditing(false);
  };

  const sendToAgent = useCallback(
    (sessionId: string, workspaceId: string) => {
      const prompt = task.prompt || "";
      send("write_pty", { id: sessionId, data: prompt + "\n" });
      const ui = useUIStore.getState();
      const ts = useTerminalStore.getState();
      if (ui.activeWorkspaceId !== workspaceId) ui.setActiveWorkspaceId(workspaceId);
      const vm = ui.viewMode;
      if (vm !== "terminal" && vm !== "split") ui.setViewMode("terminal");
      const groups = ui.terminalGroups[workspaceId] || [];
      for (const gid of groups) {
        const layout = ui.workspaceLayouts[gid];
        if (layout && getSessionIds(layout).includes(sessionId)) {
          ui.setActiveTerminalGroup(workspaceId, gid);
          break;
        }
      }
      ui.setFocusedPane(sessionId);
      ts.setActiveSession(sessionId);
      if (task.status === "todo") moveTask(projectPath, task.id, "in_progress");
      setSentTo(sessionId);
      setShowPicker(false);
      setTimeout(() => setSentTo(null), 2000);
    },
    [task, projectPath, moveTask]
  );

  const isDone = task.status === "done";

  /* ─── Edit Mode ─── */
  if (editing) {
    return (
      <div
        style={{
          background: "var(--vp-bg-surface)",
          border: "1px solid var(--vp-accent-blue-border)",
          borderRadius: "var(--vp-radius-xl)",
          padding: 12,
        }}
      >
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          placeholder="Task title"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSave(); if (e.key === "Escape") handleCancel(); }}
          style={{
            width: "100%",
            background: "var(--vp-bg-surface)",
            border: "1px solid var(--vp-border-light)",
            borderRadius: "var(--vp-radius-md)",
            padding: "6px 10px",
            color: "var(--vp-text-primary)",
            fontSize: 12,
            fontWeight: 500,
            outline: "none",
            fontFamily: "inherit",
            marginBottom: 8,
          }}
        />
        <textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          style={{
            width: "100%",
            background: "var(--vp-bg-surface)",
            border: "1px solid var(--vp-border-light)",
            borderRadius: "var(--vp-radius-md)",
            padding: "6px 10px",
            color: "var(--vp-text-secondary)",
            fontSize: 11,
            outline: "none",
            fontFamily: "inherit",
            resize: "vertical",
            marginBottom: 8,
          }}
        />
        <textarea
          value={editPrompt}
          onChange={(e) => setEditPrompt(e.target.value)}
          placeholder="AI prompt (optional)"
          rows={3}
          style={{
            width: "100%",
            background: "var(--vp-bg-surface)",
            border: "1px solid var(--vp-border-subtle)",
            borderRadius: "var(--vp-radius-md)",
            padding: "6px 10px",
            color: "var(--vp-text-secondary)",
            fontSize: 11,
            outline: "none",
            fontFamily: "monospace",
            resize: "vertical",
            marginBottom: 8,
          }}
        />
        <input
          value={editTags}
          onChange={(e) => setEditTags(e.target.value)}
          placeholder="Tags (comma separated)"
          style={{
            width: "100%",
            background: "var(--vp-bg-surface)",
            border: "1px solid var(--vp-border-light)",
            borderRadius: "var(--vp-radius-md)",
            padding: "6px 10px",
            color: "var(--vp-text-secondary)",
            fontSize: 11,
            outline: "none",
            fontFamily: "inherit",
            marginBottom: 10,
          }}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleCancel}
            className="flex items-center gap-1 px-3 py-1"
            style={{
              background: "transparent",
              border: "1px solid var(--vp-border-light)",
              borderRadius: "var(--vp-radius-md)",
              color: "var(--vp-text-muted)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            <X size={11} /> Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1 px-3 py-1"
            style={{
              background: "var(--vp-accent-blue-bg-hover)",
              border: "1px solid var(--vp-accent-blue-border)",
              borderRadius: "var(--vp-radius-md)",
              color: "var(--vp-accent-blue)",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <Check size={11} /> Save
          </button>
        </div>
      </div>
    );
  }

  /* ─── View Mode ─── */
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
        e.currentTarget.style.opacity = "0.4";
      }}
      onDragEnd={(e) => {
        e.currentTarget.style.opacity = "1";
      }}
      style={{
        background: "var(--vp-bg-surface)",
        border: "1px solid var(--vp-border-subtle)",
        borderRadius: "var(--vp-radius-xl)",
        padding: "10px 12px",
        transition: "all 0.2s",
        cursor: "grab",
        borderLeft: `3px solid ${statusColors[task.status]}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
        e.currentTarget.style.borderColor = "var(--vp-border-medium)";
        e.currentTarget.style.borderLeftColor = statusColors[task.status];
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--vp-bg-surface)";
        e.currentTarget.style.borderColor = "var(--vp-border-subtle)";
        e.currentTarget.style.borderLeftColor = statusColors[task.status];
      }}
    >
      {/* Title + Actions */}
      <div className="flex items-start gap-2">
        <GripVertical size={12} style={{ color: "var(--vp-text-subtle)", marginTop: 2, flexShrink: 0, cursor: "grab" }} />
        <div className="flex-1 min-w-0">
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: isDone ? "var(--vp-text-faint)" : "var(--vp-text-primary)",
              textDecoration: isDone ? "line-through" : "none",
              lineHeight: 1.4,
            }}
          >
            {task.title}
          </div>

          {/* Description preview */}
          {task.description && (
            <div
              style={{
                fontSize: 11,
                color: "var(--vp-text-dim)",
                lineHeight: 1.4,
                marginTop: 4,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {task.description}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          {/* Run button */}
          {!isDone && (
            <div style={{ position: "relative" }} ref={pickerRef}>
              <button
                onClick={(e) => { e.stopPropagation(); if (task.prompt) setShowPicker(!showPicker); }}
                title={task.prompt ? "Run prompt on agent" : "No prompt — add one via edit"}
                disabled={!task.prompt}
                className="flex items-center justify-center"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "var(--vp-radius-sm)",
                  background: sentTo
                    ? "rgba(74,222,128,0.15)"
                    : task.prompt
                    ? "var(--vp-accent-blue-bg)"
                    : "var(--vp-bg-surface)",
                  border: "1px solid",
                  borderColor: sentTo
                    ? "rgba(74,222,128,0.3)"
                    : task.prompt
                    ? "var(--vp-accent-blue-bg-hover)"
                    : "var(--vp-bg-surface-hover)",
                  color: sentTo ? "var(--vp-accent-green)" : task.prompt ? "var(--vp-accent-blue)" : "var(--vp-text-subtle)",
                  cursor: task.prompt ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                  opacity: task.prompt ? 1 : 0.5,
                }}
                onMouseEnter={(e) => {
                  if (!sentTo && task.prompt) { e.currentTarget.style.background = "var(--vp-accent-blue-bg-hover)"; }
                }}
                onMouseLeave={(e) => {
                  if (!sentTo && task.prompt) { e.currentTarget.style.background = "var(--vp-accent-blue-bg)"; }
                }}
              >
                <Play size={10} />
              </button>
              {showPicker && <AgentPicker onSelect={sendToAgent} />}
            </div>
          )}

          {/* Edit button */}
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            title="Edit task"
            className="flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              borderRadius: "var(--vp-radius-sm)",
              background: "transparent",
              border: "1px solid transparent",
              color: "var(--vp-text-subtle)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-text-secondary)";
              e.currentTarget.style.background = "var(--vp-bg-surface-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-subtle)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Pencil size={10} />
          </button>

          {/* Delete button */}
          <button
            onClick={(e) => { e.stopPropagation(); deleteTask(projectPath, task.id); }}
            title="Delete task"
            className="flex items-center justify-center"
            style={{
              width: 22,
              height: 22,
              borderRadius: "var(--vp-radius-sm)",
              background: "transparent",
              border: "1px solid transparent",
              color: "var(--vp-text-subtle)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-accent-red)";
              e.currentTarget.style.background = "var(--vp-accent-red-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-subtle)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2" style={{ paddingLeft: 20 }}>
          {task.tags.map((tag) => {
            const c = getTagColor(tag);
            return (
              <span
                key={tag}
                style={{
                  fontSize: 9,
                  color: c.text,
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  borderRadius: "var(--vp-radius-sm)",
                  padding: "1px 6px",
                  letterSpacing: "0.02em",
                  fontWeight: 500,
                }}
              >
                {tag}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Agent Picker Popup ─── */

function AgentPicker({
  onSelect,
}: {
  onSelect: (sessionId: string, workspaceId: string) => void;
}) {
  const sessions = useTerminalStore((s) => s.sessions);
  const workspaces = useUIStore((s) => s.workspaces);
  const terminalGroups = useUIStore((s) => s.terminalGroups);
  const workspaceLayouts = useUIStore((s) => s.workspaceLayouts);
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sessionGroupLabel: Record<string, string> = {};
  for (const ws of workspaces) {
    const groupIds = terminalGroups[ws.id] || [];
    for (let i = 0; i < groupIds.length; i++) {
      const layout = workspaceLayouts[groupIds[i]];
      if (!layout) continue;
      for (const sid of getSessionIds(layout)) {
        sessionGroupLabel[sid] = `Terminal ${i + 1}`;
      }
    }
  }

  const grouped = workspaces
    .map((ws) => ({
      workspace: ws,
      sessions: sessions.filter(
        (s) => s.workspaceId === ws.id && s.agentType && s.agentType !== "shell" && s.agentType !== "unknown"
      ),
    }))
    .filter((g) => g.sessions.length > 0);

  if (grouped.length === 0) {
    return (
      <div
        style={{
          position: "absolute", top: "100%", right: 0, marginTop: 4,
          width: 240, background: "var(--vp-bg-tertiary)", border: "1px solid var(--vp-border-medium)",
          borderRadius: "var(--vp-radius-xl)", padding: "10px 0", zIndex: 100,
          boxShadow: "0 8px 32px var(--vp-bg-overlay)",
        }}
      >
        <div style={{ padding: "8px 14px", color: "var(--vp-text-dim)", fontSize: 11, textAlign: "center" }}>
          No agents available
        </div>
      </div>
    );
  }

  const allAgentSessions = grouped.flatMap((g) => g.sessions);
  const typeCounts: Record<string, number> = {};
  const typeIndex: Record<string, number> = {};
  for (const s of allAgentSessions) {
    typeCounts[s.agentType || "unknown"] = (typeCounts[s.agentType || "unknown"] || 0) + 1;
  }

  return (
    <div
      style={{
        position: "absolute", top: "100%", right: 0, marginTop: 4,
        width: 260, background: "var(--vp-bg-tertiary)", border: "1px solid var(--vp-border-medium)",
        borderRadius: "var(--vp-radius-xl)", padding: "6px 0", zIndex: 100,
        boxShadow: "0 8px 32px var(--vp-bg-overlay)",
        animation: "pickerFadeIn 0.15s ease",
      }}
    >
      <div style={{ padding: "4px 12px 8px", fontSize: 10, color: "var(--vp-text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Select Agent
      </div>
      {grouped.map((group) => (
        <div key={group.workspace.id}>
          <div style={{ padding: "4px 12px", fontSize: 10, fontWeight: 500, color: "var(--vp-text-faint)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: group.workspace.color, flexShrink: 0 }} />
            {group.workspace.name}
          </div>
          {group.sessions.map((session) => {
            const config = getAgentConfig(session.agentType);
            const isWorking = isSessionWorking(getOutputActivity(session.id));
            const groupLabel = sessionGroupLabel[session.id] || "";
            const t = session.agentType || "unknown";
            if (!typeIndex[t]) typeIndex[t] = 0;
            typeIndex[t]++;
            const idx = (typeCounts[t] || 0) > 1 ? typeIndex[t] : undefined;
            return (
              <button
                key={session.id}
                onClick={(e) => { e.stopPropagation(); onSelect(session.id, session.workspaceId); }}
                disabled={isWorking}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 12px", background: "transparent", border: "none",
                  cursor: isWorking ? "not-allowed" : "pointer", opacity: isWorking ? 0.4 : 1,
                  transition: "background 0.15s", textAlign: "left",
                }}
                title={isWorking ? "Agent is working" : `Send to ${config.label}`}
                onMouseEnter={(e) => { if (!isWorking) e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: isWorking ? "var(--vp-accent-green)" : "var(--vp-text-faint)", flexShrink: 0,
                  boxShadow: isWorking ? "0 0 6px rgba(74,222,128,0.5)" : "none",
                  animation: isWorking ? "agentPulse 1.5s ease-in-out infinite" : "none",
                }} />
                <div style={{
                  width: 22, height: 22, borderRadius: "var(--vp-radius-sm)",
                  background: "var(--vp-bg-surface-hover)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {config.logo ? (
                    <img src={config.logo} alt={config.label} style={{ width: 14, height: 14, objectFit: "contain" }} draggable={false} />
                  ) : (
                    <Terminal size={12} style={{ color: config.color }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: isWorking ? "var(--vp-text-dim)" : "var(--vp-text-secondary)", lineHeight: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {config.label}
                    {idx !== undefined && <span style={{ color: "var(--vp-text-faint)", fontWeight: 400, marginLeft: 3 }}>#{idx}</span>}
                  </div>
                  <div style={{ fontSize: 9, color: "var(--vp-text-faint)", lineHeight: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {groupLabel}{groupLabel && " · "}{(session.projectPath || "~").split("/").filter(Boolean).pop() || "~"}
                  </div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 500, color: isWorking ? "var(--vp-accent-green)" : "var(--vp-text-faint)", flexShrink: 0 }}>
                  {isWorking ? "working" : "idle"}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      <style>{`
        @keyframes pickerFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes agentPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
