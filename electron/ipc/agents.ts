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
const isWin = process.platform === "win32";
const isLinux = process.platform === "linux";

function getAgentKeywords(): string[] {
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
      if (isWin) {
        return detectAgentsWindows(keywords);
      }
      return detectAgentsUnix(keywords);
    } catch {
      return [];
    }
  });
}

function detectAgentsUnix(keywords: string[]): AgentProcess[] {
  const output = execSync("ps aux", { encoding: "utf-8", timeout: 5000 });
  const lines = output.split("\n").slice(1);
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

    const cmdParts = cmd.split(/\s+/);
    const name = cmdParts[0].split("/").pop() || cmdParts[0];

    let cwd = "";
    try {
      if (isLinux) {
        cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
      } else {
        // macOS
        const lsofOutput = execSync(`lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | head -1`, {
          encoding: "utf-8",
          timeout: 2000,
        });
        cwd = lsofOutput.trim().replace(/^n/, "");
      }
    } catch {}

    agents.push({
      pid,
      name,
      cmd: cmdParts,
      cwd,
      cpu_usage: parseFloat(cpuStr) || 0,
    });
  }

  return agents;
}

function detectAgentsWindows(keywords: string[]): AgentProcess[] {
  const output = execSync("tasklist /V /FO CSV", { encoding: "utf-8", timeout: 5000 });
  const lines = output.split("\n").slice(1);
  const agents: AgentProcess[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // CSV format: "Image Name","PID","Session Name","Session#","Mem Usage","Status","User Name","CPU Time","Window Title"
    const match = line.match(/"([^"]*?)","(\d+)"/);
    if (!match) continue;

    const name = match[1];
    const pid = parseInt(match[2], 10);
    const nameLower = name.toLowerCase();

    const isAgent = keywords.some((kw) => nameLower.includes(kw));
    if (!isAgent) continue;

    agents.push({
      pid,
      name,
      cmd: [name],
      cwd: "",
      cpu_usage: 0,
    });
  }

  return agents;
}
