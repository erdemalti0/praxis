import { ipcMain } from "electron";

const BLOCKED_HOSTS = [
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.internal",
];

export function registerHttpHandlers() {
  ipcMain.handle(
    "http_request",
    async (
      _event,
      args: {
        method: string;
        url: string;
        headers?: Record<string, string>;
        body?: string;
        timeout?: number;
      }
    ) => {
      const { method, url, headers, body, timeout = 30000 } = args;

      // SSRF protection
      try {
        const parsed = new URL(url);
        if (BLOCKED_HOSTS.includes(parsed.hostname)) {
          return {
            status: 0,
            statusText: "Blocked",
            headers: {},
            body: "Request blocked: SSRF protection",
            elapsed: 0,
          };
        }
      } catch {
        return {
          status: 0,
          statusText: "Invalid URL",
          headers: {},
          body: "Invalid URL provided",
          elapsed: 0,
        };
      }

      const start = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers: headers || {},
          body: ["POST", "PUT", "PATCH"].includes(method.toUpperCase())
            ? body
            : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);
        const elapsed = Date.now() - start;

        const contentType = response.headers.get("content-type") || "";
        let responseBody: string;

        if (
          contentType.includes("image/") ||
          contentType.includes("application/octet-stream")
        ) {
          responseBody = `[Binary content: ${contentType}]`;
        } else {
          responseBody = await response.text();
          // Truncate to 100KB
          if (responseBody.length > 100 * 1024) {
            responseBody =
              responseBody.slice(0, 100 * 1024) + "\n\n[Truncated at 100KB]";
          }
        }

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          elapsed,
        };
      } catch (e: any) {
        const elapsed = Date.now() - start;
        return {
          status: 0,
          statusText: "Error",
          headers: {},
          body: e.name === "AbortError" ? "Request timed out" : e.message,
          elapsed,
        };
      }
    }
  );
}
