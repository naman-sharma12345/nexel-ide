<div align="center">

<img src="logo.png" alt="Nexel IDE Logo" width="120" />

# NEXEL IDE

**The competitive programmer's weapon of choice.**

[![Electron 42](https://img.shields.io/badge/Electron-42-47848F?style=for-the-badge&logo=electron&logoColor=white)](#)
[![React 19](https://img.shields.io/badge/React-19-149eca?style=for-the-badge&logo=react&logoColor=white)](#)
[![TypeScript 6](https://img.shields.io/badge/TypeScript-6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](#)
[![Monaco](https://img.shields.io/badge/Monaco-Editor-6f42c1?style=for-the-badge&logo=visualstudiocode&logoColor=white)](#)
[![Vitest](https://img.shields.io/badge/Tested_with-Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](#)
[![Playwright](https://img.shields.io/badge/E2E-Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](#license)

A frameless, monochrome desktop IDE with the VS Code editor engine, a sandboxed local judge,<br/>
live Codeforces integration, 100+ CP snippets, and zero telemetry.

[Features](#-features) · [Demo](#-demo) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [Testing](#-testing) · [License](#license)

</div>

---

## 🎬 Demo

<div align="center">

![Nexel IDE Demo](recording.gif)

</div>

---

## ⚡ Features

### 🧠 Monaco Editor Core

> The same engine that powers VS Code — customized to its limit.

- **Custom `nexel-minimal-dark` theme** — hand-tuned syntax token colors against a `#050507` canvas
- **Multi-tab workflow** with dirty indicators, unsaved-change protection, and keyboard shortcuts (`Ctrl+S`, `Ctrl+W`)
- **Split-pane editing** — vertical split with draggable divider (20–80% ratio), independent focus tracking per pane
- **Auto-save** with a 5-second polling loop and toggle LED in the toolbar
- **C++ intelligent autocomplete** powered by a curated 1,600-entry dataset across 6 categories (keywords, containers, algorithms, math, I/O, CP patterns). Auto-strips the `std::` prefix when `using namespace std;` is detected
- **100+ competitive programming snippets** — DSU, Fenwick Tree, Segment Tree (+ Lazy), Sparse Table, Trie, Ordered Set (PBDS), BFS, DFS, Dijkstra, Bellman-Ford, Floyd-Warshall, Topological Sort, Kosaraju/Tarjan SCC, LCA, Binary/Ternary Search, Matrix Exponentiation, Sieve, KMP, Z-function, Convex Hull, and more. Searchable via a built-in snippet viewer tab
- **C++ boilerplate templates** — configure default code that auto-injects into every new `.cpp` file

---

### 🏆 Local Judge System

> Compile, run, and validate — without leaving the IDE.

| Capability | Detail |
|---|---|
| **Languages** | C++ (`g++ -std=c++17`), Java (`javac` → `java -cp`), Python (`python` / `python3`) |
| **Verdicts** | `AC` · `WA` · `TLE` · `MLE` · `RE` — color-coded pills per test case |
| **Metrics** | Execution time (ms) and peak resident memory (MB) per test |
| **Diff viewer** | Side-by-side line comparison with match/mismatch highlighting |
| **Gamified feedback** | 🟢 **AC** → neon green glow wash across editor + tab (1.5s). 🔴 **WA** → horizontal shake on metrics panel |
| **Batch execution** | All test cases run sequentially with real-time "RUNNING" animation per pill |

---

### 🛡️ Sandboxed Execution Engine

> Every student submission runs in a sandbox. No exceptions.

<details>
<summary><b>Linux / macOS — Bubblewrap (bwrap)</b></summary>

- `--unshare-all` — isolates IPC, network, PID, UTS, and mount namespaces
- Read-only bind mounts for `/usr`, `/lib`, `/lib64`, `/bin`, and the source directory
- Drops privileges to `uid 1000 / gid 1000`
- Falls back to `ulimit -v -t` constraints if `bwrap` is unavailable (with a prominent security warning)

</details>

<details>
<summary><b>Windows — Job Objects + Process Tree Killing</b></summary>

- Attempts `win32-job` native Job Objects for memory capping
- Falls back to `tasklist` / `taskkill` / WMIC / PowerShell recursive child-PID discovery and termination

</details>

<details>
<summary><b>Cross-platform safety nets</b></summary>

- **Time limit enforcement** — configurable `setTimeout` with `SIGKILL` on the entire process group/tree
- **Memory limit enforcement** — 300ms polling loop via `ps -o rss=` (Unix) or `tasklist /FI` (Windows)
- **5 MB output cap** — prevents stdout flooding from crashing the host → immediate `RE` verdict
- **Signal handling** — `SIGXCPU` → `TLE`, exit code 137 / `SIGKILL` / OOM → `MLE`, non-zero exit → `RE`

</details>

---

### 🌐 Codeforces Integration

> Browse contests, scrape problems, import samples — all built in.

- **Live contest browser** — fetches from the Codeforces API. Three sections: Active Now (green pulse), Upcoming (with start time), Recent Past
- **Problem statement viewer** — full HTML rendering with MathJax LaTeX support, time/memory limit chips, input/output format sections
- **One-click sample import** — push sample test cases from any problem directly into the Judge
- **"Open To Folder"** — scaffold a contest directory with `A.cpp`, `B.cpp`, … template files in your workspace
- **Custom fetch** — type a contest ID (`1981`) or problem (`1981A`) and instantly load it
- **Robust scraper** — 3-tier Cloudflare bypass: saved cookies → real Chrome profile (Playwright stealth) → HTTP login fallback

---

### 📂 Workspace Explorer

- **Recursive file tree** with smart filtering (`node_modules`, `.git`, `.vite` excluded)
- **Full CRUD** — new file, new folder, rename (inline editing with smart extension selection), delete with confirmation
- **Context menus** — right-click on files, folders, or empty space for quick actions
- **Drag & drop** — relocate files and folders within the tree
- **Pinned files shelf** — bookmark frequently accessed files for instant access
- **Regex search** — real-time filter with Match Case and Regex toggle buttons

---

### ⌨️ Integrated Terminal

- **xterm.js** frontend with `node-pty` native PTY backend (PowerShell on Windows, bash on Linux/macOS)
- **Fallback mode** — standard `child_process` shell with manual echo if PTY bindings are unavailable
- **Auto-resize** — `ResizeObserver`-based fit with dimensions forwarded to the PTY process
- **Theme-matched** — colors aligned with the editor's monochrome palette

---

### 🪟 UI & Window Chrome

- **Frameless custom title bar** with File / Edit / Selection / View / Terminal / Options / Help menus
- **Floating glass NavDock** — vertical activity bar with hover-reveal collapse, neon tube active indicator, animated tooltips
- **Persistent state** — workspace path, judge test cases, UI preferences, and editor settings survive restarts via `electron-store`
- **Welcome screen** — logo, branding, and keyboard shortcut guide when no files are open

---

## 🧱 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Shell** | Electron 42 | Frameless window, native OS APIs, IPC bridge |
| **UI** | React 19 + Zustand 5 | Concurrent rendering, persisted state management |
| **Language** | TypeScript 6 | Strict typing across the Electron boundary |
| **Editor** | Monaco Editor | VS Code's industrial-grade editing engine |
| **Terminal** | xterm.js + node-pty | Native PTY shell integration |
| **Bundler** | Vite 8 | Sub-second HMR, optimized production builds |
| **Scraper** | Cheerio + Playwright | Codeforces problem extraction with Cloudflare bypass |
| **Unit Tests** | Vitest + Testing Library | Component, store, service, and security tests |
| **E2E Tests** | Playwright | Full browser workflow automation |
| **CI/CD** | GitHub Actions | Lint → Typecheck → Unit (70% coverage) → E2E |

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
| OS | Windows 10/11, Linux, macOS |
| *(for Judge)* | `g++`, `java`/`javac`, `python` on `PATH` |

### Clone & Install

```bash
git clone https://github.com/naman/nexel-ide.git
cd nexel-ide/nexel-ide
npm install
```

### Launch (Vite + Electron with HMR)

```bash
# Start the Vite dev server (renderer)
npm run dev

# In a separate terminal — start Electron (main process)
npm run electron:dev
```

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | TypeScript compile + Vite production build |
| `npm run electron:dev` | Launch Vite + Electron concurrently with HMR |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run test` | Run all Vitest unit/integration tests |
| `npm run test:coverage` | Run Vitest with v8 coverage (70% threshold) |
| `npm run test:e2e` | Run Playwright end-to-end tests |

---

## 🏗️ Architecture

```
nexel-ide/
├── .github/workflows/ci.yml          # GitHub Actions: lint, test, e2e
├── nexel-ide/                         # Main Electron + React application
│   ├── main.cjs                       # Electron main process (IPC handlers, on-the-fly TS compilation)
│   ├── preload.cjs                    # contextBridge — 23 safe API methods
│   ├── src/
│   │   ├── App.tsx                    # Root layout: TitleBar + NavDock + panels + Editor
│   │   ├── components/
│   │   │   ├── TitleBar.tsx           # Frameless window chrome + menu bar
│   │   │   ├── NavDock.tsx            # Floating glass activity bar with hover-reveal
│   │   │   ├── Explorer.tsx           # Workspace tree, search, pins, drag-drop, CRUD
│   │   │   ├── Editor.tsx             # Monaco multi-tab editor + split pane + snippets viewer + CF problem viewer
│   │   │   ├── Terminal.tsx           # xterm.js + node-pty terminal
│   │   │   ├── JudgeSystem.tsx        # Test case manager, verdict display, diff viewer
│   │   │   └── ContestsSystem.tsx     # Codeforces contest browser + problem fetcher
│   │   ├── stores/
│   │   │   ├── useEditorStore.ts      # Tabs, split state, settings (Zustand + persist)
│   │   │   ├── useJudgeStore.ts       # Test cases, verdicts (Zustand + persist)
│   │   │   ├── useUIStore.ts          # Sidebar, terminal, modal state (Zustand + persist)
│   │   │   ├── useWorkspaceStore.ts   # File tree, pins, search (Zustand + persist)
│   │   │   └── electronStorage.ts     # Zustand ↔ electron-store bridge with write-cache
│   │   ├── judge-backend/
│   │   │   ├── SandboxExecutor.ts     # ISandboxExecutor interface (swap for Docker/WASM)
│   │   │   └── LocalSandboxExecutor.ts # Bubblewrap (Linux) + Job Objects (Windows) sandbox
│   │   ├── main/services/
│   │   │   ├── JudgeService.ts        # Compilation orchestrator + CF API + scraper spawner
│   │   │   ├── FileSystemService.ts   # File CRUD with path-traversal protection
│   │   │   ├── FileTreeWorker.ts      # Off-main-thread directory scanner
│   │   │   └── StoreService.ts        # electron-store wrapper
│   │   └── __mocks__/                 # Vitest mocks for nexelAPI + setup
│   ├── tests/e2e/
│   │   ├── ide-workflow.spec.ts       # E2E: file → edit → judge → AC celebration
│   │   └── contests-system.spec.ts    # E2E: browse → open contest → load problem
│   ├── dataset.json                   # 1,600-entry C++ autocomplete dataset
│   ├── snippets.json                  # 100+ CP snippet templates
│   ├── vitest.config.ts               # jsdom, React plugin, 70% coverage thresholds
│   └── playwright.config.ts           # Chromium, Vite webServer, HTML reporter
└── nexel-judge/                       # Standalone Codeforces scraper
    ├── cf_problems.js                 # Problem scraper with 3-tier Cloudflare bypass
    └── get_contests.js                # Contest list fetcher
```

---

## 🧪 Testing

Nexel IDE is protected by a multi-layered testing strategy:

### Unit & Integration Tests (Vitest)

| Suite | What it proves |
|---|---|
| `LocalSandboxExecutor.security.test.ts` | 5MB output cap kills the process; hung executions get `SIGKILL` → `TLE` |
| `LocalSandboxExecutor.test.ts` | Multi-language execution, verdict mapping, memory/time measurement |
| `JudgeService.compilation.test.ts` | Compiler hangs are aborted via `SIGKILL`; temp workspaces are cleaned up |
| `JudgeService.contests.test.ts` | Contest API parsing; scraper spawns with correct isolated env vars |
| `FileTreeWorker.resilience.test.ts` | `EACCES` errors are caught gracefully; 500+ file scans don't block the event loop |
| `electronStorage.integrity.test.ts` | Write-cache deduplication; invalid JSON fallback handling |
| `useEditorStore.edge-cases.test.ts` | Rapid tab open/close race conditions; dirty state tracking correctness |
| `JudgeSystem.test.tsx` | Component rendering, verdict display, run button state management |

### End-to-End Tests (Playwright)

| Suite | Workflow |
|---|---|
| `ide-workflow.spec.ts` | Open workspace → create file → edit code → run judge → assert AC verdict + celebration glow |
| `contests-system.spec.ts` | New user (no credentials) → browse contests → open past contest → load problems → open in editor |

### Coverage

```
npm run test:coverage
```

Enforces **70% minimum** on statements, branches, functions, and lines via `@vitest/coverage-v8`.

---

## 🔄 CI/CD

GitHub Actions runs **three parallel jobs** on every push/PR to `main`:

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  lint-and-typecheck  │    │     unit-tests       │    │      e2e-tests      │
│                     │    │                     │    │                     │
│  npm run lint       │    │  npm run             │    │  npx playwright     │
│  npm run typecheck  │    │    test:coverage     │    │    install --with-  │
│                     │    │                     │    │    deps             │
│                     │    │  (70% threshold)    │    │  npm run test:e2e  │
│                     │    │                     │    │                     │
│                     │    │                     │    │  📦 Upload report   │
│                     │    │                     │    │     (30-day)        │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

---

## 🧭 Roadmap

### ✅ Shipped

- [x] Monaco editor with custom theme, multi-tab, split pane, auto-save
- [x] C++ autocomplete engine (1,600+ entries) with `std::` auto-stripping
- [x] 100+ competitive programming snippet library with searchable viewer
- [x] Local judge system — C++ / Java / Python with AC/WA/TLE/MLE/RE verdicts
- [x] Sandboxed execution — Bubblewrap (Linux), Job Objects (Windows), output capping
- [x] Codeforces integration — contest browser, problem viewer, sample import, folder scaffolding
- [x] Workspace explorer with CRUD, drag-drop, pins, regex search
- [x] Integrated terminal with native PTY
- [x] C++ boilerplate template system
- [x] Persistent state across restarts
- [x] Gamified AC celebration glow + WA shake animations
- [x] Custom frameless window with full menu system
- [x] CI/CD pipeline — lint, typecheck, unit tests (70% coverage), E2E tests
- [x] Path-traversal protection on file system operations
- [x] Off-main-thread file tree scanning

### 🚧 Planned

- [ ] Finder overlay (project-wide search & replace)
- [ ] Git integration sidebar
- [ ] Themes marketplace (light mode, custom themes)
- [ ] Atcoder / USACO contest integration
- [ ] Docker-based sandbox executor
- [ ] Collaborative editing (WebRTC)

---

## 📜 License

Released under the **MIT License**. See [LICENSE](./LICENSE) for the full text.

---

<div align="center">

<sub>Built with caffeine and stubbornness by the Nexel Team ☕⚡</sub>

</div>

## What's new on hark/overnight-improvements
- Two new themes: Nord Frost and Deep Forest (7 themes total).
- Drag-and-drop tab reordering in the editor tab bar.

- Replace in files: replace field + Replace all (Ctrl+Enter) in the Find-in-files panel, with confirm.

- **Zen mode** (Ctrl+Alt+Z or palette): sidebar, dock and status bar fade away; Esc exits.
- **Breadcrumbs** (design): the editor footer path is now workspace-relative clickable-looking crumbs (`cp-workspace › codeforces › 1950A.cpp`) with chevrons, staggered slide-in on every file switch and an accent-coloured file name.
- **Living welcome backdrop** (design): dot grid that lights up under the cursor, an accent spotlight that follows the mouse (rAF-throttled CSS vars, no React re-renders) and two slow drifting aurora orbs tinted by the active theme; respects reduced motion.
- **Session restore** (feature): reopens the tabs you had open in the last workspace (paths only, validated to live inside the workspace root, capped at 24, bounded storage) and focuses the active one.
- **Judge sandbox hardening** (security / OS): the `ulimit` fallback no longer interpolates file paths into a shell string (positional args, so a hostile file name cannot inject commands), and now also sets `RLIMIT_NPROC` (fork-bomb guard), `RLIMIT_FSIZE` and no core dumps; stdin EPIPE is handled.
- **Find in files** (feature + design, Ctrl+Shift+F): glass search overlay with case / whole-word / regex toggles, debounced and abortable. The engine (`src/lib/searchInFiles.ts`) is a bounded worker pool: capped files, bytes, matches and concurrency, skips binaries, guards zero-width regexes. Enter jumps to the match and the line flashes in the accent colour.
- **Theme circular reveal** (design): switching themes now expands the new palette as a circle from where you clicked (View Transitions API), with the colour-glide fallback and reduced-motion respected.
- **Judge IPC hardening** (security): `judge:run` arguments are validated in the main process (path type/extension, max 200 cases, 2 MB of data, clamped time/memory limits) because the renderer is treated as untrusted.
- **Stress tester** (feature + design, Judge → ⚡ STRESS): runs your solution against a brute-force file on seeded random inputs until the first mismatch. Animated SVG progress ring (pulses while running, pops ✓ / ! at the end), abortable (STOP), bounded to 2000 tests, shows the counter-example with the first differing line and saves it as a test case in one click.
- **Hover docs** (feature, zero-install): hover STL calls (`lower_bound`, `priority_queue`, `gcd`…) and Python helpers (`heappush`, `bisect_left`…) for signature, note and complexity. Monaco hover, suggest and find widgets restyled as glass cards with accent-highlighted matches.
- **Python + Java IntelliSense (tier 1, zero-install)**: snippet/completion providers for fast IO, heaps, DSU, main guards, collections, working on every machine without a language server. Nav dock gets a theme-aware accent sheen (respects reduced motion).
- **Competitive Companion** (feature + security): the IDE listens on `127.0.0.1:27121` (loopback only) for the Competitive Companion browser extension. Sending a problem creates `<Problem>.cpp` (with your C++ template, never overwriting an existing file) and loads the samples into the Judge. Hardened: POST only, 1 MB cap enforced while streaming, strict schema validation, sanitised file names, bounded test count, 5 s request timeout, silent fallback if the port is busy.
- **Keyboard shortcuts sheet** (design, Ctrl+/): glass cheat-sheet with 3D keycaps that physically press and glow when you hit the matching key. Welcome screen now shows live keycap chips.
- **Recent workspaces** on the welcome card (MRU, de-duplicated, capped at 5, persisted): one click re-opens a folder.
- **Theme system** (design): 5 themes (Nexel Emerald, Midnight Indigo, Ember, Sakura Night, Mono Contrast) driven by design tokens (`--nx-bg-*`, `--nx-editor-bg`, `--nx-accent-rgb`). Switching glides colours over ~380ms; Monaco, terminal and chrome change together. All hard-coded accent colours across the CSS migrated to tokens.
- **Settings panel** (Ctrl+,): theme cards with live mini-previews, font size, tab size, ligatures, word wrap and minimap toggles, persisted and validated (clamped, unknown themes rejected). Also in the command palette (`Theme: …`, `Toggle Minimap`, `Toggle Word Wrap`) and via the status bar theme chip.
- **Status bar** (design + feature): glass strip with a breathing accent dot, active file with unsaved dot, live `Ln/Col` and selection length, language, judge status (pulsing while judging, `passed/total` after), terminal toggle and shortcut hint. New `--nx-status-h` layout token.
- **Toast notifications**: spring-in glass toasts with a countdown bar (`Saved main.cpp`), bounded queue (max 4) with de-duplication.
- Editor canvas now sizes to its container, not 100vh, so the status bar never overlaps.
- **Quick open (Ctrl+P)**: fuzzy file finder with match highlighting, reusing the command palette.
- Judge verdict chips: spring pop-in, green/red glow, pulsing RUNNING state.

- **Command palette** (Ctrl/Cmd+Shift+P): fuzzy-searchable, animated, keyboard-driven (navigate sections, toggle sidebar/terminal, edit C++ template).

- **Design:** tabs get a glowing gradient underline that scales in, hover lift, and close buttons that fade in and rotate on hover.
- **Performance:** Judge and Contests panels are lazy-loaded (React.lazy) with shimmer skeleton fallbacks.

- **Design:** glass dock sheen with accent glow, hover lift on dock items; Monaco accent selection/cursor/indent guides, smooth scrolling, bracket colorization, ligatures.
- **Security:** CSP meta in index.html; window-open deny and off-origin navigation block in Electron main; Outfit font self-hosted (no Google Fonts request).
- **Performance:** Monaco bundled locally with slim entry and code-split chunks (earlier run).

- Command palette: matched letters now glow in accent, plus a keyboard-hint footer with result count.

- Stress-test core (`src/lib/stress.ts`): seeded PRNG case generator + first-diff finder, with tests.

- (04:49) Global focus rings, button press feedback, thin themed scrollbars, reduced-motion support; fast-I/O C++ template module (+tests).

- (overnight) Verdict classifier `src/lib/verdict.ts` (AC/WA/TLE/MLE/RE, Codeforces precedence) and animated tab entrance.

- STL signature help (C++): parameter hints while typing calls like `sort(`, `lower_bound(` with complexity notes (src/lib/signatureHelp.ts).
