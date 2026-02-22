import claudeLogo from "../assets/logos/claude.png";
import opencodeLogo from "../assets/logos/opencode.svg";
import codexLogo from "../assets/logos/codex.svg";
import geminiLogo from "../assets/logos/gemini.svg";
import ampLogo from "../assets/logos/amp.svg";
import shellLogo from "../assets/logos/terminal_svg.svg";

export interface AgentTypeConfig {
  label: string;
  logo: string;
  color: string;
}

export const agentTypeConfig: Record<string, AgentTypeConfig> = {
  "claude-code": { label: "Claude Code", logo: claudeLogo, color: "#f97316" },
  opencode: { label: "OpenCode", logo: opencodeLogo, color: "#60a5fa" },
  codex: { label: "Codex", logo: codexLogo, color: "#10a37f" },
  gemini: { label: "Gemini", logo: geminiLogo, color: "#38bdf8" },
  amp: { label: "AMP", logo: ampLogo, color: "#f472b6" },
  shell: { label: "Shell", logo: shellLogo, color: "#888888" },
  unknown: { label: "Shell", logo: shellLogo, color: "#888888" },
};

// Registry for user agents — settingsStore registers itself at init time to avoid circular deps
type UserAgentGetter = () => Array<{ type: string; label: string; color: string }>;
let _getUserAgents: UserAgentGetter | null = null;

export function registerUserAgentGetter(getter: UserAgentGetter) {
  _getUserAgents = getter;
}

export function getAgentConfig(agentType: string | undefined): AgentTypeConfig {
  // Check user agents first
  if (_getUserAgents) {
    try {
      const userAgent = _getUserAgents().find((a) => a.type === agentType);
      if (userAgent) {
        return { label: userAgent.label, logo: "", color: userAgent.color };
      }
    } catch {}
  }
  return agentTypeConfig[agentType || "unknown"] || agentTypeConfig.unknown;
}
