/**
 * Shared PTY connection setup with watermark-based flow control.
 *
 * Extracted from TerminalPane.tsx and SpawnDialog.tsx to eliminate code
 * duplication (~80 lines repeated 3 times).
 *
 * Flow control uses xterm.js write callbacks + IPC pause/resume to apply
 * OS-level backpressure on the PTY when xterm can't keep up (e.g. `cat huge.txt`).
 * See: https://xtermjs.org/docs/guides/flowcontrol/
 */
import type { Terminal } from "@xterm/xterm";
import { invoke, send, listen } from "../ipc";
import { getDefaultShell } from "../platform";
import { useTerminalStore, markOutput, markUserInput } from "../../stores/terminalStore";

// ── Flow control watermarks ──
// HIGH: pause PTY when this many bytes are pending in xterm's write queue
// LOW:  resume PTY once pending bytes drop below this
const FLOW_HIGH = 500_000; // 500 KB — xterm.js recommended max
const FLOW_LOW = 50_000;   // 50 KB

interface PtyConnectionOptions {
  sessionId: string;
  terminal: Terminal;
  /** Fallback cwd when respawning a shell after agent exit */
  fallbackCwd?: string;
}

/**
 * Wire up a PTY ↔ xterm connection with flow control.
 * Returns a cleanup function that tears down all listeners.
 *
 * IMPORTANT: call this BEFORE spawning the PTY so no output is lost.
 */
export function setupPtyConnection({ sessionId, terminal, fallbackCwd = "~" }: PtyConnectionOptions): () => void {
  const ptyKey = `__pty_${sessionId}`;

  // Tear down existing connection first (handles HMR re-mounts and
  // SpawnDialog → TerminalPane handoff). Listeners are removed and
  // re-created synchronously, so no IPC messages are lost.
  const existingCleanup = (terminal as any)[`${ptyKey}_cleanup`];
  if (typeof existingCleanup === "function") {
    existingCleanup();
  }

  (terminal as any)[ptyKey] = true;

  // ── Flow-controlled output listener ──
  let watermark = 0;
  let paused = false;

  // Activity tracking (throttled to avoid store churn)
  let pendingBytes = 0;
  let lastMark = 0;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushActivity = () => {
    if (pendingBytes > 0) {
      markOutput(sessionId, pendingBytes);
      pendingBytes = 0;
      lastMark = Date.now();
    }
  };

  const unsubOutput = listen(`pty-output-${sessionId}`, (data: string) => {
    const len = typeof data === "string" ? data.length : 0;

    // Write with callback for flow control accounting
    watermark += len;
    terminal.write(data, () => {
      watermark = Math.max(watermark - len, 0);
      if (paused && watermark < FLOW_LOW) {
        paused = false;
        try { send("pty_resume", { id: sessionId }); } catch { invoke("pty_resume", { id: sessionId }).catch(() => {}); }
      }
    });

    // Pause PTY if write queue is too large
    if (!paused && watermark >= FLOW_HIGH) {
      paused = true;
      try { send("pty_pause", { id: sessionId }); } catch { invoke("pty_pause", { id: sessionId }).catch(() => {}); }
    }

    // Throttled activity tracking
    pendingBytes += len;
    const now = Date.now();
    if (now - lastMark > 200) {
      flushActivity();
    } else {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flushActivity, 250);
    }
  });

  // ── Exit handler: agent → shell fallback ──
  const unsubExit = listen(`pty-exit-${sessionId}`, (info?: { exitCode: number; signal?: number }) => {
    const store = useTerminalStore.getState();
    const session = store.sessions.find((s) => s.id === sessionId);
    const isShell = session?.agentType === "shell";

    if (!isShell) {
      const shellCwd = session?.projectPath || fallbackCwd;
      terminal.write("\r\n\x1b[90m[Process exited — starting shell...]\x1b[0m\r\n\r\n");
      getDefaultShell()
        .then((defaultShell) =>
          invoke<{ id: string; cwd: string; pid?: number }>("spawn_pty", {
            id: sessionId,
            cmd: defaultShell,
            args: [],
            cwd: shellCwd,
          })
        )
        .then((res) => {
          const actualCwd = res?.cwd || shellCwd;
          store.updateSession(sessionId, {
            agentType: "shell",
            originalAgentType: "shell",
            title: `Shell@${actualCwd.split("/").pop() || actualCwd}`,
            projectPath: actualCwd,
            pid: res?.pid,
          });
        })
        .catch(() => {
          terminal.write("\x1b[91m[Failed to start shell]\x1b[0m\r\n");
        });
    } else {
      const code = info?.exitCode ?? -1;
      const sig = info?.signal;
      const details = sig ? `signal=${sig}` : `code=${code}`;
      terminal.write(`\r\n\x1b[90m[Shell exited: ${details}]\x1b[0m\r\n`);
    }
  });

  // ── Helper: try send (fire-and-forget), fall back to invoke ──
  const ptyWrite = (id: string, data: string) => {
    try { send("write_pty", { id, data }); } catch { invoke("write_pty", { id, data }).catch(() => {}); }
  };
  const ptyResize = (id: string, cols: number, rows: number) => {
    try { send("resize_pty", { id, cols, rows }); } catch { invoke("resize_pty", { id, cols, rows }).catch(() => {}); }
  };

  // ── User input → PTY ──
  const dataDisposable = terminal.onData((data) => {
    ptyWrite(sessionId, data);
    markUserInput(sessionId);
  });

  // ── Resize → PTY ──
  const resizeDisposable = terminal.onResize(({ cols, rows }) => {
    ptyResize(sessionId, cols, rows);
  });

  // Sync initial size
  ptyResize(sessionId, terminal.cols, terminal.rows);

  // ── Cleanup function ──
  const cleanup = () => {
    if (flushTimer) clearTimeout(flushTimer);
    unsubOutput();
    unsubExit();
    dataDisposable.dispose();
    resizeDisposable.dispose();
    delete (terminal as any)[ptyKey];
    delete (terminal as any)[`${ptyKey}_cleanup`];
  };

  (terminal as any)[`${ptyKey}_cleanup`] = cleanup;
  return cleanup;
}
