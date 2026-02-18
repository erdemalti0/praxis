# Praxis

<p align="center">
  <img src="./assets/praxis.gif" alt="Praxis Demo" width="800" />
</p>

**AI-Powered Development Workspace**

Praxis is a desktop application that lets you orchestrate multiple AI coding agents side-by-side. Spawn Claude Code, OpenCode, Aider, Gemini CLI, AMP, and more — all in a unified workspace with split terminals, a process runner, widgets, a built-in browser, and mission planning.

## Features

### Multi-Agent Terminal
- Spawn and manage multiple AI agents simultaneously
- Split panes (horizontal/vertical) for side-by-side work
- 7 layout presets: Side by Side, Stacked, Three Columns, Three Rows, 2x2 Grid, Main + 2 Right, Main + 2 Bottom
- Drag-and-drop to rearrange terminal panes and swap sessions between panes
- Drop files and images directly into terminals (paths auto-pasted with bracket paste mode)
- Agent auto-detection: when you launch an AI agent in a plain shell, Praxis detects it and updates the UI in real time
- Terminal search (Ctrl+F / Cmd+F)
- 8 built-in terminal color themes (Dracula, Monokai, Solarized, Nord, One Dark, Gruvbox, and more)
- Full custom terminal theme editor with per-color control

### Process Runner
- Create and manage run configurations for dev servers and build commands
- Quick-start presets: npm, yarn, pnpm, bun, Flutter, Go, Cargo, Python, and custom commands
- Live process output streaming with clickable URL detection
- Automatic port detection — see which ports your processes open
- Emulator awareness — detects connected Android devices and iOS simulators
- Auto-restart toggle and recursive child process cleanup on stop

### Workspaces
- Organize work into named, color-coded workspaces
- Emoji icons for quick identification (pick from curated set)
- Drag to reorder workspace tabs
- Per-workspace terminal layouts and widget dashboards
- Persist and restore across sessions

### Widget Dashboard
- Drag-and-drop grid layout with resizable widgets
- Built-in widgets:
  - **Agent Monitor** — track agent activity
  - **System Monitor** — CPU, memory, disk
  - **Port Monitor** — active network ports
  - **Git Status** — branch, staged files, diffs
  - **Notes** — markdown editor with preview
  - **Bookmarks** — save and organize links
  - **Pomodoro Timer** — focus/break cycles
  - **Prompt Library** — reusable prompt templates
  - **Quick Commands** — saved terminal commands
  - **Log Viewer** — real-time log streaming
  - **Diff Viewer** — side-by-side code diffs
  - **Markdown Preview** — live markdown rendering
  - **File Explorer** — browse project files
  - **Dependency Dashboard** — view outdated packages, run npm audit, track vulnerabilities
  - **Env Manager** — view and edit .env files with security-first UX (hidden by default, reveal on click)
  - **Clipboard History** — persistent snippet storage with search, pin, and send-to-terminal
  - **HTTP Client** — lightweight REST client with request history, custom headers, and SSRF protection

### Built-in Browser
- Tabbed browser with navigation
- Tab groups and pinning
- Persistent sessions across restarts
- Bookmark integration
- Keyboard shortcuts (Ctrl+T / Cmd+T, Ctrl+W / Cmd+W, etc.)

### Mission Planner
- Create multi-step mission workflows
- DAG-based flow chart visualization with multi-dependency support
- AI-assisted mission generation from natural language descriptions
- Collapsible mission panel with expand/collapse all toggle
- Dependency indicators showing step prerequisites in panel view
- Hierarchical step tree with visual guide lines and chevron toggles
- Progress badges and inline progress bars per mission
- Assign steps to AI agents
- Track progress and completion
- Export and import missions as JSON

### Task Board
- Kanban-style task management (Todo, In Progress, Done)
- Tag support with auto-coloring
- Drag to reorder
- Assign tasks to running agents

### Settings
- Custom themes with full color token editor
- Terminal theme editor with 20 color slots (background, foreground, cursor, selection, 8 normal + 8 bright colors)
- Theme import and export (both app and terminal themes as portable JSON)
- Keyboard shortcut rebinding with conflict detection
- Reset individual shortcuts or restore all defaults

### Usage Tracking
- Claude Code rate limit monitoring (OAuth)
- Claude Code cost tracking (per-model breakdown)
- Gemini quota monitoring (Pro/Flash tiers)

### Security
- Filesystem access restricted from renderer — sensitive directories (`.ssh`, `.gnupg`, `.aws`, `.kube`) are blocked
- Webview security enforcement — all embedded webviews run with `contextIsolation: true` and `nodeIntegration: false`
- Cryptographically secure session IDs via `crypto.randomUUID()`
- HTTP Client blocks SSRF attempts to cloud metadata endpoints
- Environment variable values hidden by default in Env Manager widget

### Additional Features
- Command Palette (Ctrl+K / Cmd+K)
- Keyboard shortcuts help (?)
- Recent projects on startup
- Onboarding flow for new users
- Toast notifications
- Session persistence across restarts
- Keep-alive panel architecture for instant tab switching

## Tech Stack

- **Frontend:** React 19, TypeScript, Zustand
- **Terminal:** xterm.js with WebGL renderer
- **Desktop:** Electron with electron-vite
- **PTY:** node-pty for native terminal processes
- **Styling:** CSS variables with custom theme engine
- **Icons:** Lucide React
- **Widgets:** react-grid-layout
- **Markdown:** marked.js
- **Syntax:** highlight.js
- **Testing:** Vitest
- **Linting:** ESLint with TypeScript + React Hooks plugins

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/erdemalti0/praxis.git
cd praxis

# Install dependencies
npm install
```

### Development

```bash
npm run dev
```

### Testing & Linting

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint the codebase
npm run lint
```

### Build & Package

```bash
# Build for production (renderer + electron)
npm run build

# Package for current platform
npm run dist

# Package for macOS
npm run dist:mac
```

## Data Storage

```
~/.praxis/
  settings.json          # Global settings, themes, agents
  ui-state.json          # Layout, sidebar, workspaces
  browser-state.json     # Browser tabs, groups
  browser-favorites.json # Browser bookmarks
  prompt-library.json    # Saved prompts
  quick-commands.json    # Saved commands

{project}/.praxis/
  missions.json          # Mission workflows
  tasks.json             # Task board
  widgets.json           # Widget layouts
  notes.json             # Notes
  bookmarks.json         # Bookmarks
  pomodoro.json          # Timer state
  run-configs.json       # Process runner configurations
  clipboard-history.json # Clipboard snippets
  http-requests.json     # HTTP client history
```

## License

MIT
