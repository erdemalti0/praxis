import { useEffect, useRef } from "react";
import { useBrowserStore } from "../stores/browserStore";
import { useUIStore } from "../stores/uiStore";

export function useBrowserShortcuts(webviewRef: React.RefObject<Electron.WebviewTag | null>) {
  const viewMode = useUIStore((s) => s.viewMode);
  const createLandingTab = useBrowserStore((s) => s.createLandingTab);
  const removeTab = useBrowserStore((s) => s.removeTab);
  const tabs = useBrowserStore((s) => s.tabs);
  const activeBrowserTabId = useBrowserStore((s) => s.activeBrowserTabId);
  const setActiveBrowserTabId = useBrowserStore((s) => s.setActiveBrowserTabId);
  const reopenClosedTab = useBrowserStore((s) => s.reopenClosedTab);
  const setTabLoading = useBrowserStore((s) => s.setTabLoading);

  // Cache DOM element reference to avoid querySelector on every keydown
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle browser shortcuts when browser view is active
      if (viewMode !== "browser") return;

      const isMetaKey = e.metaKey || e.ctrlKey;

      if (isMetaKey && e.key === "t") {
        e.preventDefault();
        createLandingTab();
        return;
      }

      if (isMetaKey && e.key === "w") {
        e.preventDefault();
        if (activeBrowserTabId) {
          removeTab(activeBrowserTabId);
        }
        return;
      }

      if (isMetaKey && e.key === "r") {
        e.preventDefault();
        const webview = webviewRef.current;
        if (webview) {
          if (activeBrowserTabId) {
            setTabLoading(activeBrowserTabId, true);
          }
          webview.reload();
        }
        return;
      }

      if (isMetaKey && e.shiftKey && e.key === "R") {
        e.preventDefault();
        const webview = webviewRef.current;
        if (webview) {
          if (activeBrowserTabId) {
            setTabLoading(activeBrowserTabId, true);
          }
          webview.reloadIgnoringCache();
        }
        return;
      }

      if (isMetaKey && e.key === "l") {
        e.preventDefault();
        // Use cached ref, fallback to querySelector if stale
        let urlInput = urlInputRef.current;
        if (!urlInput || !urlInput.isConnected) {
          urlInput = document.querySelector<HTMLInputElement>('[data-url-input="true"]');
          urlInputRef.current = urlInput;
        }
        if (urlInput) {
          urlInput.focus();
          urlInput.select();
        }
        return;
      }

      if (isMetaKey && e.shiftKey && e.key === "T") {
        e.preventDefault();
        reopenClosedTab();
        return;
      }

      if (isMetaKey && e.key === "[") {
        e.preventDefault();
        const webview = webviewRef.current;
        if (webview && webview.canGoBack()) {
          if (activeBrowserTabId) {
            setTabLoading(activeBrowserTabId, true);
          }
          webview.goBack();
        }
        return;
      }

      if (isMetaKey && e.key === "]") {
        e.preventDefault();
        const webview = webviewRef.current;
        if (webview && webview.canGoForward()) {
          if (activeBrowserTabId) {
            setTabLoading(activeBrowserTabId, true);
          }
          webview.goForward();
        }
        return;
      }

      if (isMetaKey && e.key === "ArrowLeft") {
        e.preventDefault();
        const webview = webviewRef.current;
        if (webview && webview.canGoBack()) {
          if (activeBrowserTabId) {
            setTabLoading(activeBrowserTabId, true);
          }
          webview.goBack();
        }
        return;
      }

      if (isMetaKey && e.key === "ArrowRight") {
        e.preventDefault();
        const webview = webviewRef.current;
        if (webview && webview.canGoForward()) {
          if (activeBrowserTabId) {
            setTabLoading(activeBrowserTabId, true);
          }
          webview.goForward();
        }
        return;
      }

      if (isMetaKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        const unpinnedTabs = tabs.filter((t) => !t.isPinned);
        if (index < unpinnedTabs.length) {
          setActiveBrowserTabId(unpinnedTabs[index].id);
        }
        return;
      }

      if (isMetaKey && e.key === "0") {
        e.preventDefault();
        const unpinnedTabs = tabs.filter((t) => !t.isPinned);
        if (unpinnedTabs.length > 0) {
          setActiveBrowserTabId(unpinnedTabs[unpinnedTabs.length - 1].id);
        }
        return;
      }

      if (isMetaKey && e.key === "Tab") {
        e.preventDefault();
        const unpinnedTabs = tabs.filter((t) => !t.isPinned);
        if (unpinnedTabs.length <= 1) return;

        const currentIndex = unpinnedTabs.findIndex((t) => t.id === activeBrowserTabId);
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + unpinnedTabs.length) % unpinnedTabs.length
          : (currentIndex + 1) % unpinnedTabs.length;

        setActiveBrowserTabId(unpinnedTabs[nextIndex].id);
        return;
      }

      if (e.key === "F5") {
        e.preventDefault();
        const webview = webviewRef.current;
        if (webview) {
          if (activeBrowserTabId) {
            setTabLoading(activeBrowserTabId, true);
          }
          webview.reload();
        }
        return;
      }

      if (isMetaKey && e.shiftKey && e.key === "I") {
        e.preventDefault();
        const webview = webviewRef.current;
        if (webview) {
          webview.openDevTools();
        }
        return;
      }

      if (isMetaKey && e.key === "f") {
        e.preventDefault();
        const webview = webviewRef.current;
        if (webview) {
          webview.executeJavaScript(`
            if (window.__praxis_find) {
              window.__praxis_find.show();
            } else {
              const input = document.createElement('input');
              input.style.cssText = 'position:fixed;top:10px;right:10px;padding:8px 12px;border-radius:6px;border:1px solid #ccc;font-size:14px;z-index:2147483647;';
              input.placeholder = 'Find...';
              input.oninput = () => window.find(input.value);
              input.onkeydown = (e) => { if(e.key==='Escape') input.remove(); };
              document.body.appendChild(input);
              input.focus();
              window.__praxis_find = { show: () => input.focus() };
            }
          `);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    createLandingTab,
    removeTab,
    tabs,
    activeBrowserTabId,
    setActiveBrowserTabId,
    reopenClosedTab,
    setTabLoading,
    webviewRef,
    viewMode,
  ]);
}
