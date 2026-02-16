import { useState, useCallback, useRef, useMemo } from "react";
import { Search, X, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { useSearchStore } from "../../stores/searchStore";
import { useUIStore } from "../../stores/uiStore";

export default function SearchPanel() {
  const query = useSearchStore((s) => s.query);
  const isRegex = useSearchStore((s) => s.isRegex);
  const caseSensitive = useSearchStore((s) => s.caseSensitive);
  const results = useSearchStore((s) => s.results);
  const loading = useSearchStore((s) => s.loading);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setIsRegex = useSearchStore((s) => s.setIsRegex);
  const setCaseSensitive = useSearchStore((s) => s.setCaseSensitive);
  const search = useSearchStore((s) => s.search);
  const clearResults = useSearchStore((s) => s.clearResults);
  const selectedProject = useUIStore((s) => s.selectedProject);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(() => {
    if (selectedProject?.path) {
      search(selectedProject.path);
    }
  }, [selectedProject?.path, search]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
    if (e.key === "Escape") {
      clearResults();
      inputRef.current?.blur();
    }
  }, [handleSearch, clearResults]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  // Group results by file (memoized)
  const { grouped, fileKeys } = useMemo(() => {
    const g: Record<string, typeof results> = {};
    for (const r of results) {
      if (!g[r.file]) g[r.file] = [];
      g[r.file].push(r);
    }
    return { grouped: g, fileKeys: Object.keys(g) };
  }, [results]);

  return (
    <div className="h-full flex flex-col" style={{ overflow: "hidden" }}>
      {/* Search input */}
      <div style={{ padding: "8px 8px 4px", flexShrink: 0 }}>
        <div className="flex items-center gap-1" style={{
          background: "var(--vp-bg-surface)",
          border: "1px solid var(--vp-bg-surface-hover)",
          borderRadius: 8, padding: "4px 8px",
        }}>
          <Search size={12} style={{ color: "var(--vp-text-faint)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search in files..."
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: "var(--vp-text-primary)", fontSize: 11, fontFamily: "inherit", minWidth: 0,
            }}
          />
          {query && (
            <button
              onClick={clearResults}
              style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 0 }}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Toggle buttons */}
        <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
          <button
            onClick={() => setIsRegex(!isRegex)}
            title="Use Regex"
            style={{
              padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 600,
              background: isRegex ? "var(--vp-accent-blue-bg-hover)" : "var(--vp-bg-surface)",
              border: `1px solid ${isRegex ? "var(--vp-accent-blue-border)" : "var(--vp-border-subtle)"}`,
              color: isRegex ? "var(--vp-accent-blue)" : "var(--vp-text-faint)", cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            .*
          </button>
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            title="Case Sensitive"
            style={{
              padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 600,
              background: caseSensitive ? "var(--vp-accent-blue-bg-hover)" : "var(--vp-bg-surface)",
              border: `1px solid ${caseSensitive ? "var(--vp-accent-blue-border)" : "var(--vp-border-subtle)"}`,
              color: caseSensitive ? "var(--vp-accent-blue)" : "var(--vp-text-faint)", cursor: "pointer",
            }}
          >
            Aa
          </button>
          <div style={{ flex: 1 }} />
          {results.length > 0 && (
            <span style={{ fontSize: 9, color: "var(--vp-text-faint)" }}>
              {results.length} result{results.length !== 1 ? "s" : ""} in {fileKeys.length} file{fileKeys.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "4px 0" }}>
        {loading && (
          <div style={{ padding: "12px", textAlign: "center", color: "var(--vp-text-faint)", fontSize: 11 }}>
            Searching...
          </div>
        )}

        {!loading && results.length === 0 && query && (
          <div style={{ padding: "12px", textAlign: "center", color: "var(--vp-text-subtle)", fontSize: 11 }}>
            No results found
          </div>
        )}

        {fileKeys.map((file) => {
          const items = grouped[file];
          const isCollapsed = collapsed[file];
          return (
            <div key={file}>
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [file]: !c[file] }))}
                className="flex items-center gap-1 w-full"
                style={{
                  padding: "4px 8px", background: "var(--vp-bg-surface)",
                  border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                {isCollapsed ? <ChevronRight size={10} style={{ color: "var(--vp-text-faint)" }} /> : <ChevronDown size={10} style={{ color: "var(--vp-text-faint)" }} />}
                <span style={{ fontSize: 10, color: "var(--vp-text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file}
                </span>
                <span style={{ fontSize: 9, color: "var(--vp-text-faint)", flexShrink: 0 }}>{items.length}</span>
              </button>
              {!isCollapsed && items.map((r, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2"
                  style={{
                    padding: "2px 8px 2px 22px", cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onClick={() => copyToClipboard(`${file}:${r.line}`)}
                  title={`Click to copy: ${file}:${r.line}`}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--vp-bg-surface)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ fontSize: 9, color: "var(--vp-text-faint)", width: 30, textAlign: "right", flexShrink: 0 }}>
                    {r.line}
                  </span>
                  <span style={{
                    fontSize: 10, color: "var(--vp-text-secondary)", fontFamily: "monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                  }}>
                    {r.content.trim()}
                  </span>
                  <Copy size={9} style={{ color: "var(--vp-text-subtle)", flexShrink: 0 }} />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
