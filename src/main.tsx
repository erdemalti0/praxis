import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import { useSettingsStore } from "./stores/settingsStore";
import { applyTheme, darkTheme } from "./lib/themes";

// Apply default dark theme immediately, then load saved settings
applyTheme(darkTheme);
useSettingsStore.getState().loadSettings();

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ background: "var(--vp-bg-secondary)", color: "var(--vp-accent-red-text)", padding: 40, fontFamily: "monospace", height: "100vh" }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Praxis Error</h1>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--vp-text-muted)", marginTop: 12 }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  document.body.innerHTML = '<div style="color:red;padding:40px">Root element not found!</div>';
}
