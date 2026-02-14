export interface WidgetDefinition {
  type: string;
  name: string;
  description: string;
  icon: string;
  category: "core" | "monitoring" | "development" | "productivity";
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize?: { w: number; h: number };
  singleton?: boolean;
  panelWidget?: boolean;
}

export interface WidgetInstance {
  id: string;
  type: string;
  config?: Record<string, any>;
}

export interface WidgetLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BaseWidgetConfig {
  refreshInterval?: number;
  theme?: "dark" | "light";
}

export interface SystemMonitorConfig extends BaseWidgetConfig {
  showNetworkIO?: boolean;
  showDisk?: boolean;
  alertThresholds?: {
    cpu?: number;
    mem?: number;
    disk?: number;
  };
  historyLength?: number;
}

export interface PortMonitorConfig extends BaseWidgetConfig {
  filterProtocol?: "all" | "tcp" | "udp";
  showSystemPorts?: boolean;
}

export interface LogViewerConfig extends BaseWidgetConfig {
  paths?: string[];
  maxLines?: number;
  autoScroll?: boolean;
  highlightPatterns?: string[];
  filterRegex?: string;
  filterText?: string;
  useRegex?: boolean;
}

export interface AgentMonitorConfig extends BaseWidgetConfig {
  filterTypes?: ("claude-code" | "opencode" | "aider" | "unknown")[];
  showIdleAgents?: boolean;
}

export interface GitStatusConfig extends BaseWidgetConfig {
  showUntracked?: boolean;
  autoRefresh?: boolean;
}

export interface DiffViewerConfig extends BaseWidgetConfig {
  viewMode?: "unified" | "split";
  selectedFile?: string;
  showLineNumbers?: boolean;
}

export interface MarkdownPreviewConfig extends BaseWidgetConfig {
  content?: string;
  filePath?: string;
  syncScroll?: boolean;
  showLineNumbers?: boolean;
  viewMode?: "edit" | "preview" | "split";
}

export interface NotesConfig extends BaseWidgetConfig {
  category?: string;
  enableMarkdown?: boolean;
  autoSave?: boolean;
}

export interface QuickCommandConfig extends BaseWidgetConfig {
  customCommands?: Array<{
    label: string;
    cmd: string;
    icon?: string;
  }>;
  loadPackageScripts?: boolean;
  favorites?: string[];
}

export interface PomodoroConfig extends BaseWidgetConfig {
  focusDuration?: number;
  breakDuration?: number;
  longBreakDuration?: number;
  sessionsUntilLongBreak?: number;
  soundEnabled?: boolean;
  dailyGoal?: number;
}

export interface BookmarksConfig extends BaseWidgetConfig {
  groups?: Array<{
    id: string;
    name: string;
    collapsed?: boolean;
  }>;
}

export interface TerminalConfig extends BaseWidgetConfig {
  profile?: string;
  initialCommand?: string;
  fontSize?: number;
}

export interface BrowserConfig extends BaseWidgetConfig {
  initialUrl?: string;
  adBlockEnabled?: boolean;
}

export interface TasksConfig extends BaseWidgetConfig {
  filter?: "all" | "todo" | "in_progress" | "done";
  viewMode?: "kanban" | "list";
}

export interface FileExplorerConfig extends BaseWidgetConfig {
  rootPath?: string;
  fileExtensions?: string[];
  showHidden?: boolean;
  previewEnabled?: boolean;
}

export interface PromptLibraryConfig extends BaseWidgetConfig {
  category?: string;
}

export type AgentType = "claude-code" | "opencode" | "aider" | "unknown";
export type AgentStatus = "active" | "idle" | "stopped" | "error";

export type WidgetConfigMap = {
  "system-monitor": SystemMonitorConfig;
  "port-monitor": PortMonitorConfig;
  "log-viewer": LogViewerConfig;
  "agent-monitor": AgentMonitorConfig;
  "git-status": GitStatusConfig;
  "diff-viewer": DiffViewerConfig;
  "markdown-preview": MarkdownPreviewConfig;
  notes: NotesConfig;
  "quick-command": QuickCommandConfig;
  pomodoro: PomodoroConfig;
  bookmarks: BookmarksConfig;
  terminal: TerminalConfig;
  browser: BrowserConfig;
  tasks: TasksConfig;
  "file-explorer": FileExplorerConfig;
  "prompt-library": PromptLibraryConfig;
};
