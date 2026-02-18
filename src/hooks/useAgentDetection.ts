/**
 * Polls PTY child processes to detect when a user launches an agent
 * (e.g. `claude`, `aider`) from inside a shell terminal session.
 *
 * When detected, dynamically updates the session's `agentType` so the UI
 * (AgentMonitorWidget, AgentCard, sidebar) reflects the actual running agent.
 * When the agent exits, the session reverts to "shell".
 */
import { useEffect, useRef } from "react";
import { useTerminalStore } from "../stores/terminalStore";
import { invoke } from "../lib/ipc";
import { getAgentConfig } from "../lib/agentTypes";

const POLL_INTERVAL = 3000; // 3 seconds

export function useAgentDetection() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      const { sessions, updateSession } = useTerminalStore.getState();

      // Collect shell-originated sessions that have a known PID.
      // A session is shell-originated if:
      //   - originalAgentType === "shell", OR
      //   - originalAgentType is unset AND current agentType is "shell" (legacy sessions)
      const shellSessions = sessions.filter(
        (s) =>
          s.pid &&
          s.isActive &&
          (s.originalAgentType === "shell" ||
            (!s.originalAgentType && s.agentType === "shell"))
      );

      if (shellSessions.length === 0) return;

      // Build pid map: { sessionId: ptyPid }
      const pids: Record<string, number> = {};
      for (const s of shellSessions) {
        if (s.pid) pids[s.id] = s.pid;
      }

      try {
        const detected = await invoke<Record<string, string | null>>(
          "detect_pty_children",
          { pids }
        );

        for (const s of shellSessions) {
          const detectedType = detected[s.id];
          const currentType = s.agentType;

          if (detectedType && detectedType !== "shell" && currentType !== detectedType) {
            // Agent detected inside shell — update session type and title
            const config = getAgentConfig(detectedType);
            const dirName = s.projectPath?.split("/").pop() || s.projectPath || "";
            updateSession(s.id, {
              agentType: detectedType,
              title: `${config.label}@${dirName}`,
            });
          } else if (!detectedType && currentType !== "shell") {
            // Agent exited — revert to shell
            const dirName = s.projectPath?.split("/").pop() || s.projectPath || "";
            updateSession(s.id, {
              agentType: "shell",
              title: `Shell@${dirName}`,
            });
          }
        }
      } catch {
        // Silently ignore detection failures — will retry next poll
      }
    };

    // Run immediately, then poll
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // No deps — reads store directly via getState()
}
