export interface ProjectInfo {
  name: string;
  path: string;
  lastModified: number;
}

export interface HistoryEntry {
  type: "human" | "assistant" | "system";
  display?: string;
  timestamp: number;
  project?: string;
  sessionId: string;
  model?: string;
  costUsd?: number;
  tokensIn?: number;
  tokensOut?: number;
}

export interface TeamMember {
  name: string;
  agentId: string;
  agentType: string;
  model?: string;
}

export interface TeamConfig {
  teamName: string;
  description?: string;
  members: TeamMember[];
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number;
}

export interface TaskItem {
  id: string;
  subject: string;
  description?: string;
  status: "pending" | "in_progress" | "completed";
  owner?: string;
  blockedBy?: string[];
  blocks?: string[];
}

export type TaskStatus = "todo" | "in_progress" | "done";

export interface PraxisTask {
  id: string;
  title: string;
  description: string;
  prompt?: string;
  status: TaskStatus;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}
