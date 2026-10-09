const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const { spawn } = require('child_process');

// Register the on-the-fly TS loader for main process TypeScript support
require.extensions['.ts'] = function (module, filename) {
  const content = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(content, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      inlineSourceMap: true,
    },
  });
  module._compile(result.outputText, filename);
};

// Import TypeScript Services
const { FileSystemService } = require('./src/main/services/FileSystemService.ts');
const { JudgeService } = require('./src/main/services/JudgeService.ts');
const { StoreService } = require('./src/main/services/StoreService.ts');
const { validateJudgeArgs } = require('./src/main/services/ipcValidate.ts');
const { LanguageServerManager } = require('./src/main/services/lsp/LanguageServerManager.ts');
const { resolveClangd, clangdArgs, compileFlags } = require('./src/main/services/lsp/resolveClangd.ts');
const { CompanionService } = require('./src/main/services/CompanionService.ts');

let pty;
try {
  pty = require('node-pty');
} catch (e) {
  console.warn("node-pty load failure, falling back to standard spawn:", e);
}

let mainWindow;
let ptyProcess = null;
let isNativePty = false;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0B0B0D',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Hardening: deny popups and off-origin navigation
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!/^(file:|http:\/\/localhost)/.test(url)) e.preventDefault();
  });

  mainWindow.setMenu(null);

  // Initialize service instances
  const fileSystemService = new FileSystemService();
  const judgeService = new JudgeService();
  const storeService = new StoreService();
  await storeService.initialize();

  // Competitive Companion: loopback-only HTTP listener (127.0.0.1:27121), forwards validated problems to the UI
  const companion = new CompanionService((problem) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('companion:problem', problem);
  });
  companion.start();
  app.on('before-quit', () => { companion.stop(); if (lsp) lsp.stop(); });

  // clangd language server bridge (validated JSON-RPC only; renderer falls back to Monaco providers when unavailable)
  let lsp = null;
  const sendStatus = (s) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('lsp:status', s); };
  ipcMain.handle('lsp:start', async (event, root) => {
    if (typeof root !== 'string' || !path.isAbsolute(root) || root.includes('\0') || !fs.existsSync(root)) return { ok: false, reason: 'invalid-root' };
    if (lsp) lsp.stop();
    const bin = resolveClangd({ platform: process.platform, arch: process.arch, resourcesPath: process.resourcesPath, appRoot: __dirname, pathEnv: process.env.PATH });
    if (!bin) { sendStatus('off'); return { ok: false, reason: 'clangd-not-found' }; }
    const inc = path.join(fs.existsSync(path.join(process.resourcesPath || '', 'nexel-include')) ? process.resourcesPath : path.join(__dirname, 'resources'), 'nexel-include');
    try { const f = path.join(root, 'compile_flags.txt'); if (!fs.existsSync(f)) fs.writeFileSync(f, compileFlags('c++17', inc)); } catch {}
    lsp = new LanguageServerManager(bin.path, clangdArgs(), root, (m) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('lsp:message', m); }, sendStatus);
    lsp.start();
    return { ok: true, source: bin.source };
  });
  ipcMain.handle('lsp:send', async (event, msg) => { if (!lsp) return false; try { lsp.send(msg); return true; } catch { return false; } });
  ipcMain.handle('lsp:stop', async () => { if (lsp) lsp.stop(); lsp = null; return true; });

  // Window frame control receivers
  ipcMain.on('window-control', (event, action) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === 'close') win.close();
  });

  // Terminal PTY process IPC receivers
  ipcMain.handle('terminal:create', async (event) => {
    if (ptyProcess) {
      try {
        if (isNativePty) ptyProcess.kill();
        else ptyProcess.kill();
      } catch (err) {}
      ptyProcess = null;
    }

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';

    if (pty) {
      try {
        ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-color',
          cols: 80,
          rows: 10,
          cwd: process.env.HOME || process.env.USERPROFILE,
          env: process.env
        });
        isNativePty = true;

        ptyProcess.onData((data) => {
          if (mainWindow) mainWindow.webContents.send('terminal:data', data);
        });

        ptyProcess.onExit(() => {
          ptyProcess = null;
        });
        return isNativePty;
      } catch (e) {
        console.warn("PTY native spawn crash, falling back to process spawn:", e);
      }
    }

    // Process shell fallback
    try {
      const args = shell === 'powershell.exe' ? ['-NoLogo', '-Interactive'] : [];
      ptyProcess = spawn(shell, args, {
        cwd: process.env.HOME || process.env.USERPROFILE,
        env: process.env
      });
      isNativePty = false;

      ptyProcess.stdout.on('data', (data) => {
        if (mainWindow) mainWindow.webContents.send('terminal:data', data.toString());
      });
      ptyProcess.stderr.on('data', (data) => {
        if (mainWindow) mainWindow.webContents.send('terminal:data', data.toString());
      });

      ptyProcess.on('close', () => {
        ptyProcess = null;
      });
    } catch (err) {
      console.error("Shell process spawn failure:", err);
    }

    return isNativePty;
  });

  ipcMain.on('terminal:write', (event, data) => {
    if (!ptyProcess) return;
    if (isNativePty) {
      ptyProcess.write(data);
    } else {
      ptyProcess.stdin.write(data);
    }
  });

  ipcMain.on('terminal:resize', (event, cols, rows) => {
    if (ptyProcess && isNativePty) {
      try {
        ptyProcess.resize(cols, rows);
      } catch (err) {
        console.error("PTY resize failed:", err);
      }
    }
  });

  // Decoupled File System IPC Routes
  ipcMain.handle('fs:open-dir', async () => {
    return await fileSystemService.openDir();
  });

  ipcMain.handle('fs:read-files', async (event, dirPath) => {
    return await fileSystemService.readFiles(dirPath);
  });

  ipcMain.handle('fs:create-file', async (event, parentPath, fileName) => {
    return await fileSystemService.createFile(parentPath, fileName);
  });

  ipcMain.handle('fs:create-folder', async (event, parentPath, folderName) => {
    return await fileSystemService.createFolder(parentPath, folderName);
  });

  ipcMain.handle('fs:rename', async (event, oldPath, newPath) => {
    return await fileSystemService.rename(oldPath, newPath);
  });

  ipcMain.handle('fs:delete', async (event, targetPath) => {
    return await fileSystemService.deleteNode(targetPath);
  });

  ipcMain.handle('fs:read-file-content', async (event, filePath) => {
    return await fileSystemService.readFileContent(filePath);
  });

  ipcMain.handle('fs:write-file-content', async (event, filePath, content) => {
    return await fileSystemService.writeFileContent(filePath, content);
  });

  // Decoupled Judge IPC Routes
  ipcMain.handle('judge:run', async (event, filePath, testCases, timeLimit, memoryLimit) => {
    const v = validateJudgeArgs(filePath, testCases, timeLimit, memoryLimit); // renderer input is untrusted
    return await judgeService.run(v.filePath, v.cases, v.timeLimit, v.memoryLimit);
  });

  ipcMain.handle('judge:fetch-contests', async (event, workspaceDir) => {
    return await judgeService.fetchContests(workspaceDir);
  });

  ipcMain.handle('judge:fetch-problems', async (event, contestId) => {
    return await judgeService.fetchProblems(contestId);
  });

  // Secure Electron Store IPC Routes (Synchronous)
  ipcMain.on('store:get-sync', (event, key) => {
    event.returnValue = storeService.getSync(key);
  });

  ipcMain.on('store:set-sync', (event, key, value) => {
    storeService.setSync(key, value);
    event.returnValue = true;
  });

  ipcMain.on('store:delete-sync', (event, key) => {
    storeService.deleteSync(key);
    event.returnValue = true;
  });

  const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:5173';
  mainWindow.loadURL(startUrl);

  if (process.env.ELECTRON_START_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});