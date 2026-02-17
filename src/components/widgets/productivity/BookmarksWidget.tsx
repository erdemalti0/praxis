import { useState, useEffect, useMemo, useRef } from "react";
import type { BookmarksConfig } from "../../../types/widget";
import { Plus, X, Folder, ExternalLink, Download, Upload, Search, Edit2, Trash2, ChevronDown, ChevronRight, GripVertical, Star } from "lucide-react";
import { useUIStore } from "../../../stores/uiStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { useBrowserStore } from "../../../stores/browserStore";
import { loadJsonFile, createDebouncedSaver } from "../../../lib/persistence";
import { getProjectDataDir } from "../../../lib/projectSlug";

function getFaviconUrl(siteUrl: string): string {
  try {
    const domain = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return "";
  }
}

interface Bookmark {
  id: string;
  title: string;
  url: string;
  groupId: string;
  createdAt: number;
}

interface BookmarkGroup {
  id: string;
  name: string;
  collapsed?: boolean;
}

export default function BookmarksWidget({
  widgetId: _widgetId,
  config = {},
}: {
  widgetId: string;
  config?: BookmarksConfig;
}) {
  const projectPath = useUIStore((s) => s.selectedProject?.path);
  const homeDir = useSettingsStore((s) => s.homeDir);
  const saverRef = useRef(createDebouncedSaver(500));
  const dataDir = projectPath && homeDir ? getProjectDataDir(homeDir, projectPath) : null;
  const browserFavorites = useBrowserStore((s) => s.favorites);

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [groups, setGroups] = useState<BookmarkGroup[]>(
    config.groups ?? [{ id: "default", name: "General" }]
  );
  const [adding, setAdding] = useState(false);
  const [addingGroup, setAddingGroup] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("default");
  const [newGroupName, setNewGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [favoritesCollapsed, setFavoritesCollapsed] = useState(false);

  useEffect(() => {
    if (!dataDir) return;
    try {
      const filePath = `${dataDir}/bookmarks.json`;
      const data = loadJsonFile(filePath, { bookmarks: [] as Bookmark[], groups: [{ id: "default", name: "General" }] as BookmarkGroup[] });
      if (data.bookmarks) setBookmarks(data.bookmarks);
      if (data.groups) setGroups(data.groups);
    } catch {}
  }, [dataDir]);

  useEffect(() => {
    if (!dataDir) return;
    const filePath = `${dataDir}/bookmarks.json`;
    saverRef.current(filePath, { bookmarks, groups });
  }, [bookmarks, groups, dataDir]);

  const filteredBookmarks = useMemo(() => {
    if (!search) return bookmarks;
    const q = search.toLowerCase();
    return bookmarks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)
    );
  }, [bookmarks, search]);

  const groupedBookmarks = useMemo(() => {
    const map = new Map<string, Bookmark[]>();
    for (const bookmark of filteredBookmarks) {
      const group = groups.find((g) => g.id === bookmark.groupId) ? bookmark.groupId : "default";
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(bookmark);
    }
    return map;
  }, [filteredBookmarks, groups]);

  const add = () => {
    if (!title.trim() || !url.trim()) return;
    const newBookmark: Bookmark = {
      id: `bm-${Date.now()}`,
      title: title.trim(),
      url: url.trim(),
      groupId: selectedGroupId,
      createdAt: Date.now(),
    };
    setBookmarks([...bookmarks, newBookmark]);
    setTitle("");
    setUrl("");
    setAdding(false);
  };

  const remove = (id: string) => {
    setBookmarks(bookmarks.filter((b) => b.id !== id));
  };

  const update = (id: string, updates: Partial<Bookmark>) => {
    setBookmarks(bookmarks.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const addGroup = () => {
    if (!newGroupName.trim()) return;
    const newGroup: BookmarkGroup = {
      id: `group-${Date.now()}`,
      name: newGroupName.trim(),
    };
    setGroups([...groups, newGroup]);
    setNewGroupName("");
    setAddingGroup(false);
    setSelectedGroupId(newGroup.id);
  };

  const removeGroup = (groupId: string) => {
    if (groupId === "default") return;
    setGroups(groups.filter((g) => g.id !== groupId));
    setBookmarks(
      bookmarks.map((b) => (b.groupId === groupId ? { ...b, groupId: "default" } : b))
    );
  };

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  const exportBookmarks = () => {
    const data = { bookmarks, groups };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookmarks.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBookmarks = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.bookmarks) setBookmarks(data.bookmarks);
        if (data.groups) setGroups(data.groups);
      } catch {}
    };
    input.click();
  };

  const openBookmark = (bookmarkUrl: string) => {
    if (bookmarkUrl.startsWith("http")) {
      // Open in built-in browser tab
      const { createLandingTab, navigateTab, setActiveBrowserTabId } = useBrowserStore.getState();
      createLandingTab();
      const latestTab = useBrowserStore.getState().tabs[useBrowserStore.getState().tabs.length - 1];
      if (latestTab) {
        navigateTab(latestTab.id, bookmarkUrl);
        setActiveBrowserTabId(latestTab.id);
      }
      // Switch to browser view
      useUIStore.getState().setViewMode("browser");
    } else {
      window.electron?.invoke("open_path", { path: bookmarkUrl });
    }
  };

  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, _targetGroupId: string) => {
    e.preventDefault();
  };

  const handleDrop = (_e: React.DragEvent, targetGroupId: string) => {
    if (!draggedId) return;
    const bookmark = bookmarks.find((b) => b.id === draggedId);
    if (bookmark && bookmark.groupId !== targetGroupId) {
      update(draggedId, { groupId: targetGroupId });
    }
    setDraggedId(null);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6, padding: 8, overflow: "hidden" }}>
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1"
          style={{
            flex: 1,
            background: "var(--vp-bg-surface)",
            borderRadius: 6,
            padding: "4px 8px",
          }}
        >
          <Search size={12} style={{ color: "var(--vp-text-faint)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bookmarks..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              fontSize: 11,
              color: "var(--vp-text-primary)",
              outline: "none",
            }}
          />
        </div>
        <button
          onClick={() => setAdding(!adding)}
          style={{
            background: adding ? "var(--vp-accent-blue-bg-hover)" : "none",
            border: "none",
            color: adding ? "var(--vp-accent-blue)" : "var(--vp-text-faint)",
            cursor: "pointer",
            padding: 6,
            borderRadius: 4,
          }}
          title="Add bookmark"
        >
          <Plus size={12} />
        </button>
        <button
          onClick={exportBookmarks}
          style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 6 }}
          title="Export bookmarks"
        >
          <Download size={12} />
        </button>
        <button
          onClick={importBookmarks}
          style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 6 }}
          title="Import bookmarks"
        >
          <Upload size={12} />
        </button>
      </div>

      {adding && (
        <div
          style={{
            background: "var(--vp-bg-surface)",
            borderRadius: 6,
            padding: 8,
          }}
        >
          <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              style={{
                background: "var(--vp-bg-surface-hover)",
                border: "1px solid var(--vp-border-light)",
                borderRadius: 4,
                padding: "3px 6px",
                fontSize: 10,
                color: "var(--vp-text-muted)",
              }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setAddingGroup(!addingGroup)}
              style={{
                background: "none",
                border: "none",
                color: "var(--vp-text-faint)",
                cursor: "pointer",
                padding: 2,
              }}
              title="New group"
            >
              <Folder size={10} />
            </button>
          </div>

          {addingGroup && (
            <div className="flex gap-2" style={{ marginBottom: 6 }}>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGroup()}
                placeholder="Group name..."
                style={{
                  flex: 1,
                  background: "var(--vp-bg-surface-hover)",
                  border: "1px solid var(--vp-border-light)",
                  borderRadius: 4,
                  padding: "3px 6px",
                  fontSize: 10,
                  color: "var(--vp-text-primary)",
                }}
              />
              <button
                onClick={addGroup}
                style={{ padding: "3px 8px", fontSize: 9, background: "var(--vp-accent-blue-bg-hover)", border: "none", borderRadius: 4, color: "var(--vp-accent-blue)", cursor: "pointer" }}
              >
                Add
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              style={{
                background: "var(--vp-bg-surface-hover)",
                border: "1px solid var(--vp-border-light)",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: 11,
                color: "var(--vp-text-primary)",
              }}
            />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="URL or file path"
              style={{
                background: "var(--vp-bg-surface-hover)",
                border: "1px solid var(--vp-border-light)",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: 11,
                color: "var(--vp-text-primary)",
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={add}
                disabled={!title.trim() || !url.trim()}
                style={{
                  flex: 1,
                  padding: "4px 8px",
                  fontSize: 10,
                  borderRadius: 4,
                  background: "var(--vp-accent-blue-bg-hover)",
                  border: "none",
                  color: "var(--vp-accent-blue)",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              <button
                onClick={() => setAdding(false)}
                style={{
                  padding: "4px 8px",
                  fontSize: 10,
                  borderRadius: 4,
                  background: "var(--vp-bg-surface-hover)",
                  border: "none",
                  color: "var(--vp-text-dim)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Browser Favorites */}
        {browserFavorites.length > 0 && !search && (
          <div style={{ background: "var(--vp-bg-surface)", borderRadius: 6, overflow: "hidden" }}>
            <button
              onClick={() => setFavoritesCollapsed(!favoritesCollapsed)}
              className="flex items-center gap-2"
              style={{
                width: "100%",
                padding: "6px 8px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {favoritesCollapsed ? <ChevronRight size={10} style={{ color: "var(--vp-text-faint)" }} /> : <ChevronDown size={10} style={{ color: "var(--vp-text-faint)" }} />}
              <Star size={10} style={{ color: "var(--vp-accent-yellow, #facc15)" }} />
              <span style={{ flex: 1, fontSize: 10, color: "var(--vp-text-muted)" }}>Browser Favorites</span>
              <span style={{ fontSize: 9, color: "var(--vp-text-faint)" }}>{browserFavorites.length}</span>
            </button>
            {!favoritesCollapsed && (
              <div style={{ padding: "0 4px 4px" }}>
                {browserFavorites.map((fav) => (
                  <div
                    key={fav.id}
                    className="flex items-center gap-2"
                    onClick={() => openBookmark(fav.url)}
                    style={{
                      padding: "5px 6px",
                      background: "var(--vp-bg-surface)",
                      borderRadius: 4,
                      marginBottom: 2,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface)"; }}
                  >
                    <img
                      src={getFaviconUrl(fav.url)}
                      alt=""
                      style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "var(--vp-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fav.name}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--vp-text-faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {fav.url}
                      </div>
                    </div>
                    <ExternalLink size={8} style={{ color: "var(--vp-text-subtle)", flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {groups.map((group) => {
          const groupBookmarks = groupedBookmarks.get(group.id) || [];
          const isCollapsed = collapsedGroups.has(group.id);

          return (
            <div
              key={group.id}
              onDragOver={(e) => handleDragOver(e, group.id)}
              onDrop={(e) => handleDrop(e, group.id)}
              style={{
                background: "var(--vp-bg-surface)",
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => toggleGroupCollapse(group.id)}
                className="flex items-center gap-2"
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {isCollapsed ? <ChevronRight size={10} style={{ color: "var(--vp-text-faint)" }} /> : <ChevronDown size={10} style={{ color: "var(--vp-text-faint)" }} />}
                <Folder size={10} style={{ color: "var(--vp-accent-blue)" }} />
                <span style={{ flex: 1, fontSize: 10, color: "var(--vp-text-muted)" }}>{group.name}</span>
                <span style={{ fontSize: 9, color: "var(--vp-text-faint)" }}>{groupBookmarks.length}</span>
                {group.id !== "default" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeGroup(group.id);
                    }}
                    style={{ background: "none", border: "none", color: "var(--vp-text-subtle)", cursor: "pointer", padding: 2 }}
                  >
                    <X size={8} />
                  </button>
                )}
              </button>

              {!isCollapsed && (
                <div style={{ padding: "0 4px 4px" }}>
                  {groupBookmarks.map((b) => (
                    <div
                      key={b.id}
                      draggable
                      onDragStart={() => handleDragStart(b.id)}
                      className="flex items-center gap-2"
                      style={{
                        padding: "5px 6px",
                        background: "var(--vp-bg-surface)",
                        borderRadius: 4,
                        marginBottom: 2,
                        cursor: "grab",
                      }}
                    >
                      <GripVertical size={8} style={{ color: "var(--vp-text-subtle)", flexShrink: 0 }} />
                      {b.url.startsWith("http") && (
                        <img
                          src={getFaviconUrl(b.url)}
                          alt=""
                          style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0 }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      {editingId === b.id ? (
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            style={{
                              background: "var(--vp-bg-surface-hover)",
                              border: "1px solid var(--vp-border-light)",
                              borderRadius: 3,
                              padding: "2px 4px",
                              fontSize: 10,
                              color: "var(--vp-text-primary)",
                            }}
                          />
                          <input
                            type="text"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            style={{
                              background: "var(--vp-bg-surface-hover)",
                              border: "1px solid var(--vp-border-light)",
                              borderRadius: 3,
                              padding: "2px 4px",
                              fontSize: 10,
                              color: "var(--vp-text-primary)",
                            }}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                update(b.id, { title: editTitle, url: editUrl });
                                setEditingId(null);
                              }}
                              style={{ fontSize: 9, color: "var(--vp-accent-blue)", background: "none", border: "none", cursor: "pointer" }}
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              style={{ fontSize: 9, color: "var(--vp-text-dim)", background: "none", border: "none", cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              onClick={() => openBookmark(b.url)}
                              style={{
                                fontSize: 11,
                                color: "var(--vp-text-secondary)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                cursor: "pointer",
                              }}
                            >
                              {b.title}
                            </div>
                            <div
                              style={{
                                fontSize: 9,
                                color: "var(--vp-text-faint)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {b.url}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => {
                                setEditingId(b.id);
                                setEditTitle(b.title);
                                setEditUrl(b.url);
                              }}
                              style={{ background: "none", border: "none", color: "var(--vp-text-subtle)", cursor: "pointer", padding: 2 }}
                            >
                              <Edit2 size={8} />
                            </button>
                            <button
                              onClick={() => openBookmark(b.url)}
                              style={{ background: "none", border: "none", color: "var(--vp-text-subtle)", cursor: "pointer", padding: 2 }}
                            >
                              <ExternalLink size={8} />
                            </button>
                            <button
                              onClick={() => remove(b.id)}
                              style={{ background: "none", border: "none", color: "var(--vp-text-subtle)", cursor: "pointer", padding: 2 }}
                            >
                              <Trash2 size={8} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {groupBookmarks.length === 0 && (
                    <div style={{ padding: "8px 6px", color: "var(--vp-text-subtle)", fontSize: 10, textAlign: "center" }}>
                      No bookmarks
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: "var(--vp-text-subtle)", textAlign: "center" }}>
        {bookmarks.length} bookmark{bookmarks.length !== 1 ? "s" : ""} in {groups.length} group{groups.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
