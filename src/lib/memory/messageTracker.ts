/**
 * Per-message pointer tracking for memory system.
 * Ultra-minimal pointers (~50 bytes each) tracking message content
 * for session-end reconciliation against extracted findings.
 */

import type { MemoryCategory, MessagePointer } from "./types";

// ─── Category Hint Detection ─────────────────────────────────────────

function detectCategoryHint(content: string): MemoryCategory | null {
  const lower = content.toLowerCase();
  if (lower.includes("error") || lower.includes("fix") || lower.includes("bug")) return "error";
  if (lower.includes("decided") || lower.includes("chose") || lower.includes("use ")) return "decision";
  if (lower.includes("created") || lower.includes("modified") || lower.includes("file")) return "file_change";
  if (lower.includes("architecture") || lower.includes("design") || lower.includes("pattern")) return "architecture";
  if (lower.includes("warning") || lower.includes("never") || lower.includes("avoid")) return "warning";
  return null;
}

// ─── Content Hash ────────────────────────────────────────────────────

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(content.length, 200); i++) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(8, "0").slice(0, 8);
}

// ─── Message Tracker ─────────────────────────────────────────────────

export class MessageTracker {
  private pointers: MessagePointer[] = [];

  addPointer(messageId: string, content: string): void {
    const pointer: MessagePointer = {
      messageId,
      contentHash: hashContent(content),
      categoryHint: detectCategoryHint(content),
      timestamp: Date.now(),
    };
    this.pointers.push(pointer);
  }

  getPointers(): MessagePointer[] {
    return [...this.pointers];
  }

  getPointerCount(): number {
    return this.pointers.length;
  }

  clear(): void {
    this.pointers = [];
  }
}
