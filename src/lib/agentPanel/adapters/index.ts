import type { ChatAgentId } from "../../../types/agentPanel";
import type { AgentAdapter, AgentPermissionMode } from "./base";
import { ClaudeCodeAdapter } from "./claudeCodeAdapter";
import { CodexAdapter } from "./codexAdapter";
import { GeminiAdapter } from "./geminiAdapter";
import { OpenCodeAdapter } from "./openCodeAdapter";

export function createAdapter(agentId: ChatAgentId, permissionMode: AgentPermissionMode = "auto-accept"): AgentAdapter {
  switch (agentId) {
    case "claude-code":
      return new ClaudeCodeAdapter(permissionMode);
    case "codex":
      return new CodexAdapter(permissionMode);
    case "gemini":
      return new GeminiAdapter(permissionMode);
    case "opencode":
      return new OpenCodeAdapter(permissionMode);
  }
}
