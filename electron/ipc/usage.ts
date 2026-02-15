import { ipcMain } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { glob } from "glob";
import { ProviderUsage, UsageResponse } from "../../src/types/usage";

export function registerUsageHandlers() {
  ipcMain.handle("fetch_usage", async () => {
    const providers = await Promise.all([
      fetchClaudeOAuth(),
      fetchClaudeCost(),
      fetchGemini(),
      fetchAMP(),
    ]);

    const validProviders = providers.filter((p): p is ProviderUsage => p !== null);

    const response: UsageResponse = {
      providers: validProviders,
      fetchedAt: Date.now(),
    };

    return response;
  });
}

// Read Claude OAuth token from OS credential store or fallback to credentials file
function getClaudeAccessToken(): string | null {
  // Try macOS keychain (where Claude Code stores credentials on macOS)
  if (process.platform === "darwin") {
    try {
      const keychainData = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
        { encoding: "utf-8", timeout: 5000 }
      ).trim();
      if (keychainData) {
        const parsed = JSON.parse(keychainData);
        const token = parsed?.claudeAiOauth?.accessToken;
        if (token) {
          return token;
        }
      }
    } catch {
      // Keychain not available or no entry found
    }
  }

  // Fallback: try credentials file
  try {
    const credPath = path.join(os.homedir(), ".claude", ".credentials.json");
    if (fs.existsSync(credPath)) {
      const credData = JSON.parse(fs.readFileSync(credPath, "utf-8"));
      const token = credData?.claudeAiOauth?.accessToken;
      if (token) {
        return token;
      }
    }
  } catch {
    // File not found or invalid
  }

  return null;
}

// Claude OAuth rate limits
async function fetchClaudeOAuth(): Promise<ProviderUsage | null> {
  try {
    const token = getClaudeAccessToken();
    if (!token) {
      return null;
    }

    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
    });

    if (!response.ok) {
      return {
        id: "claude-oauth",
        name: "Claude Code",
        available: true,
        error: `HTTP ${response.status}`,
      };
    }

    // API returns snake_case keys and utilization as percentage (0-100)
    const data = await response.json();

    const windows = [];
    if (data.five_hour) {
      windows.push({
        name: "5 Hour",
        utilization: (data.five_hour.utilization ?? 0) / 100,
        resetsAt: data.five_hour.resets_at,
      });
    }
    if (data.seven_day) {
      windows.push({
        name: "7 Day",
        utilization: (data.seven_day.utilization ?? 0) / 100,
        resetsAt: data.seven_day.resets_at,
      });
    }
    if (data.seven_day_opus) {
      windows.push({
        name: "7 Day Opus",
        utilization: (data.seven_day_opus.utilization ?? 0) / 100,
        resetsAt: data.seven_day_opus.resets_at,
      });
    }
    if (data.seven_day_sonnet) {
      windows.push({
        name: "7 Day Sonnet",
        utilization: (data.seven_day_sonnet.utilization ?? 0) / 100,
        resetsAt: data.seven_day_sonnet.resets_at,
      });
    }

    return {
      id: "claude-oauth",
      name: "Claude Code",
      available: true,
      rateLimits: { windows },
    };
  } catch {
    return null;
  }
}

// Claude JSONL cost scanning
async function fetchClaudeCost(): Promise<ProviderUsage | null> {
  try {
    const projectsDir = path.join(os.homedir(), ".config", "claude", "projects");
    if (!fs.existsSync(projectsDir)) {
      return null;
    }

    const jsonlFiles = await glob("**/*.jsonl", { cwd: projectsDir });
    if (jsonlFiles.length === 0) {
      return null;
    }

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let totalCost = 0;
    const modelCosts: Record<string, number> = {};

    for (const file of jsonlFiles) {
      const filePath = path.join(projectsDir, file);
      const stat = fs.statSync(filePath);

      // Skip files older than 30 days
      if (stat.mtimeMs < thirtyDaysAgo) {
        continue;
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.costUSD && typeof entry.costUSD === "number") {
            totalCost += entry.costUSD;

            const model = entry.model || "unknown";
            modelCosts[model] = (modelCosts[model] || 0) + entry.costUSD;
          }
        } catch {
          // Skip invalid lines
        }
      }
    }

    if (totalCost === 0) {
      return null;
    }

    const breakdown = Object.entries(modelCosts).map(([model, cost]) => ({
      model,
      cost,
    }));

    return {
      id: "claude-cost",
      name: "Claude Code Cost",
      available: true,
      cost: {
        total: totalCost,
        period: "30 days",
        breakdown,
      },
    };
  } catch {
    return null;
  }
}

// Gemini
async function fetchGemini(): Promise<ProviderUsage | null> {
  try {
    const credsPath = path.join(os.homedir(), ".gemini", "oauth_creds.json");
    if (!fs.existsSync(credsPath)) {
      return null;
    }

    const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
    const accessToken = creds?.access_token;

    if (!accessToken) {
      return null;
    }

    // Call Gemini quota API
    const quotaEndpoint = "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
    const response = await fetch(quotaEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      return {
        id: "gemini",
        name: "Gemini",
        available: true,
        error: `HTTP ${response.status}`,
      };
    }

    // API returns { buckets: [{ modelId, remainingFraction, resetTime, tokenType }] }
    const data = await response.json();
    const buckets = data?.buckets || [];

    if (buckets.length === 0) {
      return null;
    }

    // Group into Pro and Flash tiers
    let proBest: { used: number; resetsAt: string } | null = null;
    let flashBest: { used: number; resetsAt: string } | null = null;

    for (const bucket of buckets) {
      if (bucket.tokenType !== "REQUESTS") continue;
      const modelId: string = (bucket.modelId || "").toLowerCase();
      if (modelId.endsWith("_vertex")) continue;

      const remaining = bucket.remainingFraction ?? 1;
      const used = 1 - remaining;

      if (modelId.includes("pro")) {
        if (!proBest || used > proBest.used) {
          proBest = { used, resetsAt: bucket.resetTime };
        }
      } else if (modelId.includes("flash")) {
        if (!flashBest || used > flashBest.used) {
          flashBest = { used, resetsAt: bucket.resetTime };
        }
      }
    }

    const windows = [];
    if (proBest) {
      windows.push({ name: "Pro (24h)", utilization: proBest.used, resetsAt: proBest.resetsAt });
    }
    if (flashBest) {
      windows.push({ name: "Flash (24h)", utilization: flashBest.used, resetsAt: flashBest.resetsAt });
    }

    if (windows.length === 0) {
      return null;
    }

    return {
      id: "gemini",
      name: "Gemini",
      available: true,
      rateLimits: { windows },
    };
  } catch {
    return null;
  }
}

// AMP (Sourcegraph)
async function fetchAMP(): Promise<ProviderUsage | null> {
  // AMP uses browser cookies for authentication (session cookie from ampcode.com)
  // Not yet implemented — requires browser cookie extraction
  return null;
}
