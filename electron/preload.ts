import { contextBridge, ipcRenderer } from "electron";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Validates that a write path is within allowed directories.
 * Permits writes to user home subdirectories (project files, .praxis config) and temp dir.
 * Blocks writes to system paths outside the user's home.
 */
function isAllowedWritePath(filePath: string): boolean {
  const home = os.homedir();
  return filePath.startsWith(home) || filePath.startsWith(os.tmpdir());
}

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: any[]) => void) => {
    const listener = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
  send: (channel: string, ...args: any[]) => {
    const validChannels: string[] = [];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args);
    }
  },
  // Direct filesystem access (bypasses IPC)
  readFileSync: (filePath: string): string => {
    return fs.readFileSync(filePath, "utf-8");
  },
  writeFileSync: (filePath: string, content: string): void => {
    if (!isAllowedWritePath(filePath)) {
      console.warn(`[preload] Write rejected — path not allowed: ${filePath}`);
      return;
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
  },
  fileExists: (filePath: string): boolean => {
    return fs.existsSync(filePath);
  },
  writeFileBinary: (filePath: string, base64Data: string): void => {
    if (!isAllowedWritePath(filePath)) {
      console.warn(`[preload] Binary write rejected — path not allowed: ${filePath}`);
      return;
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  },
  getTempDir: (): string => {
    return os.tmpdir();
  },
});
