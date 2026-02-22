import { create } from "zustand";
import type { PersistedSession, SessionSummary } from "../types/agentSession";

interface SessionState {
  view: "list" | "chat";
  sessionList: SessionSummary[];
  isLoadingList: boolean;
  activeSession: PersistedSession | null;
  isDirty: boolean;
  createDialogOpen: boolean;

  setView: (view: "list" | "chat") => void;
  setSessionList: (list: SessionSummary[]) => void;
  setLoadingList: (val: boolean) => void;
  setActiveSession: (session: PersistedSession | null) => void;
  markDirty: () => void;
  markClean: () => void;
  setCreateDialogOpen: (val: boolean) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  view: "list",
  sessionList: [],
  isLoadingList: false,
  activeSession: null,
  isDirty: false,
  createDialogOpen: false,

  setView: (view) => set({ view }),
  setSessionList: (list) => set({ sessionList: list }),
  setLoadingList: (val) => set({ isLoadingList: val }),
  setActiveSession: (session) => set({ activeSession: session }),
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
  setCreateDialogOpen: (val) => set({ createDialogOpen: val }),
}));
