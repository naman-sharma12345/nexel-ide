# 🌌 Nexel IDE

Nexel IDE is a high-fidelity, premium, minimal workspace designed for competitive programmers and software developers. Engineered with a unified React + TypeScript frontend and a secure Electron backend, it features a native sandboxed compilation runner, localized autocomplete, and a gamified feedback system.

---

## 🎥 Video Demonstration

Check out the full workflow, autocomplete, and gamified judge system in action:

<video src="recording.mp4" controls width="100%" style="border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 20px rgba(0,0,0,0.4);"></video>

---

## ✨ Features

### 💻 Monaco Code Editor & Intellisense
- **High-Performance Editor**: Clean, responsive layout embedding the Monaco Editor engine.
- **Custom Local Autocomplete**: Fully offline Intellisense engine utilizing `dataset.json` and key snippets, eliminating heavy external language server dependencies.
- **Auto Standard-Library Stripping**: Intelligent detection of namespaces (e.g. `using namespace std;`) to strip redundant prefixes in autocomplete suggestions.
- **Keyboard Snippets**: Instant boilerplate injection with visual trigger configurations in the settings panel.

### 🏆 Interactive Local Judge
- **Isolated Execution**: High-precision sandbox runner that executes your C++ (`g++`), Java (`javac`), and Python code.
- **Telemetry & Metrics**: Displays precise peak memory (MB) usage and execution time (ms) side-by-side.
- **Dopamine Celebrations**:
  - 🎉 **Accepted (AC)**: Triggers a vibrant neon green glow wash that sweeps across the editor active tab, editor window, and judge pane for 1.5 seconds.
  - ⚠️ **Wrong Answer (WA / TLE / MLE)**: Initiates a crisp, horizontal shake animation on the judge metrics panel to provide immediate tactile feedback.

### 📁 Advanced File Explorer & Templates
- **Interactive File Tree**: Custom directory explorer with drag-and-drop support, keyword search matching, and contextual actions.
- **Smart Directory Creation**: Intuitive path resolution to create files and folders in the currently active directory rather than nested subfolders.
- **Template System**: Configure a custom boilerplate template that automatically prepopulates new `.cpp` files upon creation.

### 🍥 Premium Fluid Aesthetics
- **Floating Glass Interfaces**: Glassmorphism and floating tab configurations designed with a dark, sleek neon-accented color palette.
- **Interactive Shuriken**: A custom four-spiked shuriken icon embedded in the NavDock that glows and spins smoothly on hover.

---

## 🚀 Getting Started

### Prerequisites
Ensure you have the following installed on your machine:
- **Node.js** (v18 or higher)
- **C++ Compiler** (`g++` on your system path)
- **Java Compiler** (`javac` and `java` on your path)
- **Python** (`python` or `python3` on path)

### Installation
1. Clone the repository and navigate into the `nexel-ide` directory:
   ```bash
   cd nexel-ide
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application
To run Nexel IDE in development mode with hot-reloading:
```bash
npm run dev
```
To bundle the frontend assets and compile the production client:
```bash
npm run build
```

- Design tokens migrated across all component CSS (--nx-line, --nx-text*, --nx-accent*).
- Contests fetch: 5 min TTL cache, 8s timeout, exponential backoff, stale fallback.

- Added "Solar Dusk" theme (violet twilight with coral accent).
