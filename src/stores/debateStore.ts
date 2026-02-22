import { create } from "zustand";
import type {
  DebateConfig,
  DebateSession,
  DebateRound,
  DebateSessionStatus,
} from "../types/debate";

interface DebateState {
  /** Currently active debate session (null if none) */
  activeDebate: DebateSession | null;

  /** Whether the debate setup panel is open */
  setupOpen: boolean;

  // Actions
  openSetup: () => void;
  closeSetup: () => void;

  /** Start a new debate with the given config */
  startDebate: (config: DebateConfig) => void;

  /** Update status of a specific round */
  updateRound: (roundNumber: number, update: Partial<DebateRound>) => void;

  /** Advance to next round */
  advanceRound: () => void;

  /** Set the active viewing tab */
  setActiveTab: (tab: "a" | "b" | "unified" | "synthesis") => void;

  /** Set synthesis result */
  setSynthesis: (agentId: string, messageId: string) => void;

  /** Update debate session status */
  setStatus: (status: DebateSessionStatus, error?: string) => void;

  /** Cancel / end the active debate */
  cancelDebate: () => void;

  /** Clear completed debate */
  clearDebate: () => void;
}

export const useDebateStore = create<DebateState>((set) => ({
  activeDebate: null,
  setupOpen: false,

  openSetup: () => set({ setupOpen: true }),
  closeSetup: () => set({ setupOpen: false }),

  startDebate: (config) => {
    const roundCount = config.mode === "side-by-side" ? 1 : config.rounds;
    const rounds: DebateRound[] = Array.from({ length: roundCount }, (_, i) => ({
      roundNumber: i + 1,
      agentAMessageId: null,
      agentBMessageId: null,
      status: i === 0 ? "pending" : "pending",
    }));

    set({
      activeDebate: {
        id: crypto.randomUUID(),
        config,
        rounds,
        status: "running",
        activeTab: "unified",
        currentRound: 1,
      },
      setupOpen: false,
    });
  },

  updateRound: (roundNumber, update) =>
    set((s) => {
      if (!s.activeDebate) return s;
      const rounds = s.activeDebate.rounds.map((r) =>
        r.roundNumber === roundNumber ? { ...r, ...update } : r,
      );
      return { activeDebate: { ...s.activeDebate, rounds } };
    }),

  advanceRound: () =>
    set((s) => {
      if (!s.activeDebate) return s;
      const nextRound = s.activeDebate.currentRound + 1;
      if (nextRound > s.activeDebate.rounds.length) {
        return { activeDebate: { ...s.activeDebate, status: "complete" } };
      }
      return { activeDebate: { ...s.activeDebate, currentRound: nextRound } };
    }),

  setActiveTab: (tab) =>
    set((s) => {
      if (!s.activeDebate) return s;
      return { activeDebate: { ...s.activeDebate, activeTab: tab } };
    }),

  setStatus: (status, error) =>
    set((s) => {
      if (!s.activeDebate) return s;
      return { activeDebate: { ...s.activeDebate, status, error } };
    }),

  setSynthesis: (agentId, messageId) =>
    set((s) => {
      if (!s.activeDebate) return s;
      return {
        activeDebate: {
          ...s.activeDebate,
          synthesisAgentId: agentId as import("../types/agentPanel").ChatAgentId,
          synthesisMessageId: messageId,
        },
      };
    }),

  cancelDebate: () =>
    set((s) => {
      if (!s.activeDebate) return s;
      return { activeDebate: { ...s.activeDebate, status: "cancelled" } };
    }),

  clearDebate: () => set({ activeDebate: null }),
}));
