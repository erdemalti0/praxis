# Praxis

<p align="center">
  <img src="./assets/praxis.gif" alt="Praxis Demo" width="800" />
</p>

**AI-Powered Development Workspace**

Praxis is a cross-platform desktop application that lets you orchestrate multiple AI coding agents side-by-side. Spawn Claude Code, OpenCode, Aider, Gemini CLI, AMP, and more — all in a unified workspace with split terminals, widgets, a built-in browser, and mission planning.

## Features

### Multi-Agent Terminal
- Spawn and manage multiple AI agents simultaneously
- Split panes (horizontal/vertical) for side-by-side work
- Drag-and-drop to rearrange terminal panes
- Paste images directly into terminals
- Bracket paste mode for TUI compatibility
- Terminal search (Ctrl+F / Cmd+F)

### Workspaces
- Organize work into named, color-coded workspaces
- Emoji icons for quick identification
- Drag to reorder workspace tabs
- Per-workspace terminal layouts and widget dashboards
- Persist and restore across sessions

### Widget Dashboard
- Drag-and-drop grid layout with resizable widgets
- Built-in widgets:
  - Agent Monitor — track agent activity
  - System Monitor — CPU, memory, disk
  - Port Monitor — active network ports
  - Git Status — branch, staged files, diffs
  - Notes — markdown editor with preview
  - Bookmarks — save and organize links
  - Pomodoro Timer — focus/break cycles
  - Prompt Library — reusable prompt templates
  - Quick Commands — saved terminal commands
  - Log Viewer — real-time log streaming
  - Diff Viewer — side-by-side code diffs
  - Markdown Preview — live markdown rendering
  - File Explorer — browse project files

### Built-in Browser
- Tabbed browser with navigation
- Tab groups and pinning
- Persistent sessions across restarts
- Bookmark integration
- Keyboard shortcuts (Ctrl+T / Cmd+T, Ctrl+W / Cmd+W, etc.)

### Mission Planner
- Create multi-step mission workflows
- DAG-based flow chart visualization with multi-dependency support
- Collapsible mission panel with expand/collapse all toggle
- Dependency indicators showing step prerequisites in panel view
- Hierarchical step tree with visual guide lines and chevron toggles
- Progress badges and inline progress bars per mission
- Assign steps to AI agents
- Track progress and completion
- GPT-powered mission generation from natural language

### Task Board
- Kanban-style task management (Todo, In Progress, Done)
- Tag support with auto-coloring
- Drag to reorder
- Assign tasks to running agents

### Usage Tracking
- Claude Code rate limit monitoring (OAuth)
- Claude Code cost tracking (per-model breakdown)
- Gemini quota monitoring (Pro/Flash tiers)

### Additional Features
- Command Palette (Ctrl+K / Cmd+K)
- Keyboard shortcuts help (?)
- Custom themes with full color token editor
- Recent projects on startup
- Onboarding flow for new users
- Toast notifications
- Session persistence across restarts

## Platforms

| Platform | Status | Package Format |
|----------|--------|---------------|
| macOS    | Supported | `.dmg` |

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

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/erdemalti0/praxis-app.git
cd vibepilot-electron

# Install dependencies
npm install
```

### Development

```bash
npm run dev
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
```

## License

MIT
