import { ArrowLeft, ArrowRight, RotateCw, Home, Star, Loader2 } from "lucide-react";
import { useBrowserStore } from "../../stores/browserStore";
import { useState, useEffect, useRef } from "react";

interface NavigationBarProps {
  onNavigate: (url: string) => void;
  webviewRef: React.RefObject<Electron.WebviewTag | null>;
  tabId: string;
}

export default function NavigationBar({ onNavigate, webviewRef, tabId }: NavigationBarProps) {
  const tabs = useBrowserStore((s) => s.tabs);
  const favorites = useBrowserStore((s) => s.favorites);
  const addFavorite = useBrowserStore((s) => s.addFavorite);
  const removeFavorite = useBrowserStore((s) => s.removeFavorite);
  const setTabLoading = useBrowserStore((s) => s.setTabLoading);

  const showTabLanding = useBrowserStore((s) => s.showTabLanding);
  
  const activeTab = tabs.find((t) => t.id === tabId);
  
  const [urlInput, setUrlInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab?.url && !isFocused) {
      setUrlInput(activeTab.url);
    }
  }, [activeTab?.url, isFocused]);

  useEffect(() => {
    if (!isFocused && !activeTab?.url) {
      setUrlInput("");
    }
  }, [activeTab?.showLanding, isFocused]);

  const handleNavigate = (input: string) => {
    const q = input.trim();
    if (!q) return;
    
    let url: string;
    if (q.includes(".") || q.startsWith("http")) {
      url = q.startsWith("http") ? q : `https://${q}`;
    } else {
      url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    }
    
    setUrlInput(url);
    onNavigate(url);
    inputRef.current?.blur();
  };

  const handleGoBack = () => {
    const webview = webviewRef.current;
    if (webview && webview.canGoBack()) {
      setTabLoading(tabId, true);
      webview.goBack();
    }
  };

  const handleGoForward = () => {
    const webview = webviewRef.current;
    if (webview && webview.canGoForward()) {
      setTabLoading(tabId, true);
      webview.goForward();
    }
  };

  const handleRefresh = () => {
    const webview = webviewRef.current;
    if (webview) {
      setTabLoading(tabId, true);
      webview.reload();
    }
  };

  const handleHome = () => {
    showTabLanding(tabId);
    setUrlInput("");
  };

  const isFavorite = activeTab?.url 
    ? favorites.some((f) => f.url === activeTab.url)
    : false;

  const handleToggleFavorite = async () => {
    if (!activeTab?.url) return;
    
    if (isFavorite) {
      const fav = favorites.find((f) => f.url === activeTab.url);
      if (fav) await removeFavorite(fav.id);
    } else {
      const name = activeTab.title || activeTab.label;
      await addFavorite(name, activeTab.url);
    }
  };

  const isLoading = activeTab?.isLoading ?? false;
  const canGoBack = activeTab?.canGoBack ?? false;
  const canGoForward = activeTab?.canGoForward ?? false;
  const isLanding = activeTab?.showLanding ?? true;

  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      style={{
        height: 44,
        padding: "0 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <NavButton
        onClick={handleGoBack}
        disabled={!canGoBack}
        title="Go back (⌘[)"
        icon={<ArrowLeft size={15} />}
      />
      <NavButton
        onClick={handleGoForward}
        disabled={!canGoForward}
        title="Go forward (⌘])"
        icon={<ArrowRight size={15} />}
      />
      <NavButton
        onClick={handleRefresh}
        disabled={isLanding}
        title="Reload (⌘R)"
        icon={isLoading ? <Loader2 size={15} className="animate-spin" /> : <RotateCw size={15} />}
      />
      <NavButton
        onClick={handleHome}
        active={isLanding}
        title="Home"
        icon={<Home size={15} />}
      />

      <div
        className="flex items-center gap-2"
        style={{
          flex: 1,
          background: "rgba(255,255,255,0.04)",
          border: isFocused ? "1px solid rgba(96,165,250,0.4)" : "1px solid rgba(255,255,255,0.08)",
          borderRadius: 9,
          padding: "0 12px",
          height: 32,
          transition: "border-color 0.2s",
          minWidth: 0,
        }}
      >
        {!isLanding && activeTab?.favicon && (
          <img
            src={activeTab.favicon}
            alt=""
            style={{
              width: 14,
              height: 14,
              flexShrink: 0,
            }}
            draggable={false}
          />
        )}
        <input
          ref={inputRef}
          type="text"
          data-url-input="true"
          value={isFocused ? urlInput : (isLanding ? "" : (activeTab?.url || ""))}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleNavigate(urlInput);
            } else if (e.key === "Escape") {
              inputRef.current?.blur();
              setUrlInput(activeTab?.url || "");
            }
          }}
          onFocus={() => {
            setIsFocused(true);
            if (activeTab?.url) {
              setUrlInput(activeTab.url);
            }
            setTimeout(() => inputRef.current?.select(), 0);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          placeholder="Search or enter URL..."
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#c0c0c0",
            fontSize: 12,
            fontFamily: "inherit",
            minWidth: 0,
          }}
        />
      </div>

      <NavButton
        onClick={handleToggleFavorite}
        disabled={!activeTab?.url}
        active={isFavorite}
        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        icon={<Star size={15} fill={isFavorite ? "currentColor" : "none"} />}
      />
    </div>
  );
}

interface NavButtonProps {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title: string;
  icon: React.ReactNode;
}

function NavButton({ onClick, disabled, active, title, icon }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: 8,
        background: active
          ? "rgba(96,165,250,0.15)"
          : "transparent",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        color: active
          ? "#60a5fa"
          : disabled
            ? "#333"
            : "#666",
        transition: "all 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) {
          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
          e.currentTarget.style.color = "#e0e0e0";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = disabled ? "#333" : "#666";
        }
      }}
    >
      {icon}
    </button>
  );
}
