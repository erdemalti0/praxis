import { create } from "zustand";

export interface TerminalSession {
  id: string;
  title: string;
  workspaceId: string;
  agentType?: string;
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

  // Any output within last 5s → working (agents produce varied output sizes including small spinner updates)
  return true;
}

interface TerminalState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  /** Timestamp (ms) of last PTY output per session — kept for backward compat */
  lastOutputAt: Record<string, number>;
  /** Detailed output activity tracking per session */
  outputActivity: Record<string, OutputActivity>;
  addSession: (session: TerminalSession) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  updateSession: (id: string, updates: Partial<TerminalSession>) => void;
  getSessionsByWorkspace: (workspaceId: string) => TerminalSession[];
  markOutput: (id: string, byteCount?: number) => void;
  markUserInput: (id: string) => void;
  resetOutputWindow: (id: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  lastOutputAt: {},
  outputActivity: {},

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
      const { [id]: _, ...restOutput } = state.lastOutputAt;
      const { [id]: _2, ...restActivity } = state.outputActivity;
      return { sessions, activeSessionId: nextActive, lastOutputAt: restOutput, outputActivity: restActivity };
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

  markOutput: (id, byteCount = 0) =>
    set((state) => {
      const now = Date.now();
      const prev = state.outputActivity[id];
      const windowStart = prev?.windowStart || now;
      // Reset window every 5 seconds
      const windowExpired = now - windowStart > 5000;
      const activity: OutputActivity = {
        lastOutputAt: now,
        recentBytes: windowExpired ? byteCount : (prev?.recentBytes || 0) + byteCount,
        lastUserInputAt: prev?.lastUserInputAt || 0,
        windowStart: windowExpired ? now : windowStart,
      };
      return {
        lastOutputAt: { ...state.lastOutputAt, [id]: now },
        outputActivity: { ...state.outputActivity, [id]: activity },
      };
    }),

  markUserInput: (id) =>
    set((state) => {
      const prev = state.outputActivity[id];
      if (!prev) return state;
      return {
        outputActivity: {
          ...state.outputActivity,
          [id]: { ...prev, lastUserInputAt: Date.now() },
        },
      };
    }),

  resetOutputWindow: (id) =>
    set((state) => {
      const prev = state.outputActivity[id];
      if (!prev) return state;
      return {
        outputActivity: {
          ...state.outputActivity,
          [id]: { ...prev, recentBytes: 0, windowStart: Date.now() },
        },
      };
    }),
}));
