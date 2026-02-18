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

// Cache agent detection results to avoid spawning ps/tasklist on every poll
let cachedAgents: AgentProcess[] = [];
let agentsCacheTime = 0;
const AGENTS_CACHE_TTL = 3000; // 3 seconds

/**
 * Detect agent processes running as children of specific PTY sessions.
 * Used to detect when a user types `claude`, `aider`, etc. inside a shell terminal.
 *
 * Input:  { pids: Record<sessionId, ptyPid> }
 * Output: Record<sessionId, detectedAgentType | null>
 */
async function detectChildAgents(
  pids: Record<string, number>
): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  const keywords = getAgentKeywords();

  if (isWin) {
    // Windows: use PowerShell Get-CimInstance to find child processes
    for (const [sessionId, parentPid] of Object.entries(pids)) {
      try {
        const { stdout } = await execAsync(
          `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'ParentProcessId=${parentPid}' | Select-Object -ExpandProperty Name"`,
          { encoding: "utf-8", timeout: 3000 }
        );
        const names = stdout.split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean);
        const matched = keywords.find((kw) => names.some((n) => n.includes(kw)));
        result[sessionId] = matched || null;
      } catch {
        result[sessionId] = null;
      }
    }
  } else {
    // Unix/macOS: use pgrep + ps to find child process command names
    // Batch all session PIDs into a single pass for efficiency
    const entries = Object.entries(pids);
    await Promise.allSettled(
      entries.map(async ([sessionId, parentPid]) => {
        try {
          // Get all descendant PIDs (recursive children)
          const { stdout: pgrepOut } = await execAsync(
            `pgrep -P ${parentPid}`,
            { encoding: "utf-8", timeout: 2000 }
          );
          const childPids = pgrepOut.trim().split("\n").filter(Boolean).map((p) => p.trim());
          if (childPids.length === 0) {
            result[sessionId] = null;
            return;
          }

          // Get command names for all child PIDs
          const { stdout: psOut } = await execAsync(
            `ps -o comm= -p ${childPids.join(",")}`,
            { encoding: "utf-8", timeout: 2000 }
          );
          const cmds = psOut.trim().split("\n").map((c) => {
            // ps -o comm= gives full path on some systems, extract basename
            const trimmed = c.trim();
            return (trimmed.split("/").pop() || trimmed).toLowerCase();
          });

          // Match against known agent keywords
          const matched = keywords.find((kw) =>
            cmds.some((cmd) => cmd.includes(kw))
          );
          result[sessionId] = matched || null;
        } catch {
          result[sessionId] = null;
        }
      })
    );
  }

  return result;
}

// Map raw keyword match to canonical agent type
function keywordToAgentType(keyword: string | null): string | null {
  if (!keyword) return null;
  const kw = keyword.toLowerCase();
  if (kw.includes("claude")) return "claude-code";
  if (kw.includes("opencode")) return "opencode";
  if (kw.includes("aider")) return "aider";
  if (kw.includes("gemini")) return "gemini";
  if (kw.includes("amp")) return "amp";
  // Check custom agents
  try {
    const settingsPath = path.join(os.homedir(), ".praxis", "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      const matched = (settings.userAgents || []).find(
        (a: any) => a.cmd?.toLowerCase().trim() === kw
      );
      if (matched) return matched.type;
    }
  } catch {}
  return "unknown";
}

export function registerAgentsHandlers() {
  // Detect agents running as children of PTY sessions (shell → agent detection)
  ipcMain.handle(
    "detect_pty_children",
    async (_event, args: { pids: Record<string, number> }): Promise<Record<string, string | null>> => {
      try {
        const raw = await detectChildAgents(args.pids);
        // Convert keyword matches to canonical agent types
        const typed: Record<string, string | null> = {};
        for (const [sessionId, keyword] of Object.entries(raw)) {
          typed[sessionId] = keywordToAgentType(keyword);
        }
        return typed;
      } catch {
        return {};
      }
    }
  );

  ipcMain.handle("detect_running_agents", async (): Promise<AgentProcess[]> => {
    try {
      const now = Date.now();
      if (cachedAgents.length > 0 && now - agentsCacheTime < AGENTS_CACHE_TTL) {
        return cachedAgents;
      }
      const keywords = getAgentKeywords();
      const result = isWin
        ? await detectAgentsWindows(keywords)
        : await detectAgentsUnix(keywords);
      cachedAgents = result;
      agentsCacheTime = now;
      return result;
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
