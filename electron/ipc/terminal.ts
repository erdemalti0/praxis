import { ipcMain, BrowserWindow } from "electron";
import { spawnPty, writePty, resizePty, closePty, pausePty, resumePty } from "../utils/pty-manager";

// ── Output batching: single global timer flushes ALL sessions every 16ms ──
const outputBuffers = new Map<string, string[]>();
let globalFlushScheduled = false;
const BATCH_INTERVAL = 12; // ms — slightly under one frame for snappier feel

// Track which BrowserWindow owns each PTY session so output goes to the correct window
const sessionOwners = new Map<string, BrowserWindow>();

function flushAllOutput() {
  globalFlushScheduled = false;
  for (const [sessionId, chunks] of outputBuffers) {
    const win = sessionOwners.get(sessionId);
    if (chunks.length > 0 && win && !win.isDestroyed()) {
      win.webContents.send(`pty-output-${sessionId}`, chunks.join(""));
    }
  }
  outputBuffers.clear();
}

function bufferOutput(sessionId: string, data: string) {
  const chunks = outputBuffers.get(sessionId);
  if (chunks) {
    chunks.push(data);
  } else {
    outputBuffers.set(sessionId, [data]);
  }

  if (!globalFlushScheduled) {
    globalFlushScheduled = true;
    setTimeout(flushAllOutput, BATCH_INTERVAL);
  }
}

function flushSession(sessionId: string) {
  const chunks = outputBuffers.get(sessionId);
  const win = sessionOwners.get(sessionId);
  if (chunks && chunks.length > 0 && win && !win.isDestroyed()) {
    win.webContents.send(`pty-output-${sessionId}`, chunks.join(""));
  }
  outputBuffers.delete(sessionId);
}

function cleanupSession(sessionId: string) {
  outputBuffers.delete(sessionId);
  sessionOwners.delete(sessionId);
}

export function registerTerminalHandlers() {
  // ── spawn_pty: async (returns result) ──
  ipcMain.handle("spawn_pty", (event, args: { id: string; cmd: string; args: string[]; cwd: string }) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin) {
      sessionOwners.set(args.id, senderWin);
    }

    const result = spawnPty(
      args.id,
      args.cmd,
      args.args,
      args.cwd,
      80,
      24,
      (sessionId, data) => {
        bufferOutput(sessionId, data);
      },
      (sessionId, exitCode, signal) => {
        // Flush remaining buffered output before exit event
        flushSession(sessionId);
        const win = sessionOwners.get(sessionId);
        if (win && !win.isDestroyed()) {
          win.webContents.send(`pty-exit-${sessionId}`, { exitCode, signal });
        }
        cleanupSession(sessionId);
      }
    );
    return result;
  });

  // ── write_pty: fire-and-forget preferred, but also handle invoke for compatibility ──
  ipcMain.on("write_pty", (_event, args: { id: string; data: string }) => {
    try { writePty(args.id, args.data); } catch {}
  });
  ipcMain.handle("write_pty", (_event, args: { id: string; data: string }) => {
    try { writePty(args.id, args.data); } catch {}
  });

  // ── resize_pty: fire-and-forget preferred, but also handle invoke for compatibility ──
  ipcMain.on("resize_pty", (_event, args: { id: string; cols: number; rows: number }) => {
    try { resizePty(args.id, args.cols, args.rows); } catch {}
  });
  ipcMain.handle("resize_pty", (_event, args: { id: string; cols: number; rows: number }) => {
    try { resizePty(args.id, args.cols, args.rows); } catch {}
  });

  // ── Flow control: pause/resume PTY from renderer ──
  ipcMain.on("pty_pause", (_event, args: { id: string }) => {
    try { pausePty(args.id); } catch {}
  });
  ipcMain.handle("pty_pause", (_event, args: { id: string }) => {
    try { pausePty(args.id); } catch {}
  });

  ipcMain.on("pty_resume", (_event, args: { id: string }) => {
    try { resumePty(args.id); } catch {}
  });
  ipcMain.handle("pty_resume", (_event, args: { id: string }) => {
    try { resumePty(args.id); } catch {}
  });

  // ── close_pty: async (cleanup) ──
  ipcMain.handle("close_pty", (_event, args: { id: string }) => {
    cleanupSession(args.id);
    closePty(args.id);
  });
}
