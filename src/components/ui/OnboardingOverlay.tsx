import { useState } from "react";
import { Terminal, LayoutGrid, Rocket } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";

const STEPS = [
  {
    title: "Welcome to Praxis",
    description: "Your AI-powered development workspace",
    icon: null,
    actionLabel: "Get Started",
  },
  {
    title: "Launch AI Agents",
    description: "Spawn Claude Code, OpenCode, Aider and more",
    icon: Terminal,
    actionLabel: "Next",
  },
  {
    title: "Organize with Workspaces",
    description: "Create workspaces for different projects",
    icon: LayoutGrid,
    actionLabel: "Next",
  },
  {
    title: "You're Ready!",
    description: "Start building amazing things",
    icon: Rocket,
    actionLabel: "Start Building",
  },
];

export default function OnboardingOverlay() {
  const [currentStep, setCurrentStep] = useState(0);
  const setOnboardingDone = useSettingsStore((s) => s.setOnboardingDone);

  const finish = () => {
    setOnboardingDone(true);
  };

  const step = STEPS[currentStep];
  const Icon = step.icon;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: "90%",
          background: "var(--vp-bg-primary)",
          borderRadius: 16,
          padding: 40,
          textAlign: "center",
          position: "relative",
          border: "1px solid var(--vp-border-panel)",
        }}
      >
        {/* Skip button */}
        <button
          onClick={finish}
          style={{
            position: "absolute",
            top: 16,
            right: 20,
            background: "none",
            border: "none",
            color: "var(--vp-text-muted)",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Skip
        </button>

        {/* Icon area */}
        <div style={{ marginBottom: 24 }}>
          {Icon ? (
            <Icon size={48} style={{ color: "var(--vp-accent-blue)" }} />
          ) : (
            <div style={{ fontSize: 40, fontWeight: 700, color: "var(--vp-accent-blue)" }}>P</div>
          )}
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--vp-text-primary)", marginBottom: 8 }}>
          {step.title}
        </h2>
        <p style={{ fontSize: 13, color: "var(--vp-text-muted)", marginBottom: 32, lineHeight: 1.5 }}>
          {step.description}
        </p>

        {/* Navigation buttons */}
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          {currentStep > 0 && (
            <button
              onClick={() => setCurrentStep((s) => s - 1)}
              style={{
                padding: "8px 20px",
                fontSize: 13,
                borderRadius: 8,
                border: "1px solid var(--vp-border-medium)",
                background: "var(--vp-bg-surface-hover)",
                color: "var(--vp-text-primary)",
                cursor: "pointer",
              }}
            >
              Previous
            </button>
          )}
          <button
            onClick={() => {
              if (currentStep < STEPS.length - 1) {
                setCurrentStep((s) => s + 1);
              } else {
                finish();
              }
            }}
            style={{
              padding: "8px 24px",
              fontSize: 13,
              borderRadius: 8,
              border: "none",
              background: "var(--vp-accent-blue)",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {step.actionLabel}
          </button>
        </div>

        {/* Step dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 24 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: i === currentStep ? "var(--vp-accent-blue)" : "var(--vp-bg-surface-hover)",
                transition: "background 0.2s ease",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
