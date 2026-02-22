import { useState } from "react";
import { Terminal, LayoutGrid, Rocket, TerminalSquare } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { invoke } from "../../lib/ipc";

const APP_NAME = "Praxis";

interface StepDef {
  title: string;
  description: string;
  icon: typeof Terminal | null;
  actionLabel: string;
  isCliStep?: boolean;
}

const STEPS: StepDef[] = [
  {
    title: `Welcome to ${APP_NAME}`,
    description: "Your AI-powered development workspace",
    icon: null,
    actionLabel: "Get Started",
  },
  {
    title: "Launch AI Agents",
    description: "Spawn Claude Code, OpenCode, Codex and more",
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
    title: "Open from Terminal",
    description: `Type ${APP_NAME.toLowerCase()} . in any terminal to open that folder in ${APP_NAME} — just like code . for VS Code.`,
    icon: TerminalSquare,
    actionLabel: "Next",
    isCliStep: true,
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
  const [cliInstalling, setCliInstalling] = useState(false);
  const [cliResult, setCliResult] = useState<"idle" | "success" | "error">("idle");
  const setOnboardingDone = useSettingsStore((s) => s.setOnboardingDone);
  const setCliEnabled = useSettingsStore((s) => s.setCliEnabled);

  const finish = () => {
    setOnboardingDone(true);
  };

  const handleInstallCli = async () => {
    setCliInstalling(true);
    try {
      const result = await invoke<{ success: boolean; error?: string }>("install_cli");
      if (result.success) {
        setCliEnabled(true);
        setCliResult("success");
      } else {
        setCliResult("error");
      }
    } catch {
      setCliResult("error");
    } finally {
      setCliInstalling(false);
    }
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
          borderRadius: "var(--vp-radius-4xl)",
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

        {/* CLI step: Enable / Skip buttons */}
        {step.isCliStep ? (
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep((s) => s - 1)}
                style={{
                  padding: "8px 20px",
                  fontSize: 13,
                  borderRadius: "var(--vp-radius-lg)",
                  border: "1px solid var(--vp-border-medium)",
                  background: "var(--vp-bg-surface-hover)",
                  color: "var(--vp-text-primary)",
                  cursor: "pointer",
                }}
              >
                Previous
              </button>
            )}
            {cliResult === "success" ? (
              <button
                onClick={() => setCurrentStep((s) => s + 1)}
                style={{
                  padding: "8px 24px",
                  fontSize: 13,
                  borderRadius: "var(--vp-radius-lg)",
                  border: "none",
                  background: "var(--vp-accent-green)",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Installed! Continue
              </button>
            ) : (
              <>
                <button
                  onClick={handleInstallCli}
                  disabled={cliInstalling}
                  style={{
                    padding: "8px 24px",
                    fontSize: 13,
                    borderRadius: "var(--vp-radius-lg)",
                    border: "none",
                    background: "var(--vp-accent-blue)",
                    color: "#fff",
                    cursor: cliInstalling ? "wait" : "pointer",
                    fontWeight: 500,
                    opacity: cliInstalling ? 0.7 : 1,
                  }}
                >
                  {cliInstalling ? "Installing..." : "Enable"}
                </button>
                <button
                  onClick={() => setCurrentStep((s) => s + 1)}
                  style={{
                    padding: "8px 20px",
                    fontSize: 13,
                    borderRadius: "var(--vp-radius-lg)",
                    border: "1px solid var(--vp-border-medium)",
                    background: "var(--vp-bg-surface-hover)",
                    color: "var(--vp-text-primary)",
                    cursor: "pointer",
                  }}
                >
                  Skip
                </button>
              </>
            )}
          </div>
        ) : (
          /* Standard navigation buttons */
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep((s) => s - 1)}
                style={{
                  padding: "8px 20px",
                  fontSize: 13,
                  borderRadius: "var(--vp-radius-lg)",
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
                borderRadius: "var(--vp-radius-lg)",
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
        )}

        {/* Error message */}
        {cliResult === "error" && step.isCliStep && (
          <p style={{ fontSize: 11, color: "var(--vp-accent-red)", marginTop: 12 }}>
            Failed to install. You may need to run {APP_NAME} with elevated permissions, or install manually from Settings.
          </p>
        )}

        {/* Step dots */}
        <div role="tablist" aria-label="Onboarding progress" style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 24 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              role="tab"
              aria-selected={i === currentStep}
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
        {/* Visually-hidden step counter for screen readers */}
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}>
          Step {currentStep + 1} of {STEPS.length}
        </span>
      </div>
    </div>
  );
}
