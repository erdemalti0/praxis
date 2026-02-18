import { useState, useEffect } from "react";
import { Search, Plus, X } from "lucide-react";
import { useBrowserStore } from "../../stores/browserStore";
import type { Favorite } from "../../stores/browserStore";

interface BrowserLandingProps {
  onNavigate: (url: string) => void;
}

export default function BrowserLanding({ onNavigate }: BrowserLandingProps) {
  const favorites = useBrowserStore((s) => s.favorites);
  const favoritesLoaded = useBrowserStore((s) => s.favoritesLoaded);
  const loadFavorites = useBrowserStore((s) => s.loadFavorites);
  const addFavorite = useBrowserStore((s) => s.addFavorite);
  const removeFavorite = useBrowserStore((s) => s.removeFavorite);

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("https://");

  useEffect(() => {
    if (!favoritesLoaded) loadFavorites();
  }, [favoritesLoaded, loadFavorites]);

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;
    if (q.includes(".") || q.startsWith("http")) {
      onNavigate(q.startsWith("http") ? q : `https://${q}`);
    } else {
      onNavigate(
        `https://www.google.com/search?q=${encodeURIComponent(q)}`
      );
    }
  };

  const handleAddFavorite = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    await addFavorite(newName.trim(), newUrl.trim());
    setNewName("");
    setNewUrl("https://");
    setShowAddForm(false);
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center overflow-y-auto"
      style={{
        background: "var(--vp-bg-inset)",
        paddingTop: "10vh",
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 40, textAlign: "center" }}>
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "var(--vp-text-primary)",
            letterSpacing: "-0.03em",
          }}
        >
          Praxis
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--vp-text-subtle)",
            marginTop: 6,
          }}
        >
          Search or enter a URL
        </div>
      </div>

      {/* Search bar */}
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          position: "relative",
          marginBottom: 48,
          padding: "0 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--vp-bg-surface)",
            border: "1px solid var(--vp-border-light)",
            borderRadius: "var(--vp-radius-3xl)",
            padding: "12px 16px",
            transition: "border-color 0.2s",
          }}
        >
          <Search size={16} style={{ color: "var(--vp-text-faint)", flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search Google or type a URL..."
            autoFocus
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--vp-text-primary)",
              fontSize: 14,
              fontFamily: "inherit",
            }}
          />
        </div>
      </div>

      {/* Favorites grid */}
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          padding: "0 24px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: 12,
          }}
        >
          {favorites.map((fav) => (
            <FavoriteCard
              key={fav.id}
              favorite={fav}
              onClick={() => onNavigate(fav.url)}
              onRemove={() => removeFavorite(fav.id)}
            />
          ))}

          {/* Add card */}
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              height: 96,
              background: "transparent",
              border: "1.5px dashed var(--vp-border-light)",
              borderRadius: "var(--vp-radius-3xl)",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--vp-accent-blue-border)";
              e.currentTarget.style.background = "var(--vp-accent-blue-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--vp-border-light)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Plus size={18} style={{ color: "var(--vp-text-faint)" }} />
            <span style={{ fontSize: 10, color: "var(--vp-text-faint)" }}>Add</span>
          </button>
        </div>
      </div>

      {/* Add favorite form overlay */}
      {showAddForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: "var(--vp-bg-overlay)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setShowAddForm(false)}
        >
          <div
            style={{
              width: 360,
              background: "var(--vp-bg-secondary)",
              border: "1px solid var(--vp-border-panel)",
              borderRadius: "var(--vp-radius-4xl)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid var(--vp-border-medium)" }}
            >
              <span
                style={{ color: "var(--vp-text-primary)", fontSize: 14, fontWeight: 600 }}
              >
                Add Favorite
              </span>
              <button
                onClick={() => setShowAddForm(false)}
                style={{
                  color: "var(--vp-text-faint)",
                  padding: 4,
                  borderRadius: "var(--vp-radius-lg)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--vp-text-dim)" }}
                >
                  Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My Site"
                  style={inputStyle}
                  autoFocus
                />
              </div>
              <div>
                <label
                  className="text-xs block mb-1.5"
                  style={{ color: "var(--vp-text-dim)" }}
                >
                  URL
                </label>
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://example.com"
                  style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddFavorite()}
                />
              </div>
              <button
                onClick={handleAddFavorite}
                disabled={!newName.trim() || !newUrl.trim()}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: "var(--vp-button-primary-bg)",
                  color: "var(--vp-button-primary-text)",
                  borderRadius: "var(--vp-radius-xl)",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "opacity 0.2s",
                  marginTop: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helper: get favicon URL from a site URL ── */
function getFaviconUrl(siteUrl: string, size = 64): string {
  try {
    const domain = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=example.com&sz=${size}`;
  }
}

/* ── Favorite card ── */
function FavoriteCard({
  favorite,
  onClick,
  onRemove,
}: {
  favorite: Favorite;
  onClick: () => void;
  onRemove: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: 96,
        background: hovered
          ? "var(--vp-bg-surface-hover)"
          : "var(--vp-bg-surface)",
        border: "1px solid var(--vp-border-subtle)",
        borderRadius: "var(--vp-radius-3xl)",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={getFaviconUrl(favorite.url, 64)}
        alt={favorite.name}
        style={{
          width: 32,
          height: 32,
          borderRadius: "var(--vp-radius-lg)",
          objectFit: "contain",
        }}
        draggable={false}
      />
      <span
        style={{
          fontSize: 11,
          color: "var(--vp-text-muted)",
          maxWidth: "80%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {favorite.name}
      </span>
      {/* Remove button on hover */}
      {hovered && (
        <div
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            width: 18,
            height: 18,
            borderRadius: "var(--vp-radius-sm)",
            background: "var(--vp-accent-red-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={10} style={{ color: "var(--vp-accent-red-text)" }} />
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--vp-input-bg)",
  border: "1px solid var(--vp-input-border)",
  color: "var(--vp-text-primary)",
  outline: "none",
  borderRadius: "var(--vp-radius-xl)",
  padding: "8px 12px",
  fontSize: 13,
  transition: "border-color 0.2s",
};
