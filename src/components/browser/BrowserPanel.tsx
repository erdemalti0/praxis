import { useRef, useState, useCallback, useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useBrowserStore } from "../../stores/browserStore";
import BrowserLanding from "./BrowserLanding";
import ErrorPage from "./ErrorPage";
import TabBar from "./TabBar";
import NavigationBar from "./NavigationBar";
import TabContextMenu from "./TabContextMenu";
import { useBrowserShortcuts } from "../../hooks/useBrowserShortcuts";

export default function BrowserPanel() {
  const tabs = useBrowserStore((s) => s.tabs);
  const activeBrowserTabId = useBrowserStore((s) => s.activeBrowserTabId);
  const navigateTab = useBrowserStore((s) => s.navigateTab);
  const showTabLanding = useBrowserStore((s) => s.showTabLanding);
  const createLandingTab = useBrowserStore((s) => s.createLandingTab);
  const browserMaximized = useBrowserStore((s) => s.browserMaximized);
  const setBrowserMaximized = useBrowserStore((s) => s.setBrowserMaximized);
  const updateTab = useBrowserStore((s) => s.updateTab);

  const activeTab = tabs.find((t) => t.id === activeBrowserTabId) ?? null;

  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    tabId: string | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    tabId: null,
  });

  const webviewRefs = useRef<Map<string, Electron.WebviewTag>>(new Map());
  const activeWebviewRef = useRef<Electron.WebviewTag | null>(null);

  useEffect(() => {
    if (activeBrowserTabId) {
      activeWebviewRef.current = webviewRefs.current.get(activeBrowserTabId) || null;
    }
  }, [activeBrowserTabId]);

  useBrowserShortcuts(activeWebviewRef);

  useEffect(() => {
    if (tabs.length === 0) {
      createLandingTab();
    }
  }, [tabs.length, createLandingTab]);

  const handleNavigate = useCallback((url: string) => {
    if (!activeBrowserTabId) return;
    navigateTab(activeBrowserTabId, url);
  }, [activeBrowserTabId, navigateTab]);

  const handleHome = useCallback(() => {
    if (!activeBrowserTabId) return;
    showTabLanding(activeBrowserTabId);
    updateTab(activeBrowserTabId, { error: undefined });
  }, [activeBrowserTabId, showTabLanding, updateTab]);

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      tabId,
    });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  }, []);

  if (!activeTab) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ background: "var(--vp-bg-primary)" }}
      >
        <span style={{ color: "var(--vp-text-subtle)", fontSize: 13 }}>
          No browser tab selected
        </span>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ background: "var(--vp-bg-primary)" }}
    >
      <TabBar onContextMenu={handleContextMenu} />

      <NavigationBar
        onNavigate={handleNavigate}
        webviewRef={activeWebviewRef}
        tabId={activeTab.id}
      />

      <div
        className="flex-1 min-h-0"
        style={{ position: "relative", background: "var(--vp-bg-primary)" }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            style={{
              display: tab.id === activeBrowserTabId ? "flex" : "none",
              width: "100%",
              height: "100%",
              position: "absolute",
              inset: 0,
              flexDirection: "column",
            }}
          >
            {tab.showLanding ? (
              <BrowserLanding onNavigate={handleNavigate} />
            ) : tab.error ? (
              <ErrorPage
                type={tab.error.type}
                url={tab.error.url}
                message={tab.error.message}
                onRetry={() => {
                  const webview = webviewRefs.current.get(tab.id);
                  if (webview) {
                    updateTab(tab.id, { error: undefined, isLoading: true });
                    webview.reload();
                  }
                }}
                onHome={handleHome}
              />
            ) : null}

            {tab.url && !tab.showLanding && (
              <WebviewContainer
                key={`wv-${tab.id}`}
                tabId={tab.id}
                url={tab.url}
                isActive={tab.id === activeBrowserTabId}
                webviewRefs={webviewRefs}
                activeWebviewRef={activeWebviewRef}
              />
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => setBrowserMaximized(!browserMaximized)}
        title={browserMaximized ? "Exit Fullscreen" : "Fullscreen"}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 26,
          height: 26,
          borderRadius: 6,
          border: "none",
          background: "var(--vp-bg-surface)",
          cursor: "pointer",
          color: "var(--vp-text-dim)",
          flexShrink: 0,
          transition: "all 0.15s",
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--vp-border-subtle)";
          e.currentTarget.style.color = "var(--vp-text-primary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--vp-bg-surface)";
          e.currentTarget.style.color = "var(--vp-text-dim)";
        }}
      >
        {browserMaximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      </button>

      <TabContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        tabId={contextMenu.tabId}
        onClose={handleCloseContextMenu}
      />
    </div>
  );
}

interface WebviewContainerProps {
  tabId: string;
  url: string;
  isActive: boolean;
  webviewRefs: React.MutableRefObject<Map<string, Electron.WebviewTag>>;
  activeWebviewRef: React.MutableRefObject<Electron.WebviewTag | null>;
}

function WebviewContainer({
  tabId,
  url,
  isActive,
  webviewRefs,
  activeWebviewRef,
}: WebviewContainerProps) {
  const webviewRef = useRef<Electron.WebviewTag>(null);
  const setTabLoading = useBrowserStore((s) => s.setTabLoading);
  const setTabTitle = useBrowserStore((s) => s.setTabTitle);
  const setTabFavicon = useBrowserStore((s) => s.setTabFavicon);
  const setTabNavigationState = useBrowserStore((s) => s.setTabNavigationState);
  const updateTab = useBrowserStore((s) => s.updateTab);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    webviewRefs.current.set(tabId, webview);
    if (isActive) {
      activeWebviewRef.current = webview;
    }

    const handleDidStartLoading = () => {
      setTabLoading(tabId, true);
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

    const handlePageTitleUpdated = (e: Electron.PageTitleUpdatedEvent) => {
      setTabTitle(tabId, e.title);
    };

    const handlePageFaviconUpdated = (e: Electron.PageFaviconUpdatedEvent) => {
      if (e.favicons && e.favicons.length > 0) {
        setTabFavicon(tabId, e.favicons[0]);
      }
    };

    const handleDidNavigate = (e: any) => {
      updateNavigationState();
      if (e.isMainFrame) {
        updateTab(tabId, { error: undefined, url: e.url });
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
      updateTab(tabId, {
        error: {
          type: errorType,
          url: e.validatedURL || "",
          message: e.errorDescription,
        },
      });
    };

    const handleCrashed = () => {
      setTabLoading(tabId, false);
      updateTab(tabId, {
        error: {
          type: "unknown",
          url: url,
          message: "The page has crashed",
        },
      });
    };

    const handleDomReady = () => {
      updateNavigationState();
      injectCustomStyles(webview);
    };

    const handleNewWindow = (e: any) => {
      e.preventDefault();
      window.open(e.url, "_blank");
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

    webview.addEventListener("did-start-loading", handleDidStartLoading);
    webview.addEventListener("did-stop-loading", handleDidStopLoading);
    webview.addEventListener("did-finish-load", handleDidFinishLoad);
    webview.addEventListener("page-title-updated", handlePageTitleUpdated);
    webview.addEventListener("page-favicon-updated", handlePageFaviconUpdated);
    webview.addEventListener("did-navigate", handleDidNavigate);
    webview.addEventListener("did-navigate-in-page", handleDidNavigateInPage);
    webview.addEventListener("did-fail-load", handleDidFailLoad);
    webview.addEventListener("crashed", handleCrashed);
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
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("new-window", handleNewWindow);
      webviewRefs.current.delete(tabId);
    };
  }, [tabId, url, isActive, webviewRefs, activeWebviewRef, setTabLoading, setTabTitle, setTabFavicon, setTabNavigationState, updateTab]);

  useEffect(() => {
    if (isActive && webviewRef.current) {
      activeWebviewRef.current = webviewRef.current;
    }
  }, [isActive, activeWebviewRef]);

  return (
    <webview
      ref={webviewRef as any}
      key={`wv-${tabId}`}
      src={url}
      data-tab-id={tabId}
      // @ts-ignore
      partition="persist:praxis-browser"
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0,
        display: "flex",
        border: "none",
        background: "#fff",
      }}
      // @ts-ignore
      allowpopups="true"
      // @ts-ignore
      webpreferences="contextIsolation=yes"
    />
  );
}

function injectCustomStyles(webview: Electron.WebviewTag) {
  webview.executeJavaScript(`
    (function() {
      if (window.__praxis_styles_injected) return;
      window.__praxis_styles_injected = true;
      
      const style = document.createElement('style');
      style.textContent = \`
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
      \`;
      document.head.appendChild(style);
    })();
  `).catch(() => {});
}

function mapErrorCodeToType(code: number): "network" | "404" | "timeout" | "dns" | "ssl" | "unknown" {
  switch (code) {
    case -105:
    case -138:
      return "dns";
    case -106:
    case -109:
    case -118:
    case -7:
      return "network";
    case -324:
    case -326:
      return "timeout";
    case -501:
    case -200:
    case -201:
    case -202:
    case -203:
    case -204:
    case -205:
    case -206:
    case -207:
    case -208:
    case -209:
    case -210:
    case -211:
      return "ssl";
    case -6:
      return "404";
    default:
      return "unknown";
  }
}
