import { useState, useEffect, useRef, useMemo } from "react";
import { marked } from "marked";
import type { NotesConfig } from "../../../types/widget";
import { Search, Download, Eye, Edit2, Folder, Plus, X, Check, Trash2 } from "lucide-react";
import { useUIStore } from "../../../stores/uiStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { loadJsonFile, createDebouncedSaver } from "../../../lib/persistence";
import { getProjectDataDir } from "../../../lib/projectSlug";

interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: number;
  updatedAt: number;
}

const noteStyles = `
  .note-preview h1 { font-size: 16px; font-weight: 700; margin: 10px 0 6px; color: var(--vp-text-primary); }
  .note-preview h2 { font-size: 14px; font-weight: 600; margin: 8px 0 4px; color: var(--vp-text-primary); }
  .note-preview h3 { font-size: 12px; font-weight: 600; margin: 6px 0 3px; color: var(--vp-text-primary); }
  .note-preview p { margin: 4px 0; line-height: 1.5; color: var(--vp-text-secondary); }
  .note-preview ul, .note-preview ol { margin: 4px 0; padding-left: 16px; color: var(--vp-text-secondary); }
  .note-preview li { margin: 2px 0; }
  .note-preview code { background: var(--vp-border-subtle); padding: 1px 4px; border-radius: 3px; font-size: 11px; color: var(--vp-accent-red-text); }
  .note-preview pre { background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px; overflow-x: auto; margin: 8px 0; }
  .note-preview pre code { background: transparent; padding: 0; }
  .note-preview blockquote { border-left: 2px solid var(--vp-accent-blue); padding-left: 8px; margin: 6px 0; color: var(--vp-text-muted); }
  .note-preview a { color: var(--vp-accent-blue); }
`;

export default function NotesWidget({
  widgetId,
  config = {},
}: {
  widgetId: string;
  config?: NotesConfig;
}) {
  const projectPath = useUIStore((s) => s.selectedProject?.path);
  const homeDir = useSettingsStore((s) => s.homeDir);
  const saverRef = useRef(createDebouncedSaver(500));
  const dataDir = projectPath && homeDir ? getProjectDataDir(homeDir, projectPath) : null;
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [search, setSearch] = useState("");
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(config.category ?? null);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  useEffect(() => {
    if (!dataDir) return;
    try {
      const filePath = `${dataDir}/notes.json`;
      const data = loadJsonFile(filePath, { notes: [] as Note[] });
      if (data.notes && data.notes.length > 0) {
        setNotes(data.notes);
        setActiveNoteId(data.notes[0].id);
        setEditContent(data.notes[0].content);
        setEditTitle(data.notes[0].title);
      }
    } catch {}
  }, [dataDir]);

  useEffect(() => {
    if (!dataDir || notes.length === 0) return;
    const filePath = `${dataDir}/notes.json`;
    saverRef.current(filePath, { notes });
  }, [notes, dataDir]);

  const activeNote = notes.find((n) => n.id === activeNoteId);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    notes.forEach((n) => cats.add(n.category));
    return Array.from(cats);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (selectedCategory && n.category !== selectedCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
      }
      return true;
    });
  }, [notes, selectedCategory, search]);

  const createNote = () => {
    const newNote: Note = {
      id: `note-${Date.now()}`,
      title: "Untitled Note",
      content: "",
      category: selectedCategory || "General",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotes([newNote, ...notes]);
    setActiveNoteId(newNote.id);
    setEditContent(newNote.content);
    setEditTitle(newNote.title);
    setViewMode("edit");
  };

  const deleteNote = (id: string) => {
    const newNotes = notes.filter((n) => n.id !== id);
    setNotes(newNotes);
    if (activeNoteId === id) {
      if (newNotes.length > 0) {
        setActiveNoteId(newNotes[0].id);
        setEditContent(newNotes[0].content);
        setEditTitle(newNotes[0].title);
      } else {
        setActiveNoteId(null);
        setEditContent("");
        setEditTitle("");
      }
    }
  };

  const saveNote = () => {
    if (!activeNoteId) return;
    setSaving(true);
    setNotes((prev) =>
      prev.map((n) =>
        n.id === activeNoteId
          ? { ...n, title: editTitle, content: editContent, updatedAt: Date.now() }
          : n
      )
    );
    setTimeout(() => {
      setSaving(false);
      setLastSaved(Date.now());
    }, 300);
  };

  const exportNote = () => {
    if (!activeNote) return;
    const blob = new Blob([activeNote.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeNote.title.replace(/[^a-z0-9]/gi, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addCategory = () => {
    if (!newCategory.trim()) return;
    if (!categories.includes(newCategory.trim())) {
      setSelectedCategory(newCategory.trim());
    }
    setNewCategory("");
    setShowCategoryInput(false);
  };

  const previewHtml = useMemo(() => {
    if (!editContent) return "";
    try {
      return marked.parse(editContent) as string;
    } catch {
      return "";
    }
  }, [editContent]);

  return (
    <div className="h-full flex flex-col">
      <style>{noteStyles}</style>

      <div
        className="flex items-center gap-2"
        style={{ padding: "4px 8px", borderBottom: "1px solid var(--vp-bg-surface-hover)" }}
      >
        <button
          onClick={createNote}
          style={{
            padding: "4px 8px",
            fontSize: 10,
            borderRadius: 4,
            background: "var(--vp-accent-blue-bg-hover)",
            border: "none",
            color: "var(--vp-accent-blue)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Plus size={10} /> New
        </button>

        <div
          className="flex items-center gap-1"
          style={{
            flex: 1,
            background: "var(--vp-bg-surface)",
            borderRadius: 4,
            padding: "2px 6px",
          }}
        >
          <Search size={10} style={{ color: "var(--vp-text-faint)" }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              fontSize: 10,
              color: "var(--vp-text-secondary)",
              outline: "none",
            }}
          />
        </div>

        <select
          value={selectedCategory || ""}
          onChange={(e) => setSelectedCategory(e.target.value || null)}
          style={{
            background: "var(--vp-bg-surface-hover)",
            border: "1px solid var(--vp-border-light)",
            borderRadius: 4,
            padding: "3px 6px",
            fontSize: 10,
            color: "var(--vp-text-muted)",
            outline: "none",
          }}
        >
          <option value="">All</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowCategoryInput(!showCategoryInput)}
          style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 4 }}
          title="Add category"
        >
          <Folder size={12} />
        </button>
      </div>

      {showCategoryInput && (
        <div
          className="flex gap-2"
          style={{ padding: "4px 8px", borderBottom: "1px solid var(--vp-bg-surface-hover)" }}
        >
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addCategory();
              if (e.key === "Escape") setShowCategoryInput(false);
            }}
            placeholder="New category..."
            autoFocus
            style={{
              flex: 1,
              background: "var(--vp-bg-surface)",
              border: "1px solid var(--vp-border-light)",
              borderRadius: 4,
              padding: "4px 8px",
              fontSize: 10,
              color: "var(--vp-text-primary)",
              outline: "none",
            }}
          />
          <button
            onClick={addCategory}
            style={{ padding: "4px 8px", fontSize: 10, background: "var(--vp-accent-blue-bg-hover)", border: "none", borderRadius: 4, color: "var(--vp-accent-blue)", cursor: "pointer" }}
          >
            Add
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div
          style={{
            width: 140,
            borderRight: "1px solid var(--vp-bg-surface-hover)",
            overflow: "auto",
          }}
        >
          {filteredNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => {
                setActiveNoteId(note.id);
                setEditContent(note.content);
                setEditTitle(note.title);
              }}
              style={{
                width: "100%",
                padding: "6px 8px",
                background: note.id === activeNoteId ? "var(--vp-bg-surface-hover)" : "transparent",
                border: "none",
                borderBottom: "1px solid var(--vp-bg-surface)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: note.id === activeNoteId ? 600 : 400,
                  color: note.id === activeNoteId ? "var(--vp-text-primary)" : "var(--vp-text-secondary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {note.title || "Untitled"}
              </div>
              <div style={{ fontSize: 9, color: "var(--vp-text-faint)", marginTop: 2 }}>
                {note.category}
              </div>
            </button>
          ))}
          {filteredNotes.length === 0 && (
            <div style={{ padding: 12, color: "var(--vp-text-faint)", fontSize: 10, textAlign: "center" }}>
              No notes
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {activeNote ? (
            <>
              <div
                className="flex items-center gap-2"
                style={{ padding: "4px 8px", borderBottom: "1px solid var(--vp-bg-surface)" }}
              >
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--vp-text-primary)",
                    outline: "none",
                  }}
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => setViewMode("edit")}
                    style={{
                      background: viewMode === "edit" ? "var(--vp-border-light)" : "none",
                      border: "none",
                      color: viewMode === "edit" ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
                      cursor: "pointer",
                      padding: 4,
                      borderRadius: 4,
                    }}
                  >
                    <Edit2 size={10} />
                  </button>
                  <button
                    onClick={() => setViewMode("preview")}
                    style={{
                      background: viewMode === "preview" ? "var(--vp-border-light)" : "none",
                      border: "none",
                      color: viewMode === "preview" ? "var(--vp-text-primary)" : "var(--vp-text-faint)",
                      cursor: "pointer",
                      padding: 4,
                      borderRadius: 4,
                    }}
                  >
                    <Eye size={10} />
                  </button>
                  <button
                    onClick={saveNote}
                    disabled={saving}
                    style={{
                      background: saving ? "var(--vp-accent-green-bg)" : "none",
                      border: "none",
                      color: saving ? "var(--vp-accent-green)" : "var(--vp-text-faint)",
                      cursor: "pointer",
                      padding: 4,
                      borderRadius: 4,
                    }}
                    title="Save"
                  >
                    <Check size={10} />
                  </button>
                  <button
                    onClick={exportNote}
                    style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 4 }}
                    title="Export"
                  >
                    <Download size={10} />
                  </button>
                  <button
                    onClick={() => deleteNote(activeNote.id)}
                    style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 4 }}
                    title="Delete"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-auto" style={{ padding: 8 }}>
                {viewMode === "edit" ? (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Write your notes here... (Markdown supported)"
                    style={{
                      width: "100%",
                      height: "100%",
                      background: "transparent",
                      border: "none",
                      color: "var(--vp-text-secondary)",
                      fontFamily: "monospace",
                      fontSize: 11,
                      outline: "none",
                      resize: "none",
                      lineHeight: 1.5,
                    }}
                  />
                ) : (
                  <div
                    className="note-preview"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                    style={{ fontSize: 12 }}
                  />
                )}
              </div>

              {lastSaved && (
                <div style={{ padding: "2px 8px", fontSize: 9, color: "var(--vp-text-subtle)", textAlign: "right" }}>
                  Saved {new Date(lastSaved).toLocaleTimeString()}
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center" style={{ color: "var(--vp-text-faint)" }}>
              <span style={{ fontSize: 12 }}>Select or create a note</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
