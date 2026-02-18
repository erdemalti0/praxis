/**
 * Cross-platform path utilities for the renderer process.
 * Handles both Unix (/) and Windows (\) path separators.
 */

/** Split a path into segments, handling both / and \ separators */
export function splitPath(p: string): string[] {
  return p.split(/[/\\]/).filter(Boolean);
}

/** Get the last segment of a path (filename or directory name) */
export function getBaseName(p: string): string {
  return splitPath(p).pop() || p;
}

/** Get the parent directory of a path */
export function getParentPath(p: string): string {
  const sep = p.includes("\\") ? "\\" : "/";
  const segments = p.split(/[/\\]/);
  // Keep empty first segment for absolute Unix paths (starts with /)
  // Keep drive letter for Windows paths (e.g., C:)
  segments.pop();
  if (segments.length === 0) return p;
  // Handle Windows root "C:\" - don't return just "C:"
  if (segments.length === 1 && segments[0].match(/^[A-Za-z]:$/)) {
    return segments[0] + sep;
  }
  return segments.join(sep) || sep;
}

/** Truncate a long path for display: .../last/three/segments */
export function truncatePath(fullPath: string, maxSegments = 3): string {
  const sep = fullPath.includes("\\") ? "\\" : "/";
  const segments = splitPath(fullPath);
  if (segments.length <= maxSegments) return fullPath;
  return "..." + sep + segments.slice(-maxSegments).join(sep);
}
