/**
 * PII / Secret redaction filter.
 * Every memory entry passes through this before persistence.
 */

const REDACTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  // API keys — common prefixes
  { pattern: /(?:sk|pk)[-_][a-zA-Z0-9]{20,}/g, label: "api-key" },
  // GitHub tokens
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, label: "github-pat" },
  { pattern: /github_pat_[a-zA-Z0-9_]{82}/g, label: "github-fine-pat" },
  { pattern: /gho_[a-zA-Z0-9]{36}/g, label: "github-oauth" },
  { pattern: /ghs_[a-zA-Z0-9]{36}/g, label: "github-server" },
  // AWS keys
  { pattern: /AKIA[A-Z0-9]{16}/g, label: "aws-access-key" },
  // OpenAI / Anthropic keys
  { pattern: /sk-[a-zA-Z0-9-_]{40,}/g, label: "openai-key" },
  // Generic "key=" patterns
  { pattern: /(?:api[_-]?key|secret[_-]?key|access[_-]?token)\s*[:=]\s*["']?[a-zA-Z0-9\-_.]{20,}/gi, label: "generic-key" },
  // Private keys (PEM)
  { pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, label: "private-key" },
  // Connection strings with passwords
  { pattern: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^:]+:[^@\s]+@/gi, label: "connection-string" },
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, label: "email" },
];

/**
 * Calculate Shannon entropy of a string (bits per character).
 */
function shannonEntropy(str: string): number {
  if (str.length === 0) return 0;
  const freq: Record<string, number> = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1;
  }
  const len = str.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Check for high-entropy substrings that may be secrets.
 * Looks for tokens > 20 chars with entropy > 4.0 bits/char.
 */
function redactHighEntropy(content: string): { result: string; found: boolean } {
  // Split on whitespace and common delimiters
  const tokens = content.split(/[\s"'`=:,;{}()\[\]]+/);
  let found = false;
  let result = content;

  for (const token of tokens) {
    if (token.length > 20 && shannonEntropy(token) > 4.0) {
      // Likely a secret — check it's not a normal path or URL
      if (token.startsWith("/") || token.startsWith("http") || token.startsWith("./")) {
        continue;
      }
      result = result.replace(token, "[REDACTED]");
      found = true;
    }
  }

  return { result, found };
}

export interface RedactionResult {
  redacted: string;
  hadPII: boolean;
  redactedTypes: string[];
}

/**
 * Redact PII and secrets from content before memory persistence.
 */
export function redact(content: string): RedactionResult {
  let redacted = content;
  const redactedTypes: string[] = [];

  // Pattern-based redaction
  for (const { pattern, label } of REDACTION_PATTERNS) {
    // Reset regex state (global flag)
    pattern.lastIndex = 0;
    if (pattern.test(redacted)) {
      pattern.lastIndex = 0;
      redacted = redacted.replace(pattern, "[REDACTED]");
      redactedTypes.push(label);
    }
  }

  // High-entropy detection
  const { result, found } = redactHighEntropy(redacted);
  if (found) {
    redacted = result;
    redactedTypes.push("high-entropy");
  }

  return {
    redacted,
    hadPII: redactedTypes.length > 0,
    redactedTypes,
  };
}
