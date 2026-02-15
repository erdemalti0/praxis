import { create } from "zustand";
import { loadJsonFile, createDebouncedSaver } from "../lib/persistence";

type TimerPhase = "focus" | "break" | "longBreak";

interface SessionRecord {
  type: TimerPhase;
  duration: number;
  completedAt: number;
}

interface PomodoroSettings {
  focusMin: number;
  breakMin: number;
  longBreakMin: number;
  soundEnabled: boolean;
}

interface PomodoroState {
  // Timer state — timestamp-based so all windows can derive timeLeft
  phase: TimerPhase;
  isRunning: boolean;
  /** Epoch ms when the timer was last started/resumed */
  startedAt: number;
  /** Seconds remaining when the timer was paused (or initial duration) */
  pausedTimeLeft: number;
  completedSessions: number;
  sessions: SessionRecord[];
  settings: PomodoroSettings;
  sessionsUntilLongBreak: number;

  // Persistence
  _dataDir: string | null;
  _loaded: boolean;

  // Actions
  init: (homeDir: string) => void;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skipPhase: () => void;
  completePhase: () => void;
  updateSetting: (key: keyof PomodoroSettings, delta: number) => void;
  toggleSound: () => void;
  getTimeLeft: () => number;
  _persist: () => void;
  _broadcast: () => void;
  _applyRemote: (data: BroadcastPayload) => void;
}

interface BroadcastPayload {
  phase: TimerPhase;
  isRunning: boolean;
  startedAt: number;
  pausedTimeLeft: number;
  completedSessions: number;
  sessions: SessionRecord[];
  settings: PomodoroSettings;
}

const saver = createDebouncedSaver(500);

let channel: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel("praxis-pomodoro");
  }
  return channel;
}

export const usePomodoroStore = create<PomodoroState>((set, get) => {
  // Listen for cross-window broadcasts
  try {
    getChannel().onmessage = (e) => {
      const state = get();
      if (e.data?.type === "pomodoro-sync") {
        state._applyRemote(e.data.payload);
      }
    };
  } catch {}

  return {
    phase: "focus",
    isRunning: false,
    startedAt: 0,
    pausedTimeLeft: 25 * 60,
    completedSessions: 0,
    sessions: [],
    settings: {
      focusMin: 25,
      breakMin: 5,
      longBreakMin: 15,
      soundEnabled: true,
    },
    sessionsUntilLongBreak: 4,
    _dataDir: null,
    _loaded: false,

    init: (homeDir) => {
      const dataDir = `${homeDir}/.praxis`;
      if (get()._loaded) return;

      try {
        const filePath = `${dataDir}/pomodoro.json`;
        const data = loadJsonFile(filePath, {
          settings: null as PomodoroSettings | null,
          sessions: [] as SessionRecord[],
          completedSessions: 0,
          phase: "focus" as TimerPhase,
          isRunning: false,
          startedAt: 0,
          pausedTimeLeft: 25 * 60,
        });

        const today = new Date().toDateString();
        const todaySessions = (data.sessions || []).filter(
          (s: SessionRecord) => new Date(s.completedAt).toDateString() === today
        );

        const settings = data.settings || get().settings;

        set({
          _dataDir: dataDir,
          _loaded: true,
          settings,
          sessions: todaySessions,
          completedSessions: data.completedSessions || 0,
          phase: (data.phase as TimerPhase) || "focus",
          isRunning: data.isRunning || false,
          startedAt: data.startedAt || 0,
          pausedTimeLeft: data.pausedTimeLeft || settings.focusMin * 60,
        });

        // If it was running when saved, check if it's still valid
        if (data.isRunning && data.startedAt) {
          const elapsed = (Date.now() - data.startedAt) / 1000;
          const remaining = (data.pausedTimeLeft || settings.focusMin * 60) - elapsed;
          if (remaining <= 0) {
            // Timer expired while app was closed
            set({ isRunning: false, pausedTimeLeft: 0 });
          }
        }
      } catch {}
    },

    start: () => {
      const s = get();
      set({
        isRunning: true,
        startedAt: Date.now(),
        pausedTimeLeft: s.pausedTimeLeft,
      });
      get()._broadcast();
      get()._persist();
    },

    pause: () => {
      const timeLeft = get().getTimeLeft();
      set({
        isRunning: false,
        pausedTimeLeft: Math.max(0, timeLeft),
        startedAt: 0,
      });
      get()._broadcast();
      get()._persist();
    },

    reset: () => {
      const s = get();
      set({
        isRunning: false,
        phase: "focus",
        pausedTimeLeft: s.settings.focusMin * 60,
        startedAt: 0,
      });
      get()._broadcast();
      get()._persist();
    },

    skipPhase: () => {
      const s = get();
      if (s.phase === "focus") {
        if ((s.completedSessions + 1) % s.sessionsUntilLongBreak === 0) {
          set({
            isRunning: false,
            phase: "longBreak",
            pausedTimeLeft: s.settings.longBreakMin * 60,
            startedAt: 0,
          });
        } else {
          set({
            isRunning: false,
            phase: "break",
            pausedTimeLeft: s.settings.breakMin * 60,
            startedAt: 0,
          });
        }
      } else {
        set({
          isRunning: false,
          phase: "focus",
          pausedTimeLeft: s.settings.focusMin * 60,
          startedAt: 0,
        });
      }
      get()._broadcast();
      get()._persist();
    },

    completePhase: () => {
      const s = get();
      // Guard: prevent double-completion from multiple widget instances
      if (!s.isRunning) return;
      const phaseDuration =
        s.phase === "focus"
          ? s.settings.focusMin * 60
          : s.phase === "break"
            ? s.settings.breakMin * 60
            : s.settings.longBreakMin * 60;

      const newSession: SessionRecord = {
        type: s.phase,
        duration: phaseDuration,
        completedAt: Date.now(),
      };
      const newSessions = [...s.sessions, newSession];

      if (s.phase === "focus") {
        const newCount = s.completedSessions + 1;
        if (newCount % s.sessionsUntilLongBreak === 0) {
          set({
            isRunning: false,
            phase: "longBreak",
            pausedTimeLeft: s.settings.longBreakMin * 60,
            startedAt: 0,
            completedSessions: newCount,
            sessions: newSessions,
          });
        } else {
          set({
            isRunning: false,
            phase: "break",
            pausedTimeLeft: s.settings.breakMin * 60,
            startedAt: 0,
            completedSessions: newCount,
            sessions: newSessions,
          });
        }
      } else {
        set({
          isRunning: false,
          phase: "focus",
          pausedTimeLeft: s.settings.focusMin * 60,
          startedAt: 0,
          sessions: newSessions,
        });
      }
      get()._broadcast();
      get()._persist();
    },

    updateSetting: (key, delta) => {
      set((s) => {
        const val = (s.settings[key] as number) + delta;
        let newSettings: PomodoroSettings;
        if (key === "focusMin") newSettings = { ...s.settings, focusMin: Math.max(5, Math.min(60, val)) };
        else if (key === "breakMin") newSettings = { ...s.settings, breakMin: Math.max(1, Math.min(30, val)) };
        else if (key === "longBreakMin") newSettings = { ...s.settings, longBreakMin: Math.max(5, Math.min(60, val)) };
        else return {};

        // Update pausedTimeLeft if not running
        let pausedTimeLeft = s.pausedTimeLeft;
        if (!s.isRunning) {
          if (s.phase === "focus") pausedTimeLeft = newSettings.focusMin * 60;
          else if (s.phase === "break") pausedTimeLeft = newSettings.breakMin * 60;
          else pausedTimeLeft = newSettings.longBreakMin * 60;
        }

        return { settings: newSettings, pausedTimeLeft };
      });
      get()._broadcast();
      get()._persist();
    },

    toggleSound: () => {
      set((s) => ({
        settings: { ...s.settings, soundEnabled: !s.settings.soundEnabled },
      }));
      get()._broadcast();
      get()._persist();
    },

    getTimeLeft: () => {
      const s = get();
      if (!s.isRunning) return s.pausedTimeLeft;
      const elapsed = (Date.now() - s.startedAt) / 1000;
      return Math.max(0, s.pausedTimeLeft - elapsed);
    },

    _persist: () => {
      const s = get();
      if (!s._dataDir) return;
      const filePath = `${s._dataDir}/pomodoro.json`;
      saver(filePath, {
        settings: s.settings,
        sessions: s.sessions,
        completedSessions: s.completedSessions,
        phase: s.phase,
        isRunning: s.isRunning,
        startedAt: s.startedAt,
        pausedTimeLeft: s.pausedTimeLeft,
      });
    },

    _broadcast: () => {
      const s = get();
      try {
        getChannel().postMessage({
          type: "pomodoro-sync",
          payload: {
            phase: s.phase,
            isRunning: s.isRunning,
            startedAt: s.startedAt,
            pausedTimeLeft: s.pausedTimeLeft,
            completedSessions: s.completedSessions,
            sessions: s.sessions,
            settings: s.settings,
          } satisfies BroadcastPayload,
        });
      } catch {}
    },

    _applyRemote: (data) => {
      set({
        phase: data.phase,
        isRunning: data.isRunning,
        startedAt: data.startedAt,
        pausedTimeLeft: data.pausedTimeLeft,
        completedSessions: data.completedSessions,
        sessions: data.sessions,
        settings: data.settings,
      });
    },
  };
});
