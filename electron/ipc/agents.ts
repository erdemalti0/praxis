import { ipcMain } from "electron";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

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

// Cached agent keywords with TTL
let cachedKeywords: string[] | null = null;
let keywordsCacheTime = 0;
const KEYWORDS_CACHE_TTL = 30000; // 30 seconds

function getAgentKeywords(): string[] {
  const now = Date.now();
  if (cachedKeywords && now - keywordsCacheTime < KEYWORDS_CACHE_TTL) {
    return cachedKeywords;
  }
  try {
    const settingsPath = path.join(os.homedir(), ".praxis", "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const customKeywords = (settings.userAgents || []).map((a: any) => a.cmd?.toLowerCase().trim()).filter(Boolean);
      cachedKeywords = [...BUILTIN_KEYWORDS, ...customKeywords];
    } else {
      cachedKeywords = BUILTIN_KEYWORDS;
    }
  } catch {
    cachedKeywords = BUILTIN_KEYWORDS;
  }
  keywordsCacheTime = now;
  return cachedKeywords!;
}

export function registerAgentsHandlers() {
  ipcMain.handle("detect_running_agents", async (): Promise<AgentProcess[]> => {
    try {
      const keywords = getAgentKeywords();
      if (isWin) {
        return await detectAgentsWindows(keywords);
      }
      return await detectAgentsUnix(keywords);
    } catch {
      return [];
    }
  });
}

async function detectAgentsUnix(keywords: string[]): Promise<AgentProcess[]> {
  const { stdout } = await execAsync("ps aux", { encoding: "utf-8", timeout: 5000 });
  const lines = stdout.split("\n").slice(1);
  const agents: AgentProcess[] = [];
  const cwdPromises: Promise<void>[] = [];

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

    const agent: AgentProcess = {
      pid,
      name,
      cmd: cmdParts,
      cwd: "",
      cpu_usage: parseFloat(cpuStr) || 0,
    };
    agents.push(agent);

    // Resolve cwd asynchronously in parallel
    cwdPromises.push(
      (async () => {
        try {
          if (isLinux) {
            agent.cwd = await fs.promises.readlink(`/proc/${pid}/cwd`);
          } else {
            // macOS
            const { stdout: lsofOutput } = await execAsync(
              `lsof -p ${pid} -Fn 2>/dev/null | grep '^n/' | head -1`,
              { encoding: "utf-8", timeout: 2000 }
            );
            agent.cwd = lsofOutput.trim().replace(/^n/, "");
          }
        } catch {}
      })()
    );
  }

  // Wait for all cwd resolutions in parallel
  await Promise.allSettled(cwdPromises);

  return agents;
}

async function detectAgentsWindows(keywords: string[]): Promise<AgentProcess[]> {
  const { stdout } = await execAsync("tasklist /V /FO CSV", { encoding: "utf-8", timeout: 5000 });
  const lines = stdout.split("\n").slice(1);
  const agents: AgentProcess[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
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
