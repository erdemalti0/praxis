import { ipcMain, BrowserWindow } from "electron";
import { spawnPty, writePty, resizePty, closePty } from "../utils/pty-manager";

// Batch PTY output per session: accumulate data and flush every 16ms (~60fps)
const outputBuffers = new Map<string, string[]>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const BATCH_INTERVAL = 16; // ms — one frame at 60fps

function flushOutput(win: BrowserWindow, sessionId: string) {
  const chunks = outputBuffers.get(sessionId);
  if (chunks && chunks.length > 0 && !win.isDestroyed()) {
    win.webContents.send(`pty-output-${sessionId}`, chunks.join(""));
  }
  outputBuffers.delete(sessionId);
  flushTimers.delete(sessionId);
}

function bufferOutput(win: BrowserWindow, sessionId: string, data: string) {
  const chunks = outputBuffers.get(sessionId);
  if (chunks) {
    chunks.push(data);
  } else {
    outputBuffers.set(sessionId, [data]);
  }

  if (!flushTimers.has(sessionId)) {
    flushTimers.set(
      sessionId,
      setTimeout(() => flushOutput(win, sessionId), BATCH_INTERVAL)
    );
  }
}

function cleanupBuffers(sessionId: string) {
  const timer = flushTimers.get(sessionId);
  if (timer) clearTimeout(timer);
  outputBuffers.delete(sessionId);
  flushTimers.delete(sessionId);
}

export function registerTerminalHandlers(win: BrowserWindow) {
  ipcMain.handle("spawn_pty", (_event, args: { id: string; cmd: string; args: string[]; cwd: string }) => {
    const result = spawnPty(
      args.id,
      args.cmd,
      args.args,
      args.cwd,
      80,
      24,
      (sessionId, data) => {
        bufferOutput(win, sessionId, data);
      },
      (sessionId, exitCode, signal) => {
        // Flush any remaining buffered output before sending exit
        flushOutput(win, sessionId);
        cleanupBuffers(sessionId);
        if (!win.isDestroyed()) {
          win.webContents.send(`pty-exit-${sessionId}`, { exitCode, signal });
        }
      }
    );
    return result;
  });

  ipcMain.handle("write_pty", (_event, args: { id: string; data: string }) => {
    writePty(args.id, args.data);
  });

  ipcMain.handle("resize_pty", (_event, args: { id: string; cols: number; rows: number }) => {
    resizePty(args.id, args.cols, args.rows);
  });

  ipcMain.handle("close_pty", (_event, args: { id: string }) => {
    cleanupBuffers(args.id);
    closePty(args.id);
  });
}
