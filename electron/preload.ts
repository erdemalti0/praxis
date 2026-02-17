import { contextBridge, ipcRenderer } from "electron";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Security: Sensitive paths that are always blocked from renderer access.
 * Prevents accidental or malicious reads/writes to credential stores.
 */
const BLOCKED_PREFIXES = [
  path.join(os.homedir(), ".ssh"),
  path.join(os.homedir(), ".gnupg"),
  path.join(os.homedir(), ".aws"),
  path.join(os.homedir(), ".kube"),
];

function isBlockedPath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return BLOCKED_PREFIXES.some((blocked) => resolved.startsWith(blocked));
}

/**
 * Validates that a write path is within allowed directories.
 * Permits writes under home directory and temp dir, but blocks sensitive paths.
 */
function isAllowedWritePath(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  if (isBlockedPath(resolved)) return false;
  return resolved.startsWith(os.homedir()) || resolved.startsWith(os.tmpdir());
}

/**
 * Validates that a read path is safe.
 * Blocks access to sensitive credential stores (.ssh, .gnupg, .aws, .kube).
 */
function isAllowedReadPath(filePath: string): boolean {
  return !isBlockedPath(filePath);
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
    ipcRenderer.send(channel, ...args);
  },
  // Direct filesystem access (bypasses IPC) — restricted to allowed paths
  readFileSync: (filePath: string): string => {
    if (!isAllowedReadPath(filePath)) {
      console.warn(`[preload] Read rejected — path not allowed: ${filePath}`);
      throw new Error(`Read access denied: ${filePath}`);
    }
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
