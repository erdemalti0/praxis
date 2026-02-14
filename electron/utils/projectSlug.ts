/**
 * Convert a project path to a safe directory name for use in ~/.praxis/projects/.
 * Example: "/Users/erdem/Desktop/my-project" → "Users-erdem-Desktop-my-project"
 */
export function projectSlug(projectPath: string): string {
  return projectPath
    .replace(/^\//, "")        // remove leading slash
    .replace(/\\/g, "-")       // backslash → dash (Windows)
    .replace(/\//g, "-")       // forward slash → dash
    .replace(/:/g, "")         // remove colons (Windows drive letters)
    .replace(/\s+/g, "_")     // spaces → underscore
    .replace(/[^a-zA-Z0-9._-]/g, "_"); // other special chars → underscore
}
