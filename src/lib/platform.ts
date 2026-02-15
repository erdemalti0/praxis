import { invoke } from "./ipc";

let cachedPlatform: string | null = null;
let cachedDefaultShell: string | null = null;

export async function getPlatform(): Promise<string> {
  if (cachedPlatform) return cachedPlatform;
  cachedPlatform = await invoke<string>("get_platform");
  return cachedPlatform;
}

export async function getDefaultShell(): Promise<string> {
  if (cachedDefaultShell) return cachedDefaultShell;
  cachedDefaultShell = await invoke<string>("get_default_shell");
  return cachedDefaultShell;
}

export function isMac(): boolean {
  return cachedPlatform === "darwin";
}

/** Returns the modifier key label for the current platform ("Cmd" on macOS, "Ctrl" elsewhere) */
export function modKey(): string {
  return cachedPlatform === "darwin" ? "Cmd" : "Ctrl";
}

// Eagerly fetch platform on module load so it's ready for synchronous access
getPlatform();
