const { contextBridge, ipcRenderer } = require('electron');

// Expose safe system APIs to the React frontend
contextBridge.exposeInMainWorld('nexelAPI', {
  // Window controls for a custom title bar
  minimizeWindow: () => ipcRenderer.send('window-control', 'minimize'),
  maximizeWindow: () => ipcRenderer.send('window-control', 'maximize'),
  closeWindow: () => ipcRenderer.send('window-control', 'close'),

  // Workspace File System triggers
  openWorkspaceDir: () => ipcRenderer.invoke('fs:open-dir'),
  readWorkspaceFiles: (dirPath) => ipcRenderer.invoke('fs:read-files', dirPath),
  createFile: (parentPath, fileName) => ipcRenderer.invoke('fs:create-file', parentPath, fileName),
  createFolder: (parentPath, folderName) => ipcRenderer.invoke('fs:create-folder', parentPath, folderName),
  renameNode: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
  deleteNode: (targetPath) => ipcRenderer.invoke('fs:delete', targetPath),
  readFileContent: (filePath) => ipcRenderer.invoke('fs:read-file-content', filePath),
  writeFileContent: (filePath, content) => ipcRenderer.invoke('fs:write-file-content', filePath, content),

  // clangd bridge (main validates every message)
  lspStart: (root, opts) => ipcRenderer.invoke('lsp:start', root, opts),
  lspSend: (msg) => ipcRenderer.invoke('lsp:send', msg),
  lspRestart: () => ipcRenderer.invoke('lsp:restart'),
  lspStop: () => ipcRenderer.invoke('lsp:stop'),
  onLspMessage: (cb) => { ipcRenderer.removeAllListeners('lsp:message'); ipcRenderer.on('lsp:message', (e, m) => cb(m)); },
  onLspStatus: (cb) => { ipcRenderer.removeAllListeners('lsp:status'); ipcRenderer.on('lsp:status', (e, s) => cb(s)); },

  // Terminal PTY integration
  createTerminal: () => ipcRenderer.invoke('terminal:create'),
  writeTerminal: (data) => ipcRenderer.send('terminal:write', data),
  resizeTerminal: (cols, rows) => ipcRenderer.send('terminal:resize', cols, rows),
  onTerminalData: (callback) => {
    // Clear previous listeners to avoid double listener leaks
    ipcRenderer.removeAllListeners('terminal:data');
    ipcRenderer.on('terminal:data', (event, data) => callback(data));
  },

  // Competitive Programming Judge Integration
  runJudge: (filePath, testCases, timeLimit, memoryLimit) => 
    ipcRenderer.invoke('judge:run', filePath, testCases, timeLimit, memoryLimit),
  fetchContests: (workspaceDir) =>
    ipcRenderer.invoke('judge:fetch-contests', workspaceDir),
  fetchContestProblems: (contestId) =>
    ipcRenderer.invoke('judge:fetch-problems', contestId),

  // Competitive Companion (browser extension -> IDE). Callback receives an already-validated problem.
  onCompanionProblem: (callback) => {
    ipcRenderer.removeAllListeners('companion:problem');
    ipcRenderer.on('companion:problem', (event, problem) => callback(problem));
  },

  // Secure Electron Store bindings
  getStoreSync: (key) => ipcRenderer.sendSync('store:get-sync', key),
  setStoreSync: (key, value) => ipcRenderer.sendSync('store:set-sync', key, value),
  deleteStoreSync: (key) => ipcRenderer.sendSync('store:delete-sync', key)
});