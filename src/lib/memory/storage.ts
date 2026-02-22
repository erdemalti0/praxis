/**
 * Memory storage layer.
 * MemoryStorage interface + JsonMemoryStorage implementation.
 * Reuses persistence.ts patterns (loadJsonFile, saveJsonFile, .bak fallback).
 */

import { loadJsonFile, saveJsonFile } from "@/lib/persistence";
import { getProjectDataDir } from "@/lib/projectSlug";
import type {
  MemoryStore,
  IntegrityReport,
  SessionMemory,
  SessionMemorySummary,
} from "./types";
import { DEFAULT_FEATURE_FLAGS } from "./types";

// ─── Constants ────────────────────────────────────────────────────────

const CURRENT_VERSION = 1;
const MEMORY_DIR = "memory";
const PROJECT_FILE = "project.json";
const SESSIONS_DIR = "sessions";
const MAX_ENTRIES_GUARDRAIL = 3000;

// ─── Interface ────────────────────────────────────────────────────────

export interface MemoryStorage {
  loadProjectMemory(): MemoryStore;
  saveProjectMemory(store: MemoryStore): void;
  loadSessionMemory(sessionId: string): SessionMemory | null;
  saveSessionMemory(session: SessionMemory): void;
  listSessionMemories(): SessionMemorySummary[];
  validateIntegrity(): IntegrityReport;
}

// ─── Empty Store Factory ──────────────────────────────────────────────

export function createEmptyStore(): MemoryStore {
  return {
    version: 1,
    entries: [],
    aliases: {},
    conflicts: [],
    metadata: {
      createdAt: Date.now(),
      lastCompactedAt: 0,
      totalPromotions: 0,
      totalEvictions: 0,
      totalAccesses: 0,
      autoMemoryEnabled: true,
      configPreset: "balanced",
      featureFlags: { ...DEFAULT_FEATURE_FLAGS },
    },
  };
}

// ─── Schema Validation ───────────────────────────────────────────────

function validateMemoryStore(data: unknown): data is MemoryStore {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  if (obj.version !== CURRENT_VERSION) return false;
  if (!Array.isArray(obj.entries)) return false;
  if (typeof obj.metadata !== "object" || obj.metadata === null) return false;

  // Validate a sample of entries (check first 3)
  const entries = obj.entries as unknown[];
  for (let i = 0; i < Math.min(3, entries.length); i++) {
    const entry = entries[i] as Record<string, unknown>;
    if (!entry || typeof entry !== "object") return false;
    if (typeof entry.id !== "string") return false;
    if (typeof entry.content !== "string") return false;
    if (typeof entry.importance !== "number") return false;
  }

  return true;
}

function validateSessionMemory(data: unknown): data is SessionMemory {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  if (obj.version !== CURRENT_VERSION) return false;
  if (typeof obj.sessionId !== "string") return false;
  if (!Array.isArray(obj.findings)) return false;

  return true;
}

// ─── JSON Implementation ─────────────────────────────────────────────

export class JsonMemoryStorage implements MemoryStorage {
  private memoryDir: string;
  private projectFilePath: string;
  private sessionsDir: string;

  constructor(homeDir: string, projectPath: string) {
    const projectDataDir = getProjectDataDir(homeDir, projectPath);
    this.memoryDir = `${projectDataDir}/${MEMORY_DIR}`;
    this.projectFilePath = `${this.memoryDir}/${PROJECT_FILE}`;
    this.sessionsDir = `${this.memoryDir}/${SESSIONS_DIR}`;
  }

  get filePath(): string {
    return this.projectFilePath;
  }

  loadProjectMemory(): MemoryStore {
    const defaults = createEmptyStore();

    // Phase 4.1: Startup integrity check
    const integrityReport = this.validateIntegrity();
    if (!integrityReport.valid && integrityReport.errors.length > 0) {
      console.warn("[memory] Integrity issues:", integrityReport.errors);
      if (integrityReport.recoveredFromBackup) {
        console.warn("[memory] Recovered from backup");
      }
    }

    try {
      const loaded = loadJsonFile<MemoryStore>(this.projectFilePath, defaults);

      // Version check + migration
      if (loaded.version !== CURRENT_VERSION) {
        console.warn(`[memory] Version ${loaded.version}, migrating to ${CURRENT_VERSION}...`);
        return this.migrate(loaded as unknown as Record<string, unknown>);
      }

      // Schema validation
      if (!validateMemoryStore(loaded)) {
        console.warn("[memory] Schema validation failed, loading backup...");
        return this.loadFallback();
      }

      // Guardrail: trim if over limit
      if (loaded.entries.length > MAX_ENTRIES_GUARDRAIL) {
        console.warn(`[memory] ${loaded.entries.length} entries exceed guardrail (${MAX_ENTRIES_GUARDRAIL}), trimming...`);
        loaded.entries = loaded.entries
          .sort((a, b) => b.importance - a.importance)
          .slice(0, MAX_ENTRIES_GUARDRAIL);
      }

      return loaded;
    } catch (err) {
      console.error("[memory] Failed to load project memory:", err);
      return this.loadFallback();
    }
  }

  saveProjectMemory(store: MemoryStore): void {
    try {
      saveJsonFile(this.projectFilePath, JSON.parse(JSON.stringify(store)));
    } catch (err) {
      console.error("[memory] Failed to save project memory:", err);
    }
  }

  loadSessionMemory(sessionId: string): SessionMemory | null {
    const filePath = `${this.sessionsDir}/${sessionId}.memory.json`;
    try {
      if (!window.electronAPI?.fileExists?.(filePath)) return null;
      const raw = window.electronAPI.readFileSync(filePath);
      const data = JSON.parse(raw);
      if (!validateSessionMemory(data)) return null;
      return data as SessionMemory;
    } catch {
      return null;
    }
  }

  saveSessionMemory(session: SessionMemory): void {
    const filePath = `${this.sessionsDir}/${session.sessionId}.memory.json`;
    try {
      saveJsonFile(filePath, JSON.parse(JSON.stringify(session)));
    } catch (err) {
      console.error("[memory] Failed to save session memory:", err);
    }
  }

  listSessionMemories(): SessionMemorySummary[] {
    try {
      if (!window.electronAPI?.fileExists?.(this.sessionsDir)) return [];

      // List files via a simple approach — read dir entries
      // Since we don't have readdir in preload, we'll need to use IPC or track sessions ourselves
      // For Phase 1, we'll keep this simple and return empty
      // Session memories will be tracked in the store
      return [];
    } catch {
      return [];
    }
  }

  validateIntegrity(): IntegrityReport {
    const errors: string[] = [];
    let recoveredFromBackup = false;
    let entryCount = 0;

    try {
      if (!window.electronAPI?.fileExists?.(this.projectFilePath)) {
        return { valid: true, entryCount: 0, errors: [], recoveredFromBackup: false };
      }

      const raw = window.electronAPI.readFileSync(this.projectFilePath);
      let data: unknown;

      try {
        data = JSON.parse(raw);
      } catch {
        errors.push("JSON parse failed on primary file");

        // Try backup
        const bakPath = `${this.projectFilePath}.bak`;
        if (window.electronAPI.fileExists(bakPath)) {
          try {
            const bakRaw = window.electronAPI.readFileSync(bakPath);
            data = JSON.parse(bakRaw);
            recoveredFromBackup = true;
          } catch {
            errors.push("JSON parse also failed on backup file");
          }
        }
      }

      if (data) {
        if (!validateMemoryStore(data)) {
          errors.push("Schema validation failed");
        } else {
          entryCount = (data as MemoryStore).entries.length;

          // Check for entries with missing required fields
          for (const entry of (data as MemoryStore).entries) {
            if (!entry.id || !entry.content || !entry.fingerprint) {
              errors.push(`Entry missing required fields: ${entry.id || "unknown"}`);
            }
          }
        }
      }
    } catch (err) {
      errors.push(`Unexpected error: ${err}`);
    }

    return {
      valid: errors.length === 0,
      entryCount,
      errors,
      recoveredFromBackup,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────

  private loadFallback(): MemoryStore {
    const bakPath = `${this.projectFilePath}.bak`;
    try {
      if (window.electronAPI?.fileExists?.(bakPath)) {
        const raw = window.electronAPI.readFileSync(bakPath);
        const data = JSON.parse(raw);
        if (validateMemoryStore(data)) {
          console.warn("[memory] Recovered from backup file");
          return data;
        }
      }
    } catch {
      // Backup also failed
    }

    console.warn("[memory] Both primary and backup failed, starting fresh");
    return createEmptyStore();
  }

  private migrate(data: Record<string, unknown>): MemoryStore {
    return migrateStore(data);
  }
}

// ─── Schema Migration Framework ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Migrator = (data: any) => any;

const MIGRATIONS: Record<number, Migrator> = {
  // Version 1 → 2: Add conflicts array (when CURRENT_VERSION bumps to 2)
  // 1: (data) => ({
  //   ...data,
  //   version: 2,
  //   conflicts: data.conflicts || [],
  // }),
};

function migrateStore(data: Record<string, unknown>): MemoryStore {
  let current = data;
  let version = (current.version as number) || 1;

  while (version < CURRENT_VERSION) {
    const migrator = MIGRATIONS[version];
    if (!migrator) {
      console.warn(`[memory] No migration for version ${version}, starting fresh`);
      return createEmptyStore();
    }
    current = migrator(current);
    version++;
  }

  // Validate after migration
  if (!validateMemoryStore(current)) {
    console.warn("[memory] Post-migration validation failed, starting fresh");
    return createEmptyStore();
  }

  return current as unknown as MemoryStore;
}
