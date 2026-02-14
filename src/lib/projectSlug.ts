/**
 * Convert a project path to a safe directory name for use in ~/.praxis/projects/.
 * Example: "/Users/erdem/Desktop/my-project" → "Users-erdem-Desktop-my-project"
 */
export function projectSlug(projectPath: string): string {
  return projectPath
    .replace(/^\//, "")
    .replace(/\\/g, "-")
    .replace(/\//g, "-")
    .replace(/:/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Get the data directory path for a project under ~/.praxis/projects/{slug}/
 */
export function getProjectDataDir(homeDir: string, projectPath: string): string {
  return `${homeDir}/.praxis/projects/${projectSlug(projectPath)}`;
}
