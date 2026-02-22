#!/usr/bin/env npx tsx
/**
 * Canary Test Automation Script
 *
 * Spawns each CLI agent and classifies its capabilities:
 * - Stream JSON support
 * - Session resume support
 * - Permission flags
 * - Compaction signals
 * - Interactive prompts
 * - Slash commands
 *
 * Usage:
 *   npx tsx scripts/canary-test.ts [--agent <agent-id>] [--cwd <path>]
 *
 * Output: JSON results to stdout, human-readable summary to stderr.
 */

import { spawn } from "child_process";

type ChatAgentId = "claude-code" | "codex" | "gemini" | "opencode";

interface PromptClassification {
  pattern: string;
  rawText: string;
  responseType: "yes_no" | "choice" | "freeform";
}

interface CanaryResult {
  agentId: ChatAgentId;
  cliVersion: string;
  cliFound: boolean;
  supportsStreamJson: boolean;
  supportsSessionResume: boolean;
  hasPermissionFlag: boolean;
  permissionFlagName: string | null;
  hasCompactionSignal: boolean;
  interactivePrompts: PromptClassification[];
  slashCommands: string[];
  rawOutput: string;
  exitCode: number | null;
  error?: string;
}

const CLI_CONFIGS: Record<ChatAgentId, {
  cmd: string;
  versionArgs: string[];
  testArgs: string[];
  permissionFlag: string | null;
  sessionFlag: string | null;
}> = {
  "claude-code": {
    cmd: "claude",
    versionArgs: ["--version"],
    testArgs: ["-p", "Say exactly: CANARY_OK", "--output-format", "stream-json", "--max-turns", "1"],
    permissionFlag: "--dangerously-skip-permissions",
    sessionFlag: "--session-id",
  },
  codex: {
    cmd: "codex",
    versionArgs: ["--version"],
    testArgs: ["exec", "Say exactly: CANARY_OK", "--json"],
    permissionFlag: "--full-auto",
    sessionFlag: null,
  },
  gemini: {
    cmd: "gemini",
    versionArgs: ["--version"],
    testArgs: ["-p", "Say exactly: CANARY_OK", "--output-format", "stream-json"],
    permissionFlag: "-y",
    sessionFlag: "--resume",
  },
  opencode: {
    cmd: "opencode",
    versionArgs: ["--version"],
    testArgs: ["run", "--format", "json", "Say exactly: CANARY_OK"],
    permissionFlag: null,
    sessionFlag: "--session",
  },
};

function runCommand(cmd: string, args: string[], timeoutMs = 30_000): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], timeout: timeoutMs });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("error", (err) => {
      resolve({ stdout, stderr: stderr + `\n${err.message}`, exitCode: null });
    });
    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code });
    });

    // Send EOF to stdin
    proc.stdin.end();
  });
}

async function testAgent(agentId: ChatAgentId, cwd: string): Promise<CanaryResult> {
  const config = CLI_CONFIGS[agentId];
  const result: CanaryResult = {
    agentId,
    cliVersion: "unknown",
    cliFound: false,
    supportsStreamJson: false,
    supportsSessionResume: config.sessionFlag !== null,
    hasPermissionFlag: config.permissionFlag !== null,
    permissionFlagName: config.permissionFlag,
    hasCompactionSignal: false,
    interactivePrompts: [],
    slashCommands: [],
    rawOutput: "",
    exitCode: null,
  };

  // 1. Check if CLI is installed
  process.stderr.write(`[${agentId}] Checking CLI availability...\n`);
  const versionResult = await runCommand(config.cmd, config.versionArgs, 10_000);
  if (versionResult.exitCode === null) {
    result.error = `CLI not found: ${config.cmd}`;
    return result;
  }
  result.cliFound = true;
  result.cliVersion = (versionResult.stdout || versionResult.stderr).trim().split("\n")[0];
  process.stderr.write(`[${agentId}] Found: ${result.cliVersion}\n`);

  // 2. Run test message
  process.stderr.write(`[${agentId}] Running canary test message...\n`);
  const testResult = await runCommand(config.cmd, config.testArgs, 60_000);
  result.rawOutput = testResult.stdout;
  result.exitCode = testResult.exitCode;

  // 3. Classify output
  const lines = testResult.stdout.split("\n");
  let hasJson = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      hasJson = true;

      // Check for compaction signal
      if (obj.type === "system" && obj.subtype === "compact_boundary") {
        result.hasCompactionSignal = true;
      }
    } catch {
      // Not JSON — check for interactive prompts
      if (/\(y\/n\)/i.test(trimmed) || /\[Y\/n\]/i.test(trimmed)) {
        result.interactivePrompts.push({
          pattern: "yes_no",
          rawText: trimmed,
          responseType: "yes_no",
        });
      }
    }
  }
  result.supportsStreamJson = hasJson;

  process.stderr.write(`[${agentId}] Done. JSON output: ${hasJson}, Exit code: ${testResult.exitCode}\n`);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const agentIdx = args.indexOf("--agent");
  const cwdIdx = args.indexOf("--cwd");
  const cwd = cwdIdx >= 0 ? args[cwdIdx + 1] : process.cwd();

  const agents: ChatAgentId[] = agentIdx >= 0
    ? [args[agentIdx + 1] as ChatAgentId]
    : ["claude-code", "codex", "gemini", "opencode"];

  process.stderr.write(`Canary test starting for: ${agents.join(", ")}\n`);
  process.stderr.write(`Working directory: ${cwd}\n\n`);

  const results: CanaryResult[] = [];
  for (const agentId of agents) {
    const result = await testAgent(agentId, cwd);
    results.push(result);
  }

  // Output JSON results
  console.log(JSON.stringify(results, null, 2));

  // Human-readable summary
  process.stderr.write("\n=== Capability Matrix ===\n\n");
  process.stderr.write("Agent          | Found | Stream JSON | Session Resume | Permission Flag | Compaction\n");
  process.stderr.write("-------------- | ----- | ----------- | -------------- | --------------- | ----------\n");
  for (const r of results) {
    const found = r.cliFound ? "Yes" : "No";
    const stream = r.supportsStreamJson ? "Yes" : "No";
    const resume = r.supportsSessionResume ? "Yes" : "No";
    const perm = r.permissionFlagName || "N/A";
    const compact = r.hasCompactionSignal ? "Yes" : "No";
    process.stderr.write(`${r.agentId.padEnd(14)} | ${found.padEnd(5)} | ${stream.padEnd(11)} | ${resume.padEnd(14)} | ${perm.padEnd(15)} | ${compact}\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
