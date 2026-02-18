import { useEffect, useRef } from "react";
import { useBrowserStore, type BrowserTabError } from "../stores/browserStore";

type ErrorType = "network" | "404" | "timeout" | "dns" | "ssl" | "unknown";

export function useWebviewEvents(
  webviewRef: React.RefObject<Electron.WebviewTag | null>,
  tabId: string
) {
  const setTabLoading = useBrowserStore((s) => s.setTabLoading);
  const setTabTitle = useBrowserStore((s) => s.setTabTitle);
  const setTabFavicon = useBrowserStore((s) => s.setTabFavicon);
  const setTabNavigationState = useBrowserStore((s) => s.setTabNavigationState);
  const updateTab = useBrowserStore((s) => s.updateTab);

  const errorRef = useRef<BrowserTabError | null>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleDidStartLoading = () => {
      setTabLoading(tabId, true);
      errorRef.current = null;
      updateTab(tabId, { error: undefined });
    };

    const handleDidStopLoading = () => {
      setTabLoading(tabId, false);
      updateNavigationState();
    };

    const handleDidFinishLoad = () => {
      setTabLoading(tabId, false);
      updateNavigationState();
    };

    const handlePageTitleUpdated = (e: any) => {
      setTabTitle(tabId, e.title);
    };

    const handlePageFaviconUpdated = (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        setTabFavicon(tabId, e.favicons[0]);
      }
    };

    const handleDidNavigate = (e: any) => {
      updateNavigationState();
      if (e.isMainFrame) {
        errorRef.current = null;
        updateTab(tabId, { error: undefined });
      }
    };

    const handleDidNavigateInPage = (e: any) => {
      if (e.isMainFrame) {
        updateNavigationState();
      }
    };

    const handleDidFailLoad = (e: any) => {
      if (!e.isMainFrame) return;

      setTabLoading(tabId, false);

      const errorType = mapErrorCodeToType(e.errorCode);
      errorRef.current = {
        type: errorType,
        url: e.validatedURL || "",
        message: e.errorDescription,
      };

      updateTab(tabId, {
        error: errorRef.current,
      });
    };

    const handleCrashed = () => {
      setTabLoading(tabId, false);
      errorRef.current = {
        type: "unknown",
        url: webview.src || "",
        message: "The page has crashed",
      };
      updateTab(tabId, { error: errorRef.current });
    };

    const handlePluginCrashed = () => {
      // Plugin crashed — no action needed
    };

    const handleDidRedirect = (_e: any) => {
      // Redirect handled silently
    };

    const updateNavigationState = () => {
      try {
        const canGoBack = webview.canGoBack();
        const canGoForward = webview.canGoForward();
        setTabNavigationState(tabId, canGoBack, canGoForward);
      } catch {
        // Webview might not be ready
      }
    };

    const handleDomReady = () => {
      updateNavigationState();
      
      webview.executeJavaScript(`
        (function() {
          const style = document.createElement('style');
          style.textContent = \`
            ::-webkit-scrollbar { width: 8px; height: 8px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: var(--vp-radius-sm); }
            ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
          \`;
          document.head.appendChild(style);
        })();
      `).catch(() => {});
    };

    const handleNewWindow = (e: any) => {
      e.preventDefault();
      window.open(e.url, "_blank");
    };

    webview.addEventListener("did-start-loading", handleDidStartLoading);
    webview.addEventListener("did-stop-loading", handleDidStopLoading);
    webview.addEventListener("did-finish-load", handleDidFinishLoad);
    webview.addEventListener("page-title-updated", handlePageTitleUpdated);
    webview.addEventListener("page-favicon-updated", handlePageFaviconUpdated);
    webview.addEventListener("did-navigate", handleDidNavigate);
    webview.addEventListener("did-navigate-in-page", handleDidNavigateInPage);
    webview.addEventListener("did-fail-load", handleDidFailLoad);
    webview.addEventListener("crashed", handleCrashed);
    webview.addEventListener("plugin-crashed", handlePluginCrashed);
    webview.addEventListener("did-redirect-navigation", handleDidRedirect);
    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("new-window", handleNewWindow);

    return () => {
      webview.removeEventListener("did-start-loading", handleDidStartLoading);
      webview.removeEventListener("did-stop-loading", handleDidStopLoading);
      webview.removeEventListener("did-finish-load", handleDidFinishLoad);
      webview.removeEventListener("page-title-updated", handlePageTitleUpdated);
      webview.removeEventListener("page-favicon-updated", handlePageFaviconUpdated);
      webview.removeEventListener("did-navigate", handleDidNavigate);
      webview.removeEventListener("did-navigate-in-page", handleDidNavigateInPage);
      webview.removeEventListener("did-fail-load", handleDidFailLoad);
      webview.removeEventListener("crashed", handleCrashed);
      webview.removeEventListener("plugin-crashed", handlePluginCrashed);
      webview.removeEventListener("did-redirect-navigation", handleDidRedirect);
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("new-window", handleNewWindow);
    };
  }, [webviewRef, tabId, setTabLoading, setTabTitle, setTabFavicon, setTabNavigationState, updateTab]);

  return errorRef.current;
}

function mapErrorCodeToType(code: number): ErrorType {
  switch (code) {
    case -105: // ERR_NAME_NOT_RESOLVED
    case -138: // ERR_NETWORK_IO_SUSPENDED
      return "dns";
    case -106: // ERR_INTERNET_DISCONNECTED
    case -109: // ERR_ADDRESS_UNREACHABLE
    case -118: // ERR_CONNECTION_TIMED_OUT
    case -7: // ERR_TIMED_OUT
      return "network";
    case -324: // ERR_EMPTY_RESPONSE
    case -326: // ERR_CONNECTION_RESET
      return "timeout";
    case -501: // ERR_INSECURE_RESPONSE
    case -200: // ERR_CERT_COMMON_NAME_INVALID
    case -201: // ERR_CERT_DATE_INVALID
    case -202: // ERR_CERT_AUTHORITY_INVALID
    case -203: // ERR_CERT_CONTAINS_ERRORS
    case -204: // ERR_CERT_NO_REVOCATION_MECHANISM
    case -205: // ERR_CERT_UNABLE_TO_CHECK_REVOCATION
    case -206: // ERR_CERT_REVOKED
    case -207: // ERR_CERT_INVALID
    case -208: // ERR_CERT_WEAK_SIGNATURE_ALGORITHM
    case -209: // ERR_CERT_NON_UNIQUE_NAME
    case -210: // ERR_CERT_WEAK_KEY
    case -211: // ERR_CERT_NAME_CONSTRAINT_VIOLATION
      return "ssl";
    case -6: // ERR_FILE_NOT_FOUND
      return "404";
    default:
      return "unknown";
  }
}
