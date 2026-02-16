import { useState, useEffect, useMemo, useRef } from "react";
import { invoke, send } from "../../../lib/ipc";
import { useTerminalStore } from "../../../stores/terminalStore";
import { useSettingsStore } from "../../../stores/settingsStore";
import { loadJsonFile, createDebouncedSaver } from "../../../lib/persistence";
import type { QuickCommandConfig } from "../../../types/widget";
import { Play, Star, Plus, RefreshCw, Package, Terminal, Settings, Trash2, Search } from "lucide-react";

interface Command {
  id: string;
  label: string;
  cmd: string;
  icon?: string;
  category: "git" | "npm" | "docker" | "python" | "general" | "custom" | "package";
  source: "default" | "custom" | "package";
  favorite?: boolean;
}

const DEFAULT_COMMANDS: Command[] = [
  // Git
  { id: "git-pull", label: "Git Pull", cmd: "git pull", icon: "↓", category: "git", source: "default" },
  { id: "git-push", label: "Git Push", cmd: "git push", icon: "↑", category: "git", source: "default" },
  { id: "git-stash", label: "Git Stash", cmd: "git stash", icon: "📦", category: "git", source: "default" },
  { id: "git-status", label: "Git Status", cmd: "git status", icon: "📋", category: "git", source: "default" },
  { id: "git-log", label: "Git Log", cmd: "git log --oneline -10", icon: "📜", category: "git", source: "default" },
  { id: "git-diff", label: "Git Diff", cmd: "git diff --stat", icon: "📊", category: "git", source: "default" },
  { id: "git-branch", label: "Git Branch", cmd: "git branch", icon: "🌿", category: "git", source: "default" },
  // NPM
  { id: "npm-install", label: "NPM Install", cmd: "npm install", icon: "📥", category: "npm", source: "default" },
  { id: "npm-dev", label: "NPM Dev", cmd: "npm run dev", icon: "▶", category: "npm", source: "default" },
  { id: "npm-build", label: "NPM Build", cmd: "npm run build", icon: "🔨", category: "npm", source: "default" },
  { id: "npm-test", label: "NPM Test", cmd: "npm test", icon: "🧪", category: "npm", source: "default" },
  { id: "npm-lint", label: "NPM Lint", cmd: "npm run lint", icon: "🔍", category: "npm", source: "default" },
  { id: "npm-format", label: "NPM Format", cmd: "npm run format", icon: "✨", category: "npm", source: "default" },
  // Docker
  { id: "docker-up", label: "Docker Up", cmd: "docker compose up -d", icon: "🐳", category: "docker", source: "default" },
  { id: "docker-down", label: "Docker Down", cmd: "docker compose down", icon: "⬇", category: "docker", source: "default" },
  { id: "docker-ps", label: "Docker PS", cmd: "docker ps", icon: "📋", category: "docker", source: "default" },
  // Python
  { id: "pip-install", label: "Pip Install", cmd: "pip install -r requirements.txt", icon: "🐍", category: "python", source: "default" },
  { id: "py-server", label: "Django Server", cmd: "python manage.py runserver", icon: "🚀", category: "python", source: "default" },
  // General
  { id: "clear-cache", label: "Clear Cache", cmd: "rm -rf node_modules/.cache", icon: "🗑", category: "general", source: "default" },
  { id: "prisma-studio", label: "Prisma Studio", cmd: "npx prisma studio", icon: "💎", category: "general", source: "default" },
];

const CATEGORY_LABELS: Record<string, string> = {
  git: "Git",
  npm: "NPM",
  docker: "Docker",
  python: "Python",
  general: "General",
  custom: "Custom",
  package: "Package Scripts",
};

export default function QuickCommandWidget({
  widgetId,
  config = {},
}: {
  widgetId: string;
  config?: QuickCommandConfig;
}) {
  const [customCommands, setCustomCommands] = useState<Command[]>(config.customCommands?.map((c) => ({ ...c, id: `custom-${c.label}`, category: "custom" as const, source: "custom" as const })) ?? []);
  const [packageScripts, setPackageScripts] = useState<Command[]>([]);
  const [favorites, setFavorites] = useState<string[]>(config.favorites ?? []);
  const [filter, setFilter] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCmd, setNewCmd] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "favorites" | "package">("all");
  const homeDir = useSettingsStore((s) => s.homeDir);
  const saverRef = useRef(createDebouncedSaver(500));

  const activeSessionId = useTerminalStore((s) => s.activeSessionId);

  useEffect(() => {
    if (!homeDir) return;
    try {
      const filePath = `${homeDir}/.praxis/quick-commands.json`;
      const data = loadJsonFile(filePath, { customCommands: [] as Command[], favorites: [] as string[] });
      if (data.customCommands) setCustomCommands(data.customCommands);
      if (data.favorites) setFavorites(data.favorites);
    } catch {}
  }, [homeDir]);

  useEffect(() => {
    if (!homeDir) return;
    const filePath = `${homeDir}/.praxis/quick-commands.json`;
    saverRef.current(filePath, { customCommands, favorites });
  }, [customCommands, favorites, homeDir]);

  useEffect(() => {
    if (config.loadPackageScripts !== false) loadPackageScripts();
  }, [config.loadPackageScripts]);

  const loadPackageScripts = async () => {
    try {
      const pkg = await invoke<{ scripts?: Record<string, string> }>("read_package_json");
      if (pkg?.scripts) {
        const scripts = Object.entries(pkg.scripts).map(([name, cmd]) => ({
          id: `pkg-${name}`,
          label: name,
          cmd: `npm run ${name}`,
          icon: "📜",
          category: "package" as const,
          source: "package" as const,
        }));
        setPackageScripts(scripts);
      }
    } catch {
      setPackageScripts([]);
    }
  };

  const allCommands = useMemo(() => [...DEFAULT_COMMANDS, ...customCommands, ...packageScripts], [customCommands, packageScripts]);

  const filteredCommands = useMemo(() => {
    let commands = allCommands;
    if (activeTab === "favorites") commands = commands.filter((c) => favorites.includes(c.id));
    else if (activeTab === "package") commands = packageScripts;
    if (filter) {
      const q = filter.toLowerCase();
      commands = commands.filter((c) => c.label.toLowerCase().includes(q) || c.cmd.toLowerCase().includes(q));
    }
    return commands;
  }, [allCommands, activeTab, filter, favorites, packageScripts]);

  // Group by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filteredCommands) {
      const cat = cmd.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  const run = async (cmd: string) => {
    setRunning(true);
    setOutput(null);
    try {
      const result = await invoke<string>("run_quick_command", { command: cmd });
      setOutput(result.slice(0, 2000));
    } catch (e: any) {
      setOutput(`Error: ${e.message || e}`);
    }
    setRunning(false);
  };

  const sendToTerminal = (cmd: string) => {
    if (!activeSessionId) return;
    send("write_pty", { id: activeSessionId, data: cmd + "\r" });
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]);
  };

  const addCustomCommand = () => {
    if (!newLabel.trim() || !newCmd.trim()) return;
    const newCommand: Command = {
      id: `custom-${Date.now()}`,
      label: newLabel.trim(),
      cmd: newCmd.trim(),
      icon: newIcon.trim() || "⚡",
      category: "custom",
      source: "custom",
    };
    setCustomCommands([...customCommands, newCommand]);
    setNewLabel("");
    setNewCmd("");
    setNewIcon("");
    setShowAddForm(false);
  };

  const deleteCustomCommand = (id: string) => {
    setCustomCommands((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="h-full flex flex-col" style={{ gap: 6, padding: 8 }}>
      {/* Search + actions */}
      <div className="flex gap-2">
        <div className="flex items-center gap-1" style={{ flex: 1, background: "var(--vp-bg-surface)", borderRadius: 6, padding: "4px 8px" }}>
          <Search size={12} style={{ color: "var(--vp-text-faint)" }} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search commands..."
            style={{ flex: 1, background: "transparent", border: "none", fontSize: 11, color: "var(--vp-text-primary)", outline: "none" }}
          />
        </div>
        <button onClick={loadPackageScripts} disabled={running} style={{ background: "none", border: "none", color: "var(--vp-text-faint)", cursor: "pointer", padding: 6 }} title="Reload package scripts">
          <RefreshCw size={12} className={running ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{ background: showAddForm ? "var(--vp-accent-blue-bg-hover)" : "none", border: "none", color: showAddForm ? "var(--vp-accent-blue)" : "var(--vp-text-faint)", cursor: "pointer", padding: 6, borderRadius: 4 }}
          title="Add command"
        >
          <Plus size={12} />
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div style={{ background: "var(--vp-bg-surface)", borderRadius: 6, padding: 8 }}>
          <div style={{ marginBottom: 6, fontSize: 11, color: "var(--vp-text-muted)" }}>Add Custom Command</div>
          <div className="flex gap-2" style={{ marginBottom: 6 }}>
            <input type="text" value={newIcon} onChange={(e) => setNewIcon(e.target.value)} placeholder="Icon" style={{ width: 40, background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-light)", borderRadius: 4, padding: "4px 6px", fontSize: 11, color: "var(--vp-text-primary)", textAlign: "center" }} />
            <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label" style={{ flex: 1, background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-light)", borderRadius: 4, padding: "4px 8px", fontSize: 11, color: "var(--vp-text-primary)" }} />
          </div>
          <div className="flex gap-2">
            <input type="text" value={newCmd} onChange={(e) => setNewCmd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustomCommand()} placeholder="Command" style={{ flex: 1, background: "var(--vp-bg-surface-hover)", border: "1px solid var(--vp-border-light)", borderRadius: 4, padding: "4px 8px", fontSize: 11, color: "var(--vp-text-primary)", fontFamily: "monospace" }} />
            <button onClick={addCustomCommand} disabled={!newLabel.trim() || !newCmd.trim()} style={{ padding: "4px 10px", fontSize: 10, borderRadius: 4, background: "var(--vp-accent-blue-bg-hover)", border: "none", color: "var(--vp-accent-blue)", cursor: "pointer" }}>Add</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {(["all", "favorites", "package"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ padding: "3px 8px", fontSize: 10, borderRadius: 4, background: activeTab === tab ? "var(--vp-border-light)" : "transparent", border: "none", color: activeTab === tab ? "var(--vp-text-primary)" : "var(--vp-text-dim)", cursor: "pointer", textTransform: "capitalize" }}
          >
            {tab === "favorites" && <Star size={10} style={{ marginRight: 4 }} />}
            {tab}
            {tab === "favorites" && favorites.length > 0 && <span style={{ marginLeft: 4, opacity: 0.6 }}>{favorites.length}</span>}
            {tab === "package" && packageScripts.length > 0 && <span style={{ marginLeft: 4, opacity: 0.6 }}>{packageScripts.length}</span>}
          </button>
        ))}
      </div>

      {/* Command list */}
      <div className="flex-1 overflow-auto" style={{ gap: 3, display: "flex", flexDirection: "column" }}>
        {output !== null ? (
          <div style={{ padding: 6 }}>
            <button onClick={() => setOutput(null)} style={{ fontSize: 10, color: "var(--vp-accent-blue)", background: "none", border: "none", cursor: "pointer", marginBottom: 6 }}>
              ← Back to commands
            </button>
            <pre style={{ fontSize: 10, color: "var(--vp-text-secondary)", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 6, margin: 0, maxHeight: 300, overflow: "auto", fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace" }}>
              {output}
            </pre>
          </div>
        ) : filteredCommands.length === 0 ? (
          <div style={{ padding: 12, color: "var(--vp-text-faint)", fontSize: 11, textAlign: "center" }}>No commands found</div>
        ) : (
          Object.entries(groupedCommands).map(([category, commands]) => (
            <div key={category}>
              {/* Category header */}
              {activeTab !== "package" && (
                <div style={{ fontSize: 9, color: "var(--vp-text-faint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", padding: "6px 4px 2px", marginTop: 4 }}>
                  {CATEGORY_LABELS[category] || category}
                </div>
              )}
              {commands.map((c) => (
                <div key={c.id} className="flex items-center gap-1" style={{ padding: "5px 6px", background: "var(--vp-bg-surface)", border: "1px solid var(--vp-bg-surface-hover)", borderRadius: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, width: 18, textAlign: "center", flexShrink: 0 }}>{c.icon}</span>
                  <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                    <div style={{ fontSize: 11, color: "var(--vp-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</div>
                    <div style={{ fontSize: 9, color: "var(--vp-text-subtle)", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.cmd}</div>
                  </div>
                  {/* Send to terminal */}
                  <button
                    onClick={() => sendToTerminal(c.cmd)}
                    disabled={!activeSessionId}
                    style={{ background: "none", border: "none", color: activeSessionId ? "var(--vp-accent-blue)" : "var(--vp-text-subtle)", cursor: activeSessionId ? "pointer" : "default", padding: 3, borderRadius: 3 }}
                    title={activeSessionId ? "Send to terminal" : "No active terminal"}
                  >
                    <Terminal size={11} />
                  </button>
                  {/* Run in background */}
                  <button
                    onClick={() => run(c.cmd)}
                    disabled={running}
                    style={{ background: "none", border: "none", color: "var(--vp-accent-green)", cursor: "pointer", padding: 3, borderRadius: 3 }}
                    title="Run and show output"
                  >
                    <Play size={11} />
                  </button>
                  {/* Favorite */}
                  <button onClick={() => toggleFavorite(c.id)} style={{ background: "none", border: "none", color: favorites.includes(c.id) ? "var(--vp-accent-amber)" : "var(--vp-text-subtle)", cursor: "pointer", padding: 2 }}>
                    <Star size={10} fill={favorites.includes(c.id) ? "var(--vp-accent-amber)" : "none"} />
                  </button>
                  {/* Delete custom */}
                  {c.source === "custom" && (
                    <button
                      onClick={() => deleteCustomCommand(c.id)}
                      style={{ background: "none", border: "none", color: "var(--vp-text-subtle)", cursor: "pointer", padding: 2 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vp-accent-red-text)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vp-text-subtle)")}
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
