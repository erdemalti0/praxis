export type MissionStepStatus = "pending" | "in_progress" | "done" | "blocked";

export interface MissionStep {
  id: string;
  missionId: string;
  title: string;
  description: string;
  prompt?: string;
  status: MissionStepStatus;
  parentId: string | null;
  children: string[];
  dependencies: string[];
  position: { x: number; y: number };
  createdAt: number;
  updatedAt: number;
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  steps: MissionStep[];
  createdAt: number;
  updatedAt: number;
}
