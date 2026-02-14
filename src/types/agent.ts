export type AgentType = string;
export type AgentStatus = "active" | "idle" | "stopped" | "error";

export interface Agent {
  id: string;
  pid: number;
  type: AgentType;
  status: AgentStatus;
  projectPath: string;
  projectName: string;
  sessionId?: string;
  lastActivity?: number;
  model?: string;
  cwd: string;
}

export interface AgentGroup {
  projectPath: string;
  projectName: string;
  agents: Agent[];
}
