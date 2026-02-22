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

// ── IPC Channel Allowlists ──
// Only channels listed here can be called from the renderer.
// Dead handlers (proxy_anthropic_request, has_extraction_credentials, list_recent_projects) are
// intentionally excluded.
const ALLOWED_INVOKE_CHANNELS: ReadonlySet<string> = new Set([
  // sessions.ts
  "get_home_dir", "read_history",
  // git.ts
  "set_project_path", "git_status", "git_diff", "run_quick_command",
  "git_clone_repo", "git_branches", "read_package_scripts", "read_env_file",
  "git_last_commit", "list_images",
  // filesystem.ts
  "read_file", "write_file", "editor_read_file", "editor_write_file",
  "glob_files", "open_path", "read_package_json", "delete_file", "list_directory",
  // terminal.ts
  "spawn_pty", "write_pty", "resize_pty", "pty_pause", "pty_resume", "close_pty",
  // runner.ts
  "load_run_configs", "save_run_configs", "get_child_pids", "detect_emulators",
  // tasks.ts
  "load_tasks", "save_tasks",
  // missions.ts
  "load_missions", "save_missions",
  // search.ts
  "search_files",
  // usage.ts
  "fetch_usage",
  // models.ts
  "discover_agent_models",
  // agents.ts
  "detect_running_agents",
  // ports.ts
  "scan_ports", "kill_process", "kill_port", "get_system_stats",
  // browser.ts
  "detect_browsers", "load_favorites", "save_favorites",
  // stats.ts
  "read_stats",
  // passwords.ts
  "get_credentials", "delete_credential", "update_credential", "has_credentials_for_url",
  // main.ts
  "get_default_shell", "get_platform", "set_window_project",
  "open_external", "open_popup_window",
  "install_cli", "uninstall_cli", "check_cli_installed",
  "get_system_theme", "update_titlebar_overlay",
  "rebuild_menu", "open_directory_dialog",
]);

// Channels the renderer listens on (main → renderer via webContents.send).
// Some use dynamic suffixes (pty-output-{id}, pty-exit-{id}, menu:*).
const ALLOWED_ON_CHANNEL_PREFIXES: readonly string[] = [
  "menu:",
  "pty-output-",
  "pty-exit-",
];
const ALLOWED_ON_CHANNELS_EXACT: ReadonlySet<string> = new Set([
  "system-theme-changed",
  "open-project",
  "history-updated",
  "stats-updated",
  "file-changed",
  "file-created",
  "file-deleted",
]);

// Channels the renderer sends fire-and-forget (via ipcMain.on, not .handle).
const ALLOWED_SEND_CHANNELS: ReadonlySet<string> = new Set([
  "write_pty", "resize_pty", "pty_pause", "pty_resume",
]);

function isAllowedOnChannel(channel: string): boolean {
  if (ALLOWED_ON_CHANNELS_EXACT.has(channel)) return true;
  return ALLOWED_ON_CHANNEL_PREFIXES.some(prefix => channel.startsWith(prefix));
}

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (channel: string, ...args: any[]) => {
    if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked invoke on disallowed channel: ${channel}`);
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel: string, callback: (...args: any[]) => void) => {
    if (!isAllowedOnChannel(channel)) {
      console.warn(`[preload] Blocked listener on disallowed channel: ${channel}`);
      return () => {};
    }
    const listener = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    if (!isAllowedOnChannel(channel)) return;
    ipcRenderer.removeListener(channel, callback);
  },
  send: (channel: string, ...args: any[]) => {
    if (!ALLOWED_SEND_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked send on disallowed channel: ${channel}`);
      return;
    }
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
    if (isBlockedPath(filePath)) return false;
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
