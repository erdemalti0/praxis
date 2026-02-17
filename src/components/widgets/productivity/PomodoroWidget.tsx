import { useEffect, useRef, useState } from "react";
import type { PomodoroConfig } from "../../../types/widget";
import { useSettingsStore } from "../../../stores/settingsStore";
import { usePomodoroStore } from "../../../stores/pomodoroStore";
import { Play, Pause, RotateCcw, Settings, Volume2, VolumeX, Clock, Coffee, Zap, Minus, Plus } from "lucide-react";

export default function PomodoroWidget({
  widgetId: _widgetId,
  config: _config = {},
}: {
  widgetId: string;
  config?: PomodoroConfig;
}) {
  const homeDir = useSettingsStore((s) => s.homeDir);

  const phase = usePomodoroStore((s) => s.phase);
  const isRunning = usePomodoroStore((s) => s.isRunning);
  const startedAt = usePomodoroStore((s) => s.startedAt);
  const pausedTimeLeft = usePomodoroStore((s) => s.pausedTimeLeft);
  const completedSessions = usePomodoroStore((s) => s.completedSessions);
  const sessions = usePomodoroStore((s) => s.sessions);
  const settings = usePomodoroStore((s) => s.settings);
  const getTimeLeft = usePomodoroStore((s) => s.getTimeLeft);
  const init = usePomodoroStore((s) => s.init);
  const start = usePomodoroStore((s) => s.start);
  const pause = usePomodoroStore((s) => s.pause);
  const reset = usePomodoroStore((s) => s.reset);
  const skipPhase = usePomodoroStore((s) => s.skipPhase);
  const completePhase = usePomodoroStore((s) => s.completePhase);
  const updateSetting = usePomodoroStore((s) => s.updateSetting);
  const toggleSound = usePomodoroStore((s) => s.toggleSound);

  // Local UI state (not shared across widgets)
  const [showSettings, setShowSettings] = useState(false);

  // Derived display time — re-renders via tick interval
  const [displayTime, setDisplayTime] = useState(() => getTimeLeft());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize store (global, not per-project)
  useEffect(() => {
    if (homeDir) {
      init(homeDir);
    }
  }, [homeDir, init]);

  // Tick every second to update display & detect phase completion
  useEffect(() => {
    const tick = () => {
      const tl = getTimeLeft();
      setDisplayTime(tl);
      if (isRunning && tl <= 0) {
        if (settings.soundEnabled) playNotification();
        completePhase();
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [isRunning, getTimeLeft, completePhase, settings.soundEnabled]);

  // Update display when store state changes (e.g. from broadcast, workspace switch)
  useEffect(() => {
    setDisplayTime(getTimeLeft());
  }, [phase, isRunning, startedAt, pausedTimeLeft, completedSessions]);

  const playNotification = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQsVDHm74NKrUg4TIIKT1Ny1eCAOGH2Ej9PgsmgZDh58hI/R27NlFg0YfIGP0N2yaxcLFXt/hs7R0bFuGAsWeX2GzNHOs2gXChV5fIbM0c6zaBgJFXl8hszRzrJoFwkVeXyGzNHOsGkYCRV5fIbM0c6waRgJFXl8hszRzrBpGAkVeXyGzNHOsGkYCRV5fIbM0c6waRgJFXl8hszRzrBpGAk=");
      }
      audioRef.current.play().catch(() => {});
    } catch {}
  };

  const mins = Math.floor(displayTime / 60);
  const secs = Math.floor(displayTime % 60);
  const phaseDuration =
    phase === "focus"
      ? settings.focusMin * 60
      : phase === "break"
        ? settings.breakMin * 60
        : settings.longBreakMin * 60;
  const pct = ((phaseDuration - displayTime) / phaseDuration) * 100;

  const getPhaseColor = () => {
    switch (phase) {
      case "focus": return "var(--vp-accent-blue)";
      case "break": return "var(--vp-accent-green)";
      case "longBreak": return "#a78bfa";
    }
  };

  const getPhaseLabel = () => {
    switch (phase) {
      case "focus": return "Focus";
      case "break": return "Break";
      case "longBreak": return "Long Break";
    }
  };

  const getPhaseIcon = () => {
    switch (phase) {
      case "focus": return <Zap size={12} style={{ color: getPhaseColor() }} />;
      case "break":
      case "longBreak": return <Coffee size={12} style={{ color: getPhaseColor() }} />;
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ position: "relative" }}>
      {/* Settings button - top right */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          background: showSettings ? "var(--vp-border-light)" : "none",
          border: "none",
          color: showSettings ? "var(--vp-text-primary)" : "var(--vp-text-subtle)",
          cursor: "pointer",
          padding: 4,
          borderRadius: 4,
          zIndex: 10,
        }}
      >
        <Settings size={14} />
      </button>

      {showSettings ? (
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--vp-text-muted)", fontWeight: 500, marginBottom: 4 }}>Timer Settings</div>

          <SettingRow label="Focus" value={settings.focusMin} unit="min" onMinus={() => updateSetting("focusMin", -5)} onPlus={() => updateSetting("focusMin", 5)} />
          <SettingRow label="Break" value={settings.breakMin} unit="min" onMinus={() => updateSetting("breakMin", -1)} onPlus={() => updateSetting("breakMin", 1)} />
          <SettingRow label="Long Break" value={settings.longBreakMin} unit="min" onMinus={() => updateSetting("longBreakMin", -5)} onPlus={() => updateSetting("longBreakMin", 5)} />

          <div className="flex items-center justify-between" style={{ padding: "6px 0" }}>
            <span style={{ fontSize: 11, color: "var(--vp-text-muted)" }}>Sound</span>
            <button
              onClick={toggleSound}
              style={{
                background: settings.soundEnabled ? "var(--vp-accent-blue-bg-hover)" : "var(--vp-bg-surface-hover)",
                border: "none",
                borderRadius: 4,
                padding: "4px 8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {settings.soundEnabled ? <Volume2 size={12} style={{ color: "var(--vp-accent-blue)" }} /> : <VolumeX size={12} style={{ color: "var(--vp-text-faint)" }} />}
              <span style={{ fontSize: 10, color: settings.soundEnabled ? "var(--vp-accent-blue)" : "var(--vp-text-faint)" }}>
                {settings.soundEnabled ? "On" : "Off"}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-3" style={{ gap: 10 }}>
          <div className="flex items-center gap-2">
            {getPhaseIcon()}
            <span style={{ fontSize: 10, color: getPhaseColor(), fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {getPhaseLabel()}
            </span>
          </div>

          <div style={{ position: "relative", width: 90, height: 90 }}>
            <svg width="90" height="90" viewBox="0 0 90 90">
              <circle cx="45" cy="45" r="40" fill="none" stroke="var(--vp-bg-surface-hover)" strokeWidth="5" />
              <circle
                cx="45" cy="45" r="40" fill="none" stroke={getPhaseColor()} strokeWidth="5"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`}
                strokeLinecap="round" transform="rotate(-90 45 45)"
                style={{ transition: "stroke-dashoffset 0.3s linear" }}
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "var(--vp-text-primary)", fontFamily: "monospace" }}>
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => isRunning ? pause() : start()}
              style={{
                padding: "6px 16px", fontSize: 11, borderRadius: 6,
                background: isRunning ? "var(--vp-accent-red-bg)" : "var(--vp-accent-blue-bg-hover)",
                border: `1px solid ${isRunning ? "var(--vp-accent-red-border)" : "var(--vp-accent-blue-border)"}`,
                color: isRunning ? "var(--vp-accent-red-text)" : "var(--vp-accent-blue)",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {isRunning ? <Pause size={12} /> : <Play size={12} />}
              {isRunning ? "Pause" : "Start"}
            </button>
            <button onClick={reset} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-light)", color: "var(--vp-text-muted)", cursor: "pointer" }}>
              <RotateCcw size={12} />
            </button>
            <button onClick={skipPhase} style={{ padding: "6px 12px", fontSize: 11, borderRadius: 6, background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-light)", color: "var(--vp-text-muted)", cursor: "pointer" }} title="Skip to next phase">
              <Clock size={12} />
            </button>
          </div>

          <div className="flex items-center gap-4" style={{ marginTop: 4 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--vp-text-primary)" }}>{completedSessions}</div>
              <div style={{ fontSize: 9, color: "var(--vp-text-faint)" }}>Sessions</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--vp-text-primary)" }}>{Math.floor(completedSessions * settings.focusMin)}</div>
              <div style={{ fontSize: 9, color: "var(--vp-text-faint)" }}>Minutes</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--vp-text-primary)" }}>{sessions.filter((s) => s.type === "break" || s.type === "longBreak").length}</div>
              <div style={{ fontSize: 9, color: "var(--vp-text-faint)" }}>Breaks</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({ label, value, unit, onMinus, onPlus }: { label: string; value: number; unit: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ fontSize: 11, color: "var(--vp-text-muted)" }}>{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={onMinus} style={{ width: 22, height: 22, borderRadius: 4, background: "var(--vp-bg-surface-hover)", border: "none", color: "var(--vp-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Minus size={10} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--vp-text-primary)", minWidth: 40, textAlign: "center" }}>
          {value} {unit}
        </span>
        <button onClick={onPlus} style={{ width: 22, height: 22, borderRadius: 4, background: "var(--vp-bg-surface-hover)", border: "none", color: "var(--vp-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Plus size={10} />
        </button>
      </div>
    </div>
  );
}
