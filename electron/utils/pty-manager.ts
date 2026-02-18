import type { IPty } from "node-pty";
import os from "os";
import path from "path";
import { getUserShellEnv } from "./shell-env";

interface PtySession {
  pty: IPty;
  cols: number;
  rows: number;
}

const sessions = new Map<string, PtySession>();

function expandHome(cwd: string): string {
  if (cwd.startsWith("~")) {
    return cwd.replace("~", os.homedir());
  }
  return cwd;
}

export function spawnPty(
  id: string,
  cmd: string,
  args: string[],
  cwd: string,
  cols: number,
  rows: number,
  onData: (id: string, data: string) => void,
  onExit?: (id: string, exitCode: number, signal?: number) => void
): { id: string; cwd: string; pid: number } {
  // Dynamic require for node-pty (native module)
  const pty = require("node-pty");

  const expandedCwd = expandHome(cwd);

  // Resolve to absolute path
  const resolvedCwd = path.resolve(expandedCwd);

  // Validate cwd exists, fallback to home directory
  const fs = require("fs");
  let safeCwd = resolvedCwd;
  try {
    if (!fs.existsSync(safeCwd) || !fs.statSync(safeCwd).isDirectory()) {
      safeCwd = os.homedir();
    }
  } catch {
    safeCwd = os.homedir();
  }

  const isWindows = process.platform === "win32";

  // Use the user's full shell environment so agent CLIs (claude, aider, etc.)
  // are found in PATH even in packaged builds
  const userEnv = getUserShellEnv();

  const shell = pty.spawn(cmd, args, {
    name: isWindows ? undefined : "xterm-256color",
    cols: cols || 80,
    rows: rows || 24,
    cwd: safeCwd,
    env: {
      ...userEnv,
      ...(isWindows ? {} : { TERM: "xterm-256color" }),
      PWD: safeCwd,
      HOME: os.homedir(),
      USERPROFILE: os.homedir(),
    },
  });

  sessions.set(id, { pty: shell, cols: cols || 80, rows: rows || 24 });

  shell.onData((data: string) => {
    onData(id, data);
  });

  shell.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
    sessions.delete(id);
    onExit?.(id, exitCode, signal);
  });

  return { id, cwd: safeCwd, pid: shell.pid };
}

/** Get the PID of a running PTY session */
export function getPtyPid(id: string): number | undefined {
  return sessions.get(id)?.pty.pid;
}

export function writePty(id: string, data: string): void {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session ${id} not found`);
  session.pty.write(data);
}

export function resizePty(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session) return;
  session.pty.resize(cols, rows);
  session.cols = cols;
  session.rows = rows;
}

export function pausePty(id: string): void {
  const session = sessions.get(id);
  if (session) {
    session.pty.pause();
  }
}

export function resumePty(id: string): void {
  const session = sessions.get(id);
  if (session) {
    session.pty.resume();
  }
}

export function closePty(id: string): void {
  const session = sessions.get(id);
  if (session) {
    session.pty.kill();
    sessions.delete(id);
  }
}

/** Kill all active PTY sessions — called on app quit. */
export function closeAllPty(): void {
  for (const [_id, session] of sessions) {
    try {
      session.pty.kill();
    } catch {
      // ignore — process may already be dead
    }
  }
  sessions.clear();
}
