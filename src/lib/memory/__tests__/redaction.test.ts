import { describe, it, expect } from "vitest";
import { redact } from "../redaction";

describe("redaction", () => {
  it("redacts GitHub PAT tokens", () => {
    const result = redact("Use token ghp_1234567890abcdefghijklmnopqrstuvwxyz to authenticate");
    expect(result.hadPII).toBe(true);
    expect(result.redacted).toContain("[REDACTED]");
    expect(result.redacted).not.toContain("ghp_");
    expect(result.redactedTypes).toContain("github-pat");
  });

  it("redacts AWS access keys", () => {
    const result = redact("AWS key: AKIAIOSFODNN7EXAMPLE");
    expect(result.hadPII).toBe(true);
    expect(result.redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("redacts email addresses", () => {
    const result = redact("Contact user@example.com for support");
    expect(result.hadPII).toBe(true);
    expect(result.redacted).not.toContain("user@example.com");
  });

  it("redacts connection strings with passwords", () => {
    const result = redact("Connect to postgres://admin:secretpassword123@db.example.com:5432/mydb");
    expect(result.hadPII).toBe(true);
    expect(result.redacted).not.toContain("secretpassword123");
  });

  it("redacts private key headers", () => {
    const result = redact("Key: -----BEGIN RSA PRIVATE KEY----- rest of key");
    expect(result.hadPII).toBe(true);
  });

  it("redacts generic API key patterns", () => {
    const result = redact("api_key=sk_test_abcdefghijklmnopqrstuvwxyz1234567890");
    expect(result.hadPII).toBe(true);
  });

  it("passes normal text through unchanged", () => {
    const input = "The auth module uses JWT tokens with httpOnly cookies";
    const result = redact(input);
    expect(result.hadPII).toBe(false);
    expect(result.redacted).toBe(input);
  });

  it("passes file paths through unchanged", () => {
    const input = "Edited file: /src/lib/auth/middleware.ts";
    const result = redact(input);
    expect(result.hadPII).toBe(false);
    expect(result.redacted).toBe(input);
  });

  it("passes URLs through unchanged", () => {
    const input = "API endpoint: https://api.example.com/v1/users";
    const result = redact(input);
    // URLs don't match PII patterns (no password in URL)
    expect(result.redacted).toContain("https://api.example.com");
  });
});
