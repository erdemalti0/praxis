import { create } from "zustand";

export interface TerminalSession {
  id: string;
  title: string;
  workspaceId: string;
  agentType?: string;
  /** The agent type set at spawn time (before child-process detection) */
  originalAgentType?: string;
  projectPath?: string;
  pid?: number;
  isActive: boolean;
}

export interface OutputActivity {
  lastOutputAt: number;
  recentBytes: number;       // bytes in current window
  lastUserInputAt: number;
  windowStart: number;       // when current measurement window started
}

// ── External output activity tracking (NOT in Zustand) ──
// This avoids triggering React re-renders on every PTY output batch.
// Components read via getOutputActivity() and poll on their own timer.
const _outputActivity = new Map<string, OutputActivity>();
const _lastOutputAt = new Map<string, number>();

/** Read output activity for a session (non-reactive, call from timer/effect) */
export function getOutputActivity(id: string): OutputActivity | undefined {
  return _outputActivity.get(id);
}

/** Read last output timestamp for a session (non-reactive) */
export function getLastOutputAt(id: string): number {
  return _lastOutputAt.get(id) || 0;
}

/** Record PTY output for a session (called from ptyConnection.ts) */
export function markOutput(id: string, byteCount = 0): void {
  const now = Date.now();
  const prev = _outputActivity.get(id);
  const windowStart = prev?.windowStart || now;
  const windowExpired = now - windowStart > 5000;
  _outputActivity.set(id, {
    lastOutputAt: now,
    recentBytes: windowExpired ? byteCount : (prev?.recentBytes || 0) + byteCount,
    lastUserInputAt: prev?.lastUserInputAt || 0,
    windowStart: windowExpired ? now : windowStart,
  });
  _lastOutputAt.set(id, now);
}

/** Record user input for a session (called from ptyConnection.ts) */
export function markUserInput(id: string): void {
  const prev = _outputActivity.get(id);
  if (!prev) return;
  _outputActivity.set(id, { ...prev, lastUserInputAt: Date.now() });
}

/** Clean up tracking data for a removed session */
function clearActivityData(id: string): void {
  _outputActivity.delete(id);
  _lastOutputAt.delete(id);
}

/** Check if a session is actively working based on output activity */
export function isSessionWorking(activity: OutputActivity | undefined): boolean {
  if (!activity) return false;
  const now = Date.now();
  const timeSinceOutput = now - activity.lastOutputAt;

  // No output in last 5s → not working
  if (timeSinceOutput > 5000) return false;

  // If user just typed (within 1s) and output is very small, it's likely echo
  const timeSinceInput = now - activity.lastUserInputAt;
  if (timeSinceInput < 1000 && activity.recentBytes < 30) return false;

  // Any output within last 5s → working
  return true;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  addSession: (session: TerminalSession) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<TerminalSession>) => void;
  getSessionsByWorkspace: (workspaceId: string) => TerminalSession[];
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    })),

  removeSession: (id) =>
    set((state) => {
      const removed = state.sessions.find((s) => s.id === id);
      const sessions = state.sessions.filter((s) => s.id !== id);
      let nextActive = state.activeSessionId;
      if (state.activeSessionId === id) {
        const sameWs = removed
          ? sessions.filter((s) => s.workspaceId === removed.workspaceId)
          : sessions;
        nextActive = sameWs[sameWs.length - 1]?.id ?? sessions[sessions.length - 1]?.id ?? null;
      }
      clearActivityData(id);
      return { sessions, activeSessionId: nextActive };
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  getSessionsByWorkspace: (workspaceId) =>
    get().sessions.filter((s) => s.workspaceId === workspaceId),
}));
