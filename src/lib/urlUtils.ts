/**
 * Parse user input into a URL or search query.
 * Handles: full URLs, localhost, bare IPs, domain-like strings.
 */
export function parseUrlOrSearch(input: string): string {
  const q = input.trim();
  if (!q) return "";

  // Already a full URL
  if (/^https?:\/\//i.test(q)) return q;
  if (/^file:\/\//i.test(q)) return q;

  // localhost with optional port
  if (/^localhost(:\d+)?(\/|$)/i.test(q)) return `http://${q}`;

  // IP address with optional port
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?(\/|$)/.test(q)) return `http://${q}`;

  // Domain-like pattern: word.tld (at least 2-char TLD, no spaces)
  if (/^[\w][\w.-]*\.[a-z]{2,}([\/:?#]|$)/i.test(q) && !q.includes(" ")) return `https://${q}`;

  // Default: search
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
