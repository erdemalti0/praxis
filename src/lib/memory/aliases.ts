/**
 * Alias / synonym expansion for memory search.
 * Improves recall by broadening queries to cover related terms.
 */

export const DEFAULT_ALIASES: Record<string, string[]> = {
  // Authentication & authorization
  auth: ["authentication", "authorization", "login", "logout", "session", "jwt", "token", "oauth", "sso"],
  // Database
  db: ["database", "postgres", "postgresql", "mysql", "sqlite", "sql", "query", "migration", "schema", "table"],
  // API / HTTP
  api: ["endpoint", "route", "handler", "rest", "graphql", "middleware", "request", "response"],
  // Frontend
  ui: ["frontend", "component", "react", "layout", "style", "css", "html", "render", "dom"],
  // Testing
  test: ["testing", "unit test", "integration test", "e2e", "vitest", "jest", "mock", "assertion", "spec"],
  // Error handling
  err: ["error", "exception", "catch", "throw", "bug", "crash", "failure", "issue"],
  // Configuration
  config: ["configuration", "settings", "env", "environment", "dotenv", "options"],
  // State management
  state: ["store", "zustand", "redux", "context", "provider", "reducer"],
  // Build / deploy
  build: ["compile", "bundle", "webpack", "vite", "deploy", "ci", "cd", "pipeline"],
  // Security
  security: ["vulnerability", "xss", "injection", "csrf", "cors", "sanitize", "encrypt", "decrypt"],
  // Performance
  perf: ["performance", "optimization", "latency", "throughput", "cache", "memoize", "debounce"],
  // TypeScript
  ts: ["typescript", "type", "interface", "generic", "enum"],
};

/**
 * Expand a search query by appending synonyms for any matching alias keys.
 * Original query is preserved and synonyms are appended.
 */
export function expandQuery(query: string, aliases: Record<string, string[]>): string {
  const lowerQuery = query.toLowerCase();
  const expansions: string[] = [];

  for (const [key, synonyms] of Object.entries(aliases)) {
    // Check if the alias key appears as a word boundary in the query
    const keyRegex = new RegExp(`\\b${escapeRegex(key)}\\b`, "i");
    if (keyRegex.test(lowerQuery)) {
      // Add synonyms that aren't already in the query
      for (const syn of synonyms) {
        if (!lowerQuery.includes(syn.toLowerCase())) {
          expansions.push(syn);
        }
      }
    }
  }

  if (expansions.length === 0) return query;
  return `${query} ${expansions.join(" ")}`;
}

/**
 * Merge user-defined aliases with defaults.
 * User aliases override defaults for the same key.
 */
export function mergeAliases(
  base: Record<string, string[]>,
  overrides: Record<string, string[]>,
): Record<string, string[]> {
  const merged = { ...base };
  for (const [key, values] of Object.entries(overrides)) {
    const existing = merged[key] || [];
    const combined = new Set([...existing, ...values]);
    merged[key] = [...combined];
  }
  return merged;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
