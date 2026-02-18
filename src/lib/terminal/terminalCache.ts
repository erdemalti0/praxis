import { Terminal } from "@xterm/xterm";
import type { ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { getTerminalThemeById, type TerminalThemeDefinition } from "./terminalThemes";

interface CachedTerminal {
  terminal: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
}

const cache = new Map<string, CachedTerminal>();

/** Current terminal theme — updated via updateAllTerminalThemes() */
let _currentTheme: ITheme = getTerminalThemeById("default-dark").theme;

/** Default scrollback for active (visible) terminals */
const SCROLLBACK_ACTIVE = 5000;
/** Reduced scrollback for background (offscreen) terminals — saves ~30MB per terminal */
const SCROLLBACK_BACKGROUND = 500;

export function getOrCreateTerminal(sessionId: string): CachedTerminal {
  const existing = cache.get(sessionId);
  if (existing) return existing;

  const terminal = new Terminal({
    fontFamily: "'JetBrains Mono', 'SF Mono', Monaco, Menlo, monospace",
    fontSize: 13,
    lineHeight: 1.4,
    theme: _currentTheme,
    cursorBlink: false,
    allowProposedApi: true,
    scrollback: SCROLLBACK_ACTIVE,
    fastScrollModifier: "alt",
    fastScrollSensitivity: 5,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);

  // Unicode 11 — fixes emoji and wide-character width issues
  const unicode11Addon = new Unicode11Addon();
  terminal.loadAddon(unicode11Addon);
  terminal.unicode.activeVersion = "11";

  const entry: CachedTerminal = { terminal, fitAddon, searchAddon };
  cache.set(sessionId, entry);
  return entry;
}

/**
 * Activate WebGL renderer after terminal is mounted to DOM.
 * Falls back silently to canvas/DOM if WebGL is unavailable.
 * Automatically recovers after GPU context loss.
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
      // Attempt recovery after a short delay
      setTimeout(() => activateWebGL(sessionId), 1000);
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

/**
 * Re-fit all cached terminals that are currently mounted in the DOM.
 * Used after layout changes (fullscreen toggle, sidebar toggle, etc.)
 * Only fits terminals whose element is actually connected to the document.
 * Deduplicated: multiple rapid calls collapse into a single refit.
 */
let refitPending = false;
let refitTimer: ReturnType<typeof setTimeout> | null = null;

export function refitAllTerminals(): void {
  if (refitPending) return;
  refitPending = true;

  // Cancel any lingering timer from a previous cycle
  if (refitTimer) clearTimeout(refitTimer);

  requestAnimationFrame(() => {
    refitTimer = setTimeout(() => {
      refitPending = false;
      refitTimer = null;
      for (const [, entry] of cache) {
        try {
          if (entry.terminal.element?.isConnected) {
            entry.fitAddon.fit();
          }
        } catch {}
      }
    }, 100);
  });
}

/**
 * Reduce scrollback for background terminals to save memory.
 * Call when a terminal becomes hidden (workspace switch, etc.)
 */
export function setBackgroundScrollback(sessionId: string): void {
  const entry = cache.get(sessionId);
  if (entry) {
    entry.terminal.options.scrollback = SCROLLBACK_BACKGROUND;
  }
}

/**
 * Restore full scrollback when a terminal becomes visible again.
 */
export function setActiveScrollback(sessionId: string): void {
  const entry = cache.get(sessionId);
  if (entry && entry.terminal.options.scrollback !== SCROLLBACK_ACTIVE) {
    entry.terminal.options.scrollback = SCROLLBACK_ACTIVE;
  }
}

/**
 * Update the theme for all cached terminals.
 * Called when the user changes the terminal theme in settings.
 */
export function updateAllTerminalThemes(themeId: string, customTerminalThemes: TerminalThemeDefinition[] = []): void {
  const def = getTerminalThemeById(themeId, customTerminalThemes);
  _currentTheme = def.theme;
  for (const [, entry] of cache) {
    entry.terminal.options.theme = _currentTheme;
  }
}
