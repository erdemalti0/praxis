import { composeMissionPlannerPrompt } from "../mission/missionPlannerSkill";

/**
 * Wraps a user message with the mission planner prompt template.
 * Used when InputMode is "plan" to instruct the AI agent to generate
 * a structured JSON plan instead of a freeform response.
 */
export function wrapWithPlanPrompt(userMessage: string): string {
  return composeMissionPlannerPrompt(userMessage);
}

/**
 * Extract a JSON plan object from an AI agent's response text.
 * The response should contain a raw JSON object with `title` and `steps` fields.
 *
 * Returns the parsed plan object, or null if no valid plan was found.
 */
export function extractPlanJson(responseText: string): Record<string, unknown> | null {
  // Try to find a JSON object in the response
  // Look for the outermost { ... } pair
  const firstBrace = responseText.indexOf("{");
  const lastBrace = responseText.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const jsonCandidate = responseText.slice(firstBrace, lastBrace + 1);

  try {
    const parsed = JSON.parse(jsonCandidate);

    // Validate it has the required mission plan shape
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof parsed.title !== "string") return null;
    if (!Array.isArray(parsed.steps)) return null;

    return parsed;
  } catch {
    // Try stripping markdown code fences if present
    const fenced = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenced) {
      try {
        const fencedParsed = JSON.parse(fenced[1]);
        if (typeof fencedParsed === "object" && fencedParsed !== null && Array.isArray(fencedParsed.steps)) {
          return fencedParsed;
        }
      } catch {
        // Fall through
      }
    }
    return null;
  }
}

/**
 * Build a retry prompt when the initial plan response didn't contain valid JSON.
 * Sent as a follow-up message to get the agent to output pure JSON.
 */
export function buildRetryPrompt(failedResponse: string): string {
  return [
    "Your previous response did not contain valid JSON. Please output ONLY the mission plan as a raw JSON object.",
    "",
    "Requirements:",
    "- Start with { and end with }",
    "- No markdown code fences (no ```json)",
    "- No explanation text before or after",
    "- Must have 'title', 'description', 'steps' fields",
    "- Each step must have 'title', 'description', 'prompt', 'dependsOn', 'children'",
    "",
    `Previous response snippet (first 500 chars):`,
    failedResponse.slice(0, 500),
  ].join("\n");
}
