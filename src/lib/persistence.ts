/**
 * Shared persistence utilities for Zustand stores.
 * Uses electronAPI.readFileSync / writeFileSync from preload.
 */

type AnyObject = Record<string, any>;

/**
 * Read a JSON file and return parsed data merged with defaults.
 * Returns defaults if file doesn't exist or is corrupt.
 */
export function loadJsonFile<T extends AnyObject>(filePath: string, defaults: T): T {
  try {
    if (window.electronAPI?.fileExists?.(filePath)) {
      const raw = window.electronAPI.readFileSync(filePath);
      return { ...defaults, ...JSON.parse(raw) };
    }
  } catch {
    // Primary file corrupt or unreadable — try backup
    try {
      const bakPath = `${filePath}.bak`;
      if (window.electronAPI?.fileExists?.(bakPath)) {
        console.warn(`[persistence] Primary file corrupt, loading backup: ${bakPath}`);
        const raw = window.electronAPI.readFileSync(bakPath);
        return { ...defaults, ...JSON.parse(raw) };
      }
    } catch {
      // Backup also failed — fall through to defaults
    }
  }
  return { ...defaults };
}

/**
 * Write data as JSON to a file (sync, auto-creates parent dirs).
 */
export function saveJsonFile(filePath: string, data: AnyObject): void {
  try {
    // Backup existing file before overwriting
    if (window.electronAPI.fileExists(filePath)) {
      try {
        const existing = window.electronAPI.readFileSync(filePath);
        window.electronAPI.writeFileSync(`${filePath}.bak`, existing);
      } catch {
        // Backup failure should never block saving
      }
    }
    window.electronAPI.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[persistence] Failed to save ${filePath}:`, err);
  }
}

/**
 * Creates a debounced save function.
 * When called with (filePath, data), it waits `delay` ms of inactivity before writing.
 */
export function createDebouncedSaver(delay: number = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return function save(filePath: string, data: AnyObject): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saveJsonFile(filePath, data);
    }, delay);
  };
}

/**
 * Subscribe to a Zustand store and auto-save selected keys when they change.
 * Returns an unsubscribe function.
 *
 * @param store - Zustand store with subscribe() and getState()
 * @param keys - State keys to watch and persist
 * @param getPath - Function that returns file path from current state, or null to skip
 * @param delay - Debounce delay in ms (default 500)
 */
export function autoSave<T extends AnyObject>(
  store: {
    subscribe: (listener: (state: T, prev: T) => void) => () => void;
    getState: () => T;
  },
  keys: (keyof T)[],
  getPath: () => string | null,
  delay: number = 500,
): () => void {
  const saver = createDebouncedSaver(delay);

  return store.subscribe((state, prev) => {
    // Only save if one of the watched keys actually changed (shallow)
    const changed = keys.some((k) => state[k] !== prev[k]);
    if (!changed) return;

    const filePath = getPath();
    if (!filePath) return;

    const data: AnyObject = {};
    for (const k of keys) {
      data[k as string] = state[k];
    }
    saver(filePath, data);
  });
}
