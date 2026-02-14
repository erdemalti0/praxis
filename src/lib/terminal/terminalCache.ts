import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";

interface CachedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
}

const cache = new Map<string, CachedTerminal>();

const TERMINAL_THEME = {
  background: "#000000",
  foreground: "#e0e0e0",
  cursor: "#ffffff",
  cursorAccent: "#000000",
  selectionBackground: "#333333",
  black: "#333333",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#a0a0a0",
  magenta: "#a78bfa",
  cyan: "#67e8f9",
  white: "#d4d4d4",
  brightBlack: "#525252",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde68a",
  brightBlue: "#d4d4d4",
  brightMagenta: "#c4b5fd",
  brightCyan: "#a5f3fc",
  brightWhite: "#ffffff",
};

export function getOrCreateTerminal(sessionId: string): CachedTerminal {
  const existing = cache.get(sessionId);
  if (existing) return existing;

  const terminal = new Terminal({
    fontFamily: "'JetBrains Mono', 'SF Mono', Monaco, Menlo, monospace",
    fontSize: 13,
    lineHeight: 1.4,
    theme: TERMINAL_THEME,
    cursorBlink: false,
    allowProposedApi: true,
    scrollback: 2000,
    fastScrollModifier: "alt",
    fastScrollSensitivity: 5,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);

  const entry: CachedTerminal = { terminal, fitAddon, searchAddon };
  cache.set(sessionId, entry);
  return entry;
}

/**
 * Activate WebGL renderer after terminal is mounted to DOM.
 * Falls back silently to canvas/DOM if WebGL is unavailable.
 */
export function activateWebGL(sessionId: string): void {
  const entry = cache.get(sessionId);
  if (!entry) return;
  // Only attach once
  if ((entry.terminal as any).__webgl) return;
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      webgl.dispose();
      (entry.terminal as any).__webgl = false;
    });
    entry.terminal.loadAddon(webgl);
    (entry.terminal as any).__webgl = true;
  } catch {
    // WebGL not available — canvas/DOM renderer used automatically
  }
}

export function getCachedTerminal(sessionId: string): CachedTerminal | undefined {
  return cache.get(sessionId);
}

/**
 * Full cleanup: run PTY listener cleanup, dispose xterm, remove from cache.
 */
export function cleanupTerminal(sessionId: string): void {
  const entry = cache.get(sessionId);
  if (entry) {
    const ptyKey = `__pty_${sessionId}`;
    const cleanupFn = (entry.terminal as any)[`${ptyKey}_cleanup`];
    if (typeof cleanupFn === "function") {
      cleanupFn();
    }
    entry.terminal.dispose();
    cache.delete(sessionId);
  }
}

export function disposeTerminal(sessionId: string): void {
  cleanupTerminal(sessionId);
}

export function hasCachedTerminal(sessionId: string): boolean {
  return cache.has(sessionId);
}
