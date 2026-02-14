import { invoke } from "../ipc";
import { getAgentConfig } from "../agentTypes";
import type { Agent } from "../../types/agent";

interface RawProcess {
  pid: number;
  name: string;
  cmd: string[];
  cwd: string;
  cpu_usage: number;
}

// Registry for custom agent commands — populated by settingsStore
let _customAgentCmds: Array<{ cmd: string; type: string }> = [];
export function registerCustomAgentCmds(cmds: Array<{ cmd: string; type: string }>) {
  _customAgentCmds = cmds;
}

function detectAgentType(name: string, cmd: string[]): string {
  const cmdStr = cmd.join(" ").toLowerCase();
  if (cmdStr.includes("claude") || name.includes("claude")) return "claude-code";
  if (cmdStr.includes("opencode") || name.includes("opencode")) return "opencode";
  if (cmdStr.includes("aider") || name.includes("aider")) return "aider";
  if (cmdStr.includes("gemini") || name.includes("gemini")) return "gemini";
  if (cmdStr.includes("amp") || name.includes("amp")) return "amp";

  // Check custom agents
  for (const agent of _customAgentCmds) {
    if (agent.cmd && cmdStr.includes(agent.cmd.toLowerCase())) {
      return agent.type;
    }
  }

  return "unknown";
}

function projectNameFromPath(path: string): string {
  if (!path) return "unknown";
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "unknown";
}

export async function detectAgents(): Promise<Agent[]> {
  try {
    const processes: RawProcess[] = await invoke("detect_running_agents");
    const now = Date.now();

    return processes.map((p) => {
      const agentType = detectAgentType(p.name, p.cmd);
      return {
        id: `${p.pid}-${p.cwd}`,
        pid: p.pid,
        type: agentType,
        status: p.cpu_usage > 0.5 ? "active" : "idle",
        projectPath: p.cwd,
        projectName: projectNameFromPath(p.cwd),
        cwd: p.cwd,
        lastActivity: now,
      };
    });
  } catch (err) {
    console.error("Failed to detect agents:", err);
    return [];
  }
}
