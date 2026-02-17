import { useState, useEffect, useMemo, useRef } from "react";
import { Star, Plus, Search, Copy, Trash2, Edit3, Check, Download, Upload, BookOpen } from "lucide-react";
import { useSettingsStore } from "../../../stores/settingsStore";
import { loadJsonFile, createDebouncedSaver } from "../../../lib/persistence";

interface Prompt {
  id: string;
  title: string;
  content: string;
  category: string;
  favorite: boolean;
  usageCount: number;
  createdAt: number;
}

const CATEGORIES = ["all", "refactor", "test", "debug", "generate", "explain", "custom"] as const;

const CATEGORY_COLORS: Record<string, string> = {
  refactor: "#a78bfa",
  test: "#34d399",
  debug: "#f87171",
  generate: "#60a5fa",
  explain: "var(--vp-accent-amber)",
  custom: "#f97316",
};

const DEFAULT_PROMPTS: Prompt[] = [
  { id: "d1", title: "Refactor Code", content: "Refactor this code to be more readable and maintainable. Keep the same functionality but improve structure, naming, and organization.", category: "refactor", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d2", title: "Write Unit Tests", content: "Write comprehensive unit tests for this code. Cover edge cases, error scenarios, and happy paths. Use the existing test framework.", category: "test", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d3", title: "Debug & Fix", content: "Debug this code and fix the issue. Explain what was wrong and why your fix works.", category: "debug", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d4", title: "Add Error Handling", content: "Add proper error handling to this code. Include try-catch blocks, validation, and meaningful error messages.", category: "refactor", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d5", title: "Convert to TypeScript", content: "Convert this code to TypeScript with proper type definitions, interfaces, and type safety.", category: "refactor", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d6", title: "Optimize Performance", content: "Optimize this code for better performance. Identify bottlenecks and suggest improvements with explanations.", category: "refactor", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d7", title: "Explain Code", content: "Explain what this code does step by step. Include the purpose, data flow, and any important patterns used.", category: "explain", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d8", title: "Generate API Endpoint", content: "Generate a REST API endpoint for {{resource}}. Include route handler, validation, error handling, and response format.", category: "generate", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d9", title: "Generate Component", content: "Generate a React component for {{description}}. Use TypeScript, proper props interface, and follow existing project patterns.", category: "generate", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d10", title: "Write Documentation", content: "Write clear documentation for this code. Include usage examples, parameters, return values, and any important notes.", category: "explain", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d11", title: "Security Review", content: "Review this code for security vulnerabilities. Check for injection, XSS, auth issues, and other OWASP top 10 concerns.", category: "debug", favorite: false, usageCount: 0, createdAt: 0 },
  { id: "d12", title: "Add Logging", content: "Add structured logging to this code. Include appropriate log levels (debug, info, warn, error) and useful context.", category: "refactor", favorite: false, usageCount: 0, createdAt: 0 },
];

export default function PromptLibraryWidget({
  widgetId: _widgetId,
}: {
  widgetId: string;
  config?: Record<string, any>;
}) {
  const [prompts, setPrompts] = useState<Prompt[]>(DEFAULT_PROMPTS);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add form state
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("custom");

  const homeDir = useSettingsStore((s) => s.homeDir);
  const saverRef = useRef(createDebouncedSaver(500));

  useEffect(() => {
    if (!homeDir) return;
    try {
      const filePath = `${homeDir}/.praxis/prompt-library.json`;
      const data = loadJsonFile(filePath, { prompts: DEFAULT_PROMPTS, favorites: [] as string[] });
      if (data.prompts) setPrompts(data.prompts);
      if (data.favorites) setFavorites(data.favorites);
    } catch {}
  }, [homeDir]);

  useEffect(() => {
    if (!homeDir) return;
    const filePath = `${homeDir}/.praxis/prompt-library.json`;
    saverRef.current(filePath, { prompts, favorites });
  }, [prompts, favorites, homeDir]);

  const filteredPrompts = useMemo(() => {
    let result = prompts;

    if (activeCategory === "favorites") {
      result = result.filter((p) => favorites.includes(p.id));
    } else if (activeCategory !== "all") {
      result = result.filter((p) => p.category === activeCategory);
    }

    if (filter) {
      const q = filter.toLowerCase();
      result = result.filter(
        (p) => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
      );
    }

    return result.sort((a, b) => {
      const aFav = favorites.includes(a.id) ? 1 : 0;
      const bFav = favorites.includes(b.id) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return b.usageCount - a.usageCount;
    });
  }, [prompts, activeCategory, filter, favorites]);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = async (prompt: Prompt) => {
    try {
      await navigator.clipboard.writeText(prompt.content);
      setCopiedId(prompt.id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopiedId(null);
      }, 1500);
      setPrompts((prev) =>
        prev.map((p) => (p.id === prompt.id ? { ...p, usageCount: p.usageCount + 1 } : p))
      );
    } catch {}
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  };

  const addPrompt = () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    const newPrompt: Prompt = {
      id: `custom-${Date.now()}`,
      title: newTitle.trim(),
      content: newContent.trim(),
      category: newCategory,
      favorite: false,
      usageCount: 0,
      createdAt: Date.now(),
    };
    setPrompts((prev) => [...prev, newPrompt]);
    setNewTitle("");
    setNewContent("");
    setNewCategory("custom");
    setShowAddForm(false);
  };

  const deletePrompt = (id: string) => {
    setPrompts((prev) => prev.filter((p) => p.id !== id));
    setFavorites((prev) => prev.filter((f) => f !== id));
  };

  const updatePrompt = (id: string, title: string, content: string) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, title, content } : p))
    );
    setEditingId(null);
  };

  const exportPrompts = () => {
    const data = JSON.stringify({ prompts, favorites }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prompt-library.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importPrompts = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data.prompts) setPrompts(data.prompts);
          if (data.favorites) setFavorites(data.favorites);
        } catch {}
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="h-full flex flex-col" style={{ gap: 6, padding: 8 }}>
      {/* Search + Actions */}
      <div className="flex gap-2">
        <div
          className="flex items-center gap-1"
          style={{ flex: 1, background: "var(--vp-bg-surface)", borderRadius: 6, padding: "4px 8px" }}
        >
          <Search size={12} style={{ color: "var(--vp-text-faint)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search prompts..."
            style={{ flex: 1, background: "transparent", border: "none", fontSize: 11, color: "var(--vp-text-primary)", outline: "none" }}
          />
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} style={{ background: showAddForm ? "var(--vp-accent-blue-bg-hover)" : "none", border: "none", color: showAddForm ? "var(--vp-accent-blue)" : "var(--vp-text-faint)", cursor: "pointer", padding: 6, borderRadius: 4 }} title="Add prompt">
          <Plus size={12} />
        </button>
        <button onClick={exportPrompts} style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 6 }} title="Export">
          <Download size={12} />
        </button>
        <button onClick={importPrompts} style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 6 }} title="Import">
          <Upload size={12} />
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div style={{ background: "var(--vp-bg-surface)", borderRadius: 6, padding: 8 }}>
          <div style={{ marginBottom: 6, fontSize: 11, color: "var(--vp-text-muted)" }}>New Prompt</div>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Title"
            style={{ width: "100%", background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-light)", borderRadius: 4, padding: "4px 8px", fontSize: 11, color: "var(--vp-text-primary)", marginBottom: 6, boxSizing: "border-box" }}
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Prompt content... Use {{placeholder}} for variables"
            rows={3}
            style={{ width: "100%", background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-light)", borderRadius: 4, padding: "4px 8px", fontSize: 11, color: "var(--vp-text-primary)", resize: "vertical", fontFamily: "inherit", marginBottom: 6, boxSizing: "border-box" }}
          />
          <div className="flex gap-2 items-center">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              style={{ flex: 1, background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-light)", borderRadius: 4, padding: "4px 8px", fontSize: 11, color: "var(--vp-text-primary)" }}
            >
              {CATEGORIES.filter((c) => c !== "all").map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <button
              onClick={addPrompt}
              disabled={!newTitle.trim() || !newContent.trim()}
              style={{ padding: "4px 12px", fontSize: 10, borderRadius: 4, background: "var(--vp-accent-blue-bg-hover)", border: "none", color: "var(--vp-accent-blue)", cursor: "pointer" }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex gap-1 flex-wrap">
        <button
          onClick={() => setActiveCategory("all")}
          style={{ padding: "3px 8px", fontSize: 10, borderRadius: 4, background: activeCategory === "all" ? "var(--vp-border-light)" : "transparent", border: "none", color: activeCategory === "all" ? "var(--vp-text-primary)" : "var(--vp-text-dim)", cursor: "pointer" }}
        >
          All ({prompts.length})
        </button>
        <button
          onClick={() => setActiveCategory("favorites")}
          style={{ padding: "3px 8px", fontSize: 10, borderRadius: 4, background: activeCategory === "favorites" ? "var(--vp-border-light)" : "transparent", border: "none", color: activeCategory === "favorites" ? "var(--vp-accent-amber)" : "var(--vp-text-dim)", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
        >
          <Star size={9} fill={activeCategory === "favorites" ? "var(--vp-accent-amber)" : "none"} /> {favorites.length}
        </button>
        {CATEGORIES.filter((c) => c !== "all").map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: "3px 8px",
              fontSize: 10,
              borderRadius: 4,
              background: activeCategory === cat ? `${CATEGORY_COLORS[cat]}20` : "transparent",
              border: "none",
              color: activeCategory === cat ? CATEGORY_COLORS[cat] : "var(--vp-text-dim)",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Prompt List */}
      <div className="flex-1 overflow-auto" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {filteredPrompts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: "var(--vp-text-faint)" }}>
            <BookOpen size={28} />
            <p style={{ fontSize: 11 }}>No prompts found</p>
          </div>
        ) : (
          filteredPrompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              isFavorite={favorites.includes(prompt.id)}
              isEditing={editingId === prompt.id}
              isCopied={copiedId === prompt.id}
              onCopy={() => handleCopy(prompt)}
              onToggleFavorite={() => toggleFavorite(prompt.id)}
              onDelete={() => deletePrompt(prompt.id)}
              onStartEdit={() => setEditingId(prompt.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(title, content) => updatePrompt(prompt.id, title, content)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PromptCard({
  prompt,
  isFavorite,
  isEditing,
  isCopied,
  onCopy,
  onToggleFavorite,
  onDelete,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  prompt: Prompt;
  isFavorite: boolean;
  isEditing: boolean;
  isCopied: boolean;
  onCopy: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (title: string, content: string) => void;
}) {
  const [editTitle, setEditTitle] = useState(prompt.title);
  const [editContent, setEditContent] = useState(prompt.content);
  const catColor = CATEGORY_COLORS[prompt.category] || "#888";

  if (isEditing) {
    return (
      <div style={{ background: "var(--vp-bg-surface)", border: "1px solid var(--vp-accent-blue-border)", borderRadius: 6, padding: 8 }}>
        <input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          style={{ width: "100%", background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-light)", borderRadius: 4, padding: "4px 8px", fontSize: 11, color: "var(--vp-text-primary)", marginBottom: 4, boxSizing: "border-box" }}
        />
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={3}
          style={{ width: "100%", background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-light)", borderRadius: 4, padding: "4px 8px", fontSize: 11, color: "var(--vp-text-primary)", resize: "vertical", fontFamily: "inherit", marginBottom: 4, boxSizing: "border-box" }}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancelEdit} style={{ padding: "3px 8px", fontSize: 10, borderRadius: 4, background: "none", border: "1px solid var(--vp-border-light)", color: "var(--vp-text-muted)", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => onSaveEdit(editTitle, editContent)} style={{ padding: "3px 8px", fontSize: 10, borderRadius: 4, background: "var(--vp-accent-blue-bg-hover)", border: "none", color: "var(--vp-accent-blue)", cursor: "pointer" }}>
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ background: "var(--vp-bg-surface)", border: "1px solid var(--vp-bg-surface-hover)", borderRadius: 6, padding: "8px 10px" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface-hover)"; e.currentTarget.style.borderColor = "var(--vp-border-light)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--vp-bg-surface)"; e.currentTarget.style.borderColor = "var(--vp-bg-surface-hover)"; }}
    >
      <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${catColor}15`, color: catColor, textTransform: "capitalize" }}>
          {prompt.category}
        </span>
        <span style={{ fontSize: 11, color: "var(--vp-text-primary)", flex: 1, fontWeight: 500 }}>{prompt.title}</span>
        <div className="flex gap-1">
          <button onClick={onToggleFavorite} style={{ background: "none", border: "none", color: isFavorite ? "var(--vp-accent-amber)" : "var(--vp-text-subtle)", cursor: "pointer", padding: 2 }}>
            <Star size={11} fill={isFavorite ? "var(--vp-accent-amber)" : "none"} />
          </button>
          <button onClick={onStartEdit} style={{ background: "none", border: "none", color: "var(--vp-text-subtle)", cursor: "pointer", padding: 2 }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-accent-blue)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-subtle)")}>
            <Edit3 size={11} />
          </button>
          <button onClick={onCopy} style={{ background: "none", border: "none", color: isCopied ? "var(--vp-accent-green)" : "var(--vp-text-subtle)", cursor: "pointer", padding: 2 }} onMouseEnter={(e) => { if (!isCopied) e.currentTarget.style.color = "var(--vp-accent-blue)"; }} onMouseLeave={(e) => { if (!isCopied) e.currentTarget.style.color = "var(--vp-text-subtle)"; }}>
            {isCopied ? <Check size={11} /> : <Copy size={11} />}
          </button>
          {prompt.id.startsWith("custom-") && (
            <button onClick={onDelete} style={{ background: "none", border: "none", color: "var(--vp-text-subtle)", cursor: "pointer", padding: 2 }} onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-accent-red-text)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-subtle)")}>
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--vp-text-dim)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {prompt.content}
      </div>
      {prompt.usageCount > 0 && (
        <div style={{ fontSize: 9, color: "var(--vp-text-subtle)", marginTop: 4 }}>Used {prompt.usageCount}x</div>
      )}
    </div>
  );
}
