import { getProjectDataDir } from "../projectSlug";
import { saveJsonFile } from "../persistence";
import type { PersistedSession, SessionSummary } from "../../types/agentSession";
import type { ChatAgentId } from "../../types/agentPanel";

function getSessionsDir(homeDir: string, projectPath: string): string {
  return `${getProjectDataDir(homeDir, projectPath)}/agent-sessions`;
}

function getSessionFilePath(homeDir: string, projectPath: string, sessionId: string): string {
  return `${getSessionsDir(homeDir, projectPath)}/${sessionId}.json`;
}

/**
 * List all sessions from disk, returning lightweight summaries sorted by updatedAt DESC.
 */
export async function listSessions(
  homeDir: string,
  projectPath: string,
): Promise<SessionSummary[]> {
  const dir = getSessionsDir(homeDir, projectPath);

  // Check if directory exists
  if (!window.electronAPI.fileExists(dir)) return [];

  let entries: Array<{ name: string; path: string; isDir: boolean; size: number; modified: number }>;
  try {
    entries = await window.electronAPI.invoke("list_directory", { path: dir });
  } catch {
    return [];
  }

  const summaries: SessionSummary[] = [];

  for (const entry of entries) {
    if (entry.isDir || !entry.name.endsWith(".json") || entry.name.endsWith(".bak")) continue;

    try {
      const raw = window.electronAPI.readFileSync(entry.path);
      const session: PersistedSession = JSON.parse(raw);

      const agentsUsed = new Set<ChatAgentId>();
      let messageCount = 0;
      let totalCost = 0;

      for (const [agentId, data] of Object.entries(session.agentMessages)) {
        if (!data) continue;
        agentsUsed.add(agentId as ChatAgentId);
        messageCount += data.messages.length;
        totalCost += data.totalCost;
      }

      summaries.push({
        id: session.id,
        name: session.name,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount,
        totalCost,
        agentsUsed: [...agentsUsed],
      });
    } catch {
      // Skip corrupt session files
    }
  }

  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return summaries;
}

/**
 * Load a full session from disk.
 */
export function loadSession(
  homeDir: string,
  projectPath: string,
  sessionId: string,
): PersistedSession | null {
  const filePath = getSessionFilePath(homeDir, projectPath, sessionId);
  if (!window.electronAPI.fileExists(filePath)) return null;

  try {
    const raw = window.electronAPI.readFileSync(filePath);
    return JSON.parse(raw) as PersistedSession;
  } catch {
    // Try backup
    try {
      const bakPath = `${filePath}.bak`;
      if (window.electronAPI.fileExists(bakPath)) {
        const raw = window.electronAPI.readFileSync(bakPath);
        return JSON.parse(raw) as PersistedSession;
      }
    } catch {
      // Both failed
    }
    return null;
  }
}

/**
 * Save a session to disk (creates parent dirs automatically via writeFileSync).
 */
export function saveSession(
  homeDir: string,
  projectPath: string,
  session: PersistedSession,
): void {
  const filePath = getSessionFilePath(homeDir, projectPath, session.id);
  saveJsonFile(filePath, session as unknown as Record<string, unknown>);
}

/**
 * Delete a session from disk.
 */
export async function deleteSession(
  homeDir: string,
  projectPath: string,
  sessionId: string,
): Promise<void> {
  const filePath = getSessionFilePath(homeDir, projectPath, sessionId);
  try {
    await window.electronAPI.invoke("delete_file", { path: filePath });
  } catch {
    // File may not exist
  }
  // Also try to delete backup
  try {
    await window.electronAPI.invoke("delete_file", { path: `${filePath}.bak` });
  } catch {
    // Ignore
  }
}
