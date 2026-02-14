import { ipcMain } from "electron";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

interface AgentProcess {
  pid: number;
  name: string;
  cmd: string[];
  cwd: string;
  cpu_usage: number;
}

const BUILTIN_KEYWORDS = ["claude", "opencode", "aider", "gemini", "amp"];

function getAgentKeywords(): string[] {
  // Load custom agent keywords from settings
  try {
    const settingsPath = path.join(os.homedir(), ".praxis", "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const customKeywords = (settings.userAgents || []).map((a: any) => a.cmd?.toLowerCase().trim()).filter(Boolean);
      return [...BUILTIN_KEYWORDS, ...customKeywords];
    }
  } catch {}
  return BUILTIN_KEYWORDS;
}

export function registerAgentsHandlers() {
  ipcMain.handle("detect_running_agents", (): AgentProcess[] => {
    try {
      const keywords = getAgentKeywords();
      const output = execSync("ps aux", { encoding: "utf-8", timeout: 5000 });
      const lines = output.split("\n").slice(1); // skip header
      const agents: AgentProcess[] = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 11) continue;

        const pid = parseInt(parts[1], 10);
        const cpuStr = parts[2];
        const cmd = parts.slice(10).join(" ");
        const cmdLower = cmd.toLowerCase();

        const isAgent = keywords.some((kw) => cmdLower.includes(kw));
        if (!isAgent) continue;

        // Extract process name from command
        const cmdParts = cmd.split(/\s+/);
        const name = cmdParts[0].split("/").pop() || cmdParts[0];

        // Try to get cwd from lsof (macOS)
        let cwd = "";
        try {
          const lsofOutput = execSync(`lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | head -1`, {
            encoding: "utf-8",
            timeout: 2000,
          });
          cwd = lsofOutput.trim().replace(/^n/, "");
        } catch {
          // fallback: no cwd
        }

        agents.push({
          pid,
          name,
          cmd: cmdParts,
          cwd,
          cpu_usage: parseFloat(cpuStr) || 0,
        });
      }

      return agents;
    } catch {
      return [];
    }
  });
}
