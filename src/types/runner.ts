export interface RunConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  autoRestart?: boolean;
  icon?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export type RunnerStatus = "idle" | "running" | "stopped" | "error";

export interface RunnerInstance {
  configId: string;
  sessionId: string;
  pid?: number;
  status: RunnerStatus;
  ports: number[];
  startedAt: number;
  exitCode?: number;
}

export interface EmulatorInfo {
  id: string;
  name: string;
  platform: "android" | "ios";
  status: string;
}
