import { WifiOff, FileQuestion, AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorPageProps {
  type: "network" | "404" | "timeout" | "dns" | "ssl" | "unknown";
  url?: string;
  message?: string;
  onRetry?: () => void;
  onHome?: () => void;
}

const ERROR_CONFIG = {
  network: {
    icon: WifiOff,
    title: "No Internet Connection",
    description: "Check your network settings and try again.",
    color: "var(--vp-accent-red-text)",
  },
  404: {
    icon: FileQuestion,
    title: "Page Not Found",
    description: "The page you're looking for doesn't exist.",
    color: "var(--vp-accent-amber)",
  },
  timeout: {
    icon: AlertTriangle,
    title: "Connection Timed Out",
    description: "The server took too long to respond.",
    color: "var(--vp-accent-orange)",
  },
  dns: {
    icon: WifiOff,
    title: "DNS Lookup Failed",
    description: "Couldn't find the server address.",
    color: "var(--vp-accent-red-text)",
  },
  ssl: {
    icon: AlertTriangle,
    title: "Connection Not Secure",
    description: "This site's security certificate is not trusted.",
    color: "var(--vp-accent-red)",
  },
  unknown: {
    icon: AlertTriangle,
    title: "Something Went Wrong",
    description: "An unexpected error occurred.",
    color: "var(--vp-text-muted)",
  },
};

export default function ErrorPage({ type, url, message, onRetry, onHome }: ErrorPageProps) {
  const config = ERROR_CONFIG[type];
  const Icon = config.icon;

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: "var(--vp-bg-primary)", padding: 40 }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "var(--vp-radius-4xl)",
          background: `var(--vp-bg-surface)`,
          border: `1px solid var(--vp-bg-surface-hover)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
        }}
      >
        <Icon size={32} style={{ color: config.color }} />
      </div>

      <h1
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: "var(--vp-text-primary)",
          marginBottom: 8,
          textAlign: "center",
        }}
      >
        {config.title}
      </h1>

      <p
        style={{
          fontSize: 14,
          color: "var(--vp-text-dim)",
          marginBottom: 8,
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        {message || config.description}
      </p>

      {url && (
        <p
          style={{
            fontSize: 12,
            color: "var(--vp-text-subtle)",
            fontFamily: "monospace",
            marginBottom: 24,
            maxWidth: 400,
            wordBreak: "break-all",
            textAlign: "center",
          }}
        >
          {url}
        </p>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: "var(--vp-border-subtle)",
              border: "1px solid var(--vp-border-light)",
              borderRadius: "var(--vp-radius-xl)",
              color: "var(--vp-text-primary)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--vp-border-medium)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--vp-border-subtle)";
            }}
          >
            <RefreshCw size={15} />
            Try Again
          </button>
        )}

        {onHome && (
          <button
            onClick={onHome}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: "transparent",
              border: "1px solid var(--vp-border-light)",
              borderRadius: "var(--vp-radius-xl)",
              color: "var(--vp-text-muted)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--vp-text-primary)";
              e.currentTarget.style.borderColor = "var(--vp-border-medium)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--vp-text-muted)";
              e.currentTarget.style.borderColor = "var(--vp-border-light)";
            }}
          >
            <Home size={15} />
            Go Home
          </button>
        )}
      </div>
    </div>
  );
}
