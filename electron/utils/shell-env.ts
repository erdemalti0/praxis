/**
 * Resolve the user's full login shell environment.
 *
 * Packaged Electron apps on macOS/Linux don't inherit the user's shell PATH,
 * so commands like "claude", "opencode", "aider" etc. can't be found.
 * This module runs the user's login shell once at startup to capture the
 * full environment (PATH, etc.) and merges it into spawned PTY processes.
 */

import { execSync } from "child_process";
import os from "os";
import { getDefaultShell } from "./platform";

let resolvedEnv: Record<string, string> | null = null;

/**
 * Get the user's full shell environment by running their login shell.
 * Cached after first call.
 */
export function getUserShellEnv(): Record<string, string> {
  if (resolvedEnv) return resolvedEnv;

  if (process.platform === "win32") {
    // Windows inherits PATH correctly from the system
    resolvedEnv = { ...process.env } as Record<string, string>;
    return resolvedEnv;
  }

  const shell = getDefaultShell();

  try {
    // Run login shell interactively to source .zshrc/.bashrc/.profile
    // Use -ilc to get a login interactive shell that runs a command
    const output = execSync(`${shell} -ilc 'env'`, {
      encoding: "utf-8",
      timeout: 5000,
      env: {
        ...process.env,
        HOME: os.homedir(),
        USERPROFILE: os.homedir(),
      },
    });

    const env: Record<string, string> = {};
    for (const line of output.split("\n")) {
      const eqIdx = line.indexOf("=");
      if (eqIdx > 0) {
        const key = line.substring(0, eqIdx);
        const value = line.substring(eqIdx + 1);
        env[key] = value;
      }
    }

    // Merge: resolved env takes priority, but keep process.env keys that weren't in shell
    resolvedEnv = { ...process.env, ...env } as Record<string, string>;
  } catch {
    // Fallback: manually add common paths
    const home = os.homedir();
    const commonPaths = [
      `/opt/homebrew/bin`,
      `/opt/homebrew/sbin`,
      `/usr/local/bin`,
      `/usr/local/sbin`,
      `${home}/.local/bin`,
      `${home}/.cargo/bin`,
      `${home}/.bun/bin`,
      `${home}/.nvm/versions/node`,
      `/usr/bin`,
      `/bin`,
      `/usr/sbin`,
      `/sbin`,
    ];

    const existingPath = process.env.PATH || "";
    const mergedPath = [...commonPaths, ...existingPath.split(":")].filter(Boolean);
    // Deduplicate
    const uniquePath = [...new Set(mergedPath)].join(":");

    resolvedEnv = {
      ...process.env,
      PATH: uniquePath,
    } as Record<string, string>;
  }

  return resolvedEnv;
}
