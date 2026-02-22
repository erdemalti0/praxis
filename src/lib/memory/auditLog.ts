/**
 * Append-only audit log for memory operations.
 * Records all memory mutations for debugging and compliance.
 */

import { saveJsonFile, loadJsonFile } from "@/lib/persistence";

// ─── Types ───────────────────────────────────────────────────────────

export type AuditAction =
  | "add"
  | "remove"
  | "update"
  | "promote"
  | "evict"
  | "pin"
  | "unpin"
  | "compact"
  | "finalize"
  | "inject";

export type AuditSource = "user" | "auto" | "system";

export interface AuditEvent {
  timestamp: number;
  action: AuditAction;
  entryId: string;
  details: string;
  source: AuditSource;
}

interface AuditLogData {
  events: AuditEvent[];
  createdAt: number;
}

// ─── Constants ───────────────────────────────────────────────────────

const MAX_EVENTS = 5000; // trim when exceeded
const TRIM_TO = 4000;    // keep most recent N

// ─── Audit Logger ────────────────────────────────────────────────────

export class AuditLogger {
  private logPath: string;
  private events: AuditEvent[] = [];
  private loaded = false;

  constructor(memoryDir: string) {
    this.logPath = `${memoryDir}/audit.json`;
  }

  /**
   * Log an audit event.
   */
  log(event: Omit<AuditEvent, "timestamp">): void {
    this.ensureLoaded();

    const fullEvent: AuditEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.events.push(fullEvent);

    // Trim if over limit
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-TRIM_TO);
    }

    this.save();
  }

  /**
   * Get the most recent N events.
   */
  getRecent(limit: number = 20): AuditEvent[] {
    this.ensureLoaded();
    return this.events.slice(-limit);
  }

  /**
   * Get events for a specific entry.
   */
  getForEntry(entryId: string, limit: number = 10): AuditEvent[] {
    this.ensureLoaded();
    return this.events
      .filter((e) => e.entryId === entryId)
      .slice(-limit);
  }

  /**
   * Get events by action type.
   */
  getByAction(action: AuditAction, limit: number = 20): AuditEvent[] {
    this.ensureLoaded();
    return this.events
      .filter((e) => e.action === action)
      .slice(-limit);
  }

  /**
   * Get total event count.
   */
  getCount(): number {
    this.ensureLoaded();
    return this.events.length;
  }

  // ─── Private ──────────────────────────────────────────────────────

  private ensureLoaded(): void {
    if (this.loaded) return;

    try {
      const data = loadJsonFile<AuditLogData>(this.logPath, {
        events: [],
        createdAt: Date.now(),
      });
      this.events = data.events || [];
    } catch {
      this.events = [];
    }

    this.loaded = true;
  }

  private save(): void {
    try {
      const data: AuditLogData = {
        events: this.events,
        createdAt: Date.now(),
      };
      saveJsonFile(this.logPath, data as unknown as Record<string, unknown>);
    } catch (err) {
      console.warn("[memory] Failed to save audit log:", err);
    }
  }
}
