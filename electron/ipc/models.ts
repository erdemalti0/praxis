import { ipcMain } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { getUserShellEnv } from "../utils/shell-env";

const execFileAsync = promisify(execFile);

interface ModelOption {
  id: string;
  label: string;
  cliValue: string;
}

interface DiscoveryMeta {
  source: "live" | "disk-cache" | "fallback";
  fetchedAt: number;
  stale: boolean;
  lastError?: string;
}

interface AgentAvailability {
  installed: boolean;
  models: ModelOption[];
  meta?: DiscoveryMeta;
}

type ChatAgentId = "claude-code" | "opencode" | "gemini" | "codex";

// ─── Cache ───────────────────────────────────────────────────────────

let memoryCache: Record<ChatAgentId, AgentAvailability> | null = null;
let memoryCacheTime = 0;
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 min
const DISK_CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour

const CACHE_DIR = path.join(os.homedir(), ".praxis", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "models.json");

interface DiskCache {
  fetchedAt: number;
  data: Record<ChatAgentId, AgentAvailability>;
}

function readDiskCache(): DiskCache | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as DiskCache;
  } catch {
    return null;
  }
}

function writeDiskCache(data: Record<ChatAgentId, AgentAvailability>): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), data } satisfies DiskCache));
  } catch (err) {
    console.warn("[Models] Failed to write disk cache:", err);
  }
}

// ─── Config ──────────────────────────────────────────────────────────

const CLI_COMMANDS: Record<ChatAgentId, string> = {
  "claude-code": "claude",
  opencode: "opencode",
  gemini: "gemini",
  codex: "codex",
};

// Curated fallback models for cli-alias agents (and safety net for cli-listable agents)
const FALLBACK_MODELS: Record<ChatAgentId, ModelOption[]> = {
  "claude-code": [
    { id: "opus", label: "Claude Opus 4.6", cliValue: "opus" },
    { id: "sonnet", label: "Claude Sonnet 4.6", cliValue: "sonnet" },
    { id: "haiku", label: "Claude Haiku 4.5", cliValue: "haiku" },
  ],
  opencode: [
    { id: "anthropic/claude-sonnet-4-6-20250620", label: "Claude Sonnet 4.6", cliValue: "anthropic/claude-sonnet-4-6-20250620" },
    { id: "openai/gpt-4.1", label: "GPT-4.1", cliValue: "openai/gpt-4.1" },
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", cliValue: "google/gemini-2.5-pro" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", cliValue: "gemini-2.5-pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", cliValue: "gemini-2.5-flash" },
    { id: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview", cliValue: "gemini-3-pro-preview" },
    { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", cliValue: "gemini-3-flash-preview" },
  ],
  codex: [
    { id: "gpt-5.3-codex", label: "GPT-5.3 Codex", cliValue: "gpt-5.3-codex" },
    { id: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max", cliValue: "gpt-5.1-codex-max" },
    { id: "gpt-5.1-codex", label: "GPT-5.1 Codex", cliValue: "gpt-5.1-codex" },
    { id: "gpt-5-codex", label: "GPT-5 Codex", cliValue: "gpt-5-codex" },
    { id: "gpt-5-codex-mini", label: "GPT-5 Codex Mini", cliValue: "gpt-5-codex-mini" },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────

async function isCliInstalled(cmd: string): Promise<boolean> {
  try {
    const env = { ...getUserShellEnv() };
    delete env.CLAUDECODE;
    const whichCmd = process.platform === "win32" ? "where" : "which";
    const { stdout } = await execFileAsync(whichCmd, [cmd], { encoding: "utf-8", timeout: 3000, env });
    console.log(`[Models] ${cmd} found at: ${stdout.trim()}`);
    return true;
  } catch {
    console.log(`[Models] ${cmd} not found`);
    return false;
  }
}

/** CLI-alias agents: models are known aliases passed directly to the CLI. */
function getCliAliasModels(agentId: ChatAgentId): ModelOption[] {
  return FALLBACK_MODELS[agentId];
}

// ─── OpenCode CLI discovery (cli-listable) ───────────────────────────

/**
 * Read ~/.local/share/opencode/auth.json to get active provider IDs.
 * "opencode" (free tier) is always included.
 */
function getOpenCodeActiveProviders(): Set<string> {
  const providers = new Set<string>(["opencode"]); // free models always available
  try {
    const authPath = (() => {
      if (process.platform === "win32") {
        const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
        return path.join(appData, "opencode", "auth.json");
      }
      const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
      return path.join(dataHome, "opencode", "auth.json");
    })();
    if (fs.existsSync(authPath)) {
      const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
      for (const key of Object.keys(auth)) {
        providers.add(key);
      }
      console.log(`[Models] opencode active providers: ${[...providers].join(", ")}`);
    }
  } catch (err) {
    console.warn("[Models] Failed to read opencode auth.json:", err);
  }
  return providers;
}

async function discoverOpenCodeModels(): Promise<ModelOption[]> {
  try {
    const env = { ...getUserShellEnv() };
    delete env.CLAUDECODE;

    const { stdout, stderr } = await execFileAsync("opencode", ["models"], {
      encoding: "utf-8",
      timeout: 20000,
      env,
      maxBuffer: 5 * 1024 * 1024,
    });

    if (stderr) {
      console.warn("[Models] opencode models stderr:", stderr.slice(0, 500));
    }

    const activeProviders = getOpenCodeActiveProviders();

    const PROVIDER_LABELS: Record<string, string> = {
      opencode: "OpenCode Zen",
      nvidia: "Nvidia",
      "zai-coding-plan": "Z.AI Coding Plan",
      anthropic: "Anthropic",
      openai: "OpenAI",
      google: "Google",
      groq: "Groq",
      deepseek: "DeepSeek",
      mistral: "Mistral",
      fireworks: "Fireworks",
      together: "Together",
      ollama: "Ollama",
    };

    const lines = stdout.trim().split("\n").filter(Boolean);
    const models: ModelOption[] = [];

    for (const line of lines) {
      const id = line.trim();
      if (!id || id.startsWith("{") || id.startsWith("}") || id.startsWith("[")) continue;

      const providerPrefix = id.split("/")[0];
      if (!activeProviders.has(providerPrefix)) continue;

      const lastSegment = id.split("/").pop() || id;
      const modelName = lastSegment
        .split("-")
        .map((w) => {
          if (/^\d/.test(w) || /^v\d/.test(w)) return w;
          if (w.length <= 3 && w === w.toUpperCase()) return w;
          return w.charAt(0).toUpperCase() + w.slice(1);
        })
        .join(" ");

      const providerTag = PROVIDER_LABELS[providerPrefix] || providerPrefix;
      const label = `${modelName}  ·  ${providerTag}`;

      models.push({ id, label, cliValue: id });
    }

    console.log(`[Models] opencode: discovered ${models.length} models (filtered by active providers)`);
    return models.length > 0 ? models : FALLBACK_MODELS.opencode;
  } catch (err) {
    console.error("[Models] opencode models failed:", err);
    return FALLBACK_MODELS.opencode;
  }
}

// ─── Main discovery orchestration ────────────────────────────────────

async function discoverAllModels(): Promise<Record<ChatAgentId, AgentAvailability>> {
  const agentIds = Object.keys(CLI_COMMANDS) as ChatAgentId[];

  // Check installation status for all agents in parallel
  const installChecks = await Promise.all(
    agentIds.map(async (agentId) => ({
      agentId,
      installed: await isCliInstalled(CLI_COMMANDS[agentId]),
    })),
  );

  // CLI-listable: discover opencode models via CLI
  const ocInstalled = installChecks.find((c) => c.agentId === "opencode")?.installed;
  const opencodeModels = ocInstalled ? await discoverOpenCodeModels() : FALLBACK_MODELS.opencode;

  const now = Date.now();
  const meta: DiscoveryMeta = { source: "live", fetchedAt: now, stale: false };

  const result = {} as Record<ChatAgentId, AgentAvailability>;
  for (const { agentId, installed } of installChecks) {
    const models = agentId === "opencode" ? opencodeModels : getCliAliasModels(agentId);
    result[agentId] = { installed, models, meta };
    console.log(`[Models] ${agentId}: installed=${installed}, models=${models.length}`);
  }

  return result;
}

// ─── IPC handler with stale-while-revalidate cache ───────────────────

export function registerModelsHandlers() {
  ipcMain.handle("discover_agent_models", async () => {
    const now = Date.now();

    // 1. Fresh memory cache → return immediately
    if (memoryCache && now - memoryCacheTime < MEMORY_CACHE_TTL) {
      return memoryCache;
    }

    // 2. Disk cache exists → return it, revalidate in background
    const disk = readDiskCache();
    if (disk) {
      const isStale = now - disk.fetchedAt > DISK_CACHE_MAX_AGE;
      const diskMeta: DiscoveryMeta = { source: "disk-cache", fetchedAt: disk.fetchedAt, stale: isStale };

      // Re-tag metadata as disk-cache
      const result = {} as Record<ChatAgentId, AgentAvailability>;
      for (const [id, avail] of Object.entries(disk.data) as [ChatAgentId, AgentAvailability][]) {
        result[id] = { ...avail, meta: diskMeta };
      }

      memoryCache = result;
      memoryCacheTime = disk.fetchedAt;

      // Background revalidation (fire and forget)
      discoverAllModels()
        .then((fresh) => {
          memoryCache = fresh;
          memoryCacheTime = Date.now();
          writeDiskCache(fresh);
        })
        .catch((err) => console.error("[Models] Background revalidation failed:", err));

      return result;
    }

    // 3. No cache → blocking fetch
    try {
      const fresh = await discoverAllModels();
      memoryCache = fresh;
      memoryCacheTime = Date.now();
      writeDiskCache(fresh);
      return fresh;
    } catch {
      // Total failure → return fallback
      const fallbackMeta: DiscoveryMeta = { source: "fallback", fetchedAt: now, stale: false };
      const fallback = {} as Record<ChatAgentId, AgentAvailability>;
      for (const [agentId, models] of Object.entries(FALLBACK_MODELS) as [ChatAgentId, ModelOption[]][]) {
        fallback[agentId] = { installed: false, models, meta: fallbackMeta };
      }
      return fallback;
    }
  });
}
