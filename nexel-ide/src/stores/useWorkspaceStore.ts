import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useEditorStore } from './useEditorStore';
import { electronStorage } from './electronStorage';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  isOpen?: boolean;
  children?: FileNode[];
}

export interface InlineInputState {
  visible: boolean;
  nodePath: string;
  mode: 'new-file' | 'new-folder' | 'rename';
  defaultValue: string;
}

interface WorkspaceState {
  rootPath: string | null;
  rootName: string;
  activeDir: string | null;
  tree: FileNode[];
  pinnedPaths: string[];
  recentWorkspaces: string[];
  openRecent: (path: string) => Promise<void>;
  searchQuery: string;
  isRegex: boolean;
  isMatchCase: boolean;
  lastSelectedNode: FileNode | null;
  inlineInput: InlineInputState;

  setRootPath: (path: string | null) => void;
  setActiveDir: (path: string | null) => void;
  setTree: (tree: FileNode[]) => void;
  togglePin: (path: string) => void;
  setSearchQuery: (query: string) => void;
  setRegex: (isRegex: boolean) => void;
  setMatchCase: (isMatchCase: boolean) => void;
  setLastSelectedNode: (node: FileNode | null) => void;
  setInlineInput: (input: Partial<InlineInputState>) => void;
  
  openWorkspaceDir: () => Promise<void>;
  refreshTree: (forceOpenPaths?: Set<string>) => Promise<void>;
  toggleFolder: (nodePath: string) => void;
  collapseAllFolders: () => void;
  triggerHeaderNewFile: () => void;
  triggerHeaderNewFolder: () => void;
  handleDeleteNode: (node: FileNode) => Promise<void>;
  handleInlineSubmit: (value: string) => Promise<string | null>;
}

/** MRU list: newest first, de-duplicated, capped so persisted state stays tiny. */
export function pushRecent(list: string[], dir: string, max = 5): string[] {
  return [dir, ...list.filter(d => d !== dir)].slice(0, max);
}

// Helpers for tree transformation & state extraction
function getOpenFolderPaths(nodes: FileNode[]): Set<string> {
  const paths = new Set<string>();
  const traverse = (nodeList: FileNode[]) => {
    for (const node of nodeList) {
      if (node.type === 'folder' && node.isOpen) {
        paths.add(node.path);
      }
      if (node.children) {
        traverse(node.children);
      }
    }
  };
  traverse(nodes);
  return paths;
}

function transformNodes(nodes: FileNode[], openPaths: Set<string> = new Set()): FileNode[] {
  return nodes.map((node) => ({
    name: node.name,
    path: node.path,
    type: node.type,
    isOpen: node.type === 'folder' && openPaths.has(node.path),
    children: node.children ? transformNodes(node.children, openPaths) : [],
  }));
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      rootPath: null,
      rootName: 'NO WORKSPACE',
      activeDir: null,
      tree: [],
      pinnedPaths: [],
      searchQuery: '',
      isRegex: false,
      isMatchCase: false,
      lastSelectedNode: null,
      inlineInput: {
        visible: false,
        nodePath: '',
        mode: 'new-file',
        defaultValue: '',
      },

      setRootPath: (rootPath) => {
        const rootName = rootPath ? (rootPath.split(/[\\/]/).pop() || rootPath).toUpperCase() : 'NO WORKSPACE';
        set({ rootPath, rootName });
      },
      setActiveDir: (activeDir) => set({ activeDir }),
      setTree: (tree) => set({ tree }),
      
      togglePin: (path) =>
        set((state) => ({
          pinnedPaths: state.pinnedPaths.includes(path)
            ? state.pinnedPaths.filter((p) => p !== path)
            : [...state.pinnedPaths, path],
        })),

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setRegex: (isRegex) => set({ isRegex }),
      setMatchCase: (isMatchCase) => set({ isMatchCase }),
      
      setLastSelectedNode: (node) => {
        set({ lastSelectedNode: node });
        const { rootPath } = get();
        if (!rootPath) {
          set({ activeDir: null });
          return;
        }
        let activeDir = rootPath;
        if (node) {
          if (node.type === 'folder') {
            activeDir = node.path;
          } else {
            const lastSlash = Math.max(node.path.lastIndexOf('/'), node.path.lastIndexOf('\\'));
            activeDir = lastSlash !== -1 ? node.path.substring(0, lastSlash) : rootPath;
          }
        }
        set({ activeDir });
      },

      setInlineInput: (input) =>
        set((state) => ({
          inlineInput: { ...state.inlineInput, ...input },
        })),

      openWorkspaceDir: async () => {
        try {
          const selectedDir = await window.nexelAPI.openWorkspaceDir();
          if (!selectedDir) return;
          
          get().setRootPath(selectedDir);
          set(st => ({ recentWorkspaces: pushRecent(st.recentWorkspaces, selectedDir) }));
          set({ lastSelectedNode: null, activeDir: selectedDir });
          
          await get().refreshTree();
        } catch (error) {
          console.error("Workspace mount failure:", error);
        }
      },

      recentWorkspaces: [],
      openRecent: async (dir) => {
        get().setRootPath(dir);
        set(st => ({ lastSelectedNode: null, activeDir: dir, recentWorkspaces: pushRecent(st.recentWorkspaces, dir) }));
        await get().refreshTree();
      },

      refreshTree: async (forceOpenPaths) => {
        const { rootPath, tree } = get();
        if (!rootPath) return;
        try {
          const data = await window.nexelAPI.readWorkspaceFiles(rootPath);
          if (!data) return;

          let nodesArray: FileNode[] = [];
          if (Array.isArray(data)) {
            nodesArray = data as unknown as FileNode[];
          } else if (data && typeof data === 'object') {
            const d = data as Record<string, unknown>;
            if (d.children && Array.isArray(d.children)) {
              nodesArray = d.children as unknown as FileNode[];
            } else {
              nodesArray = [data as unknown as FileNode];
            }
          }

          const openPaths = getOpenFolderPaths(tree);
          if (forceOpenPaths) {
            forceOpenPaths.forEach((p) => openPaths.add(p));
          }

          set({ tree: transformNodes(nodesArray, openPaths) });
        } catch (e) {
          console.error("Workspace tree hydration failure:", e);
        }
      },

      toggleFolder: (nodePath) => {
        const { tree } = get();
        const deepToggle = (nodes: FileNode[]): FileNode[] => {
          return nodes.map((node) => {
            if (node.path === nodePath && node.type === 'folder') {
              return { ...node, isOpen: !node.isOpen };
            }
            if (node.children) {
              return { ...node, children: deepToggle(node.children) };
            }
            return node;
          });
        };
        set({ tree: deepToggle(tree) });
      },

      collapseAllFolders: () => {
        const { tree } = get();
        const deepCollapse = (nodes: FileNode[]): FileNode[] => {
          return nodes.map((node) => {
            if (node.type === 'folder') {
              return { ...node, isOpen: false, children: node.children ? deepCollapse(node.children) : [] };
            }
            return node;
          });
        };
        set({ tree: deepCollapse(tree) });
      },

      triggerHeaderNewFile: () => {
        const { rootPath, rootName, lastSelectedNode } = get();
        if (!rootPath) return;
        let parentNode: FileNode = { name: rootName, path: rootPath, type: 'folder' };
        if (lastSelectedNode) {
          if (lastSelectedNode.type === 'folder') {
            parentNode = lastSelectedNode;
          } else {
            const lastSlash = lastSelectedNode.path.lastIndexOf('/');
            const parentPath = lastSlash !== -1 ? lastSelectedNode.path.substring(0, lastSlash) : rootPath;
            parentNode = { name: '', path: parentPath, type: 'folder' };
          }
        }
        set({
          inlineInput: {
            visible: true,
            nodePath: parentNode.path,
            mode: 'new-file',
            defaultValue: 'untitled.txt',
          },
        });
      },

      triggerHeaderNewFolder: () => {
        const { rootPath, rootName, lastSelectedNode } = get();
        if (!rootPath) return;
        let parentNode: FileNode = { name: rootName, path: rootPath, type: 'folder' };
        if (lastSelectedNode) {
          if (lastSelectedNode.type === 'folder') {
            parentNode = lastSelectedNode;
          } else {
            const lastSlash = lastSelectedNode.path.lastIndexOf('/');
            const parentPath = lastSlash !== -1 ? lastSelectedNode.path.substring(0, lastSlash) : rootPath;
            parentNode = { name: '', path: parentPath, type: 'folder' };
          }
        }
        set({
          inlineInput: {
            visible: true,
            nodePath: parentNode.path,
            mode: 'new-folder',
            defaultValue: 'NewFolder',
          },
        });
      },

      handleDeleteNode: async (node) => {
        const { rootPath } = get();
        const isFolder = node.type === 'folder';
        const confirmMessage = isFolder
          ? `Are you absolutely sure you want to permanently delete the folder "${node.name}" and all of its contents?`
          : `Are you absolutely sure you want to permanently delete the file "${node.name}"?`;

        const confirmDelete = window.confirm(confirmMessage);
        if (!confirmDelete) return;

        try {
          await window.nexelAPI.deleteNode(node.path);
          set((state) => ({
            pinnedPaths: state.pinnedPaths.filter((p) => p !== node.path),
          }));
          if (rootPath) await get().refreshTree();
        } catch (err) {
          console.error("Deletion failed:", err);
        }
      },

      handleInlineSubmit: async (value) => {
        const { inlineInput, rootPath } = get();
        try {
          let createdPath = '';
          const forceOpenPaths = new Set<string>();

          if (inlineInput.mode === 'new-file') {
            createdPath = await window.nexelAPI.createFile(inlineInput.nodePath, value);
            if (inlineInput.nodePath) {
              forceOpenPaths.add(inlineInput.nodePath.replace(/\\/g, '/'));
            }
            if (value.toLowerCase().endsWith('.cpp')) {
              const cppTemplate = useEditorStore.getState().cppTemplate;
              if (cppTemplate) {
                await window.nexelAPI.writeFileContent(createdPath, cppTemplate);
              }
            }
          } else if (inlineInput.mode === 'new-folder') {
            createdPath = await window.nexelAPI.createFolder(inlineInput.nodePath, value);
            if (inlineInput.nodePath) {
              forceOpenPaths.add(inlineInput.nodePath.replace(/\\/g, '/'));
            }
          } else if (inlineInput.mode === 'rename') {
            const pathSegments = inlineInput.nodePath.split('/');
            pathSegments.pop();
            const parentPath = pathSegments.join('/');
            const targetNewPath = `${parentPath}/${value}`;
            await window.nexelAPI.renameNode(inlineInput.nodePath, targetNewPath);

            set((state) => ({
              pinnedPaths: state.pinnedPaths.map((p) => (p === inlineInput.nodePath ? targetNewPath : p)),
            }));
          }

          if (rootPath) {
            await get().refreshTree(forceOpenPaths);
          }

          set((state) => ({ inlineInput: { ...state.inlineInput, visible: false } }));
          
          if (inlineInput.mode === 'new-file' && createdPath) {
            return createdPath.replace(/\\/g, '/');
          }
        } catch (err) {
          console.error("Inline fs write execution failed:", err);
          alert(`Operation failed. Ensure a valid name is provided.`);
        } finally {
          set((state) => ({ inlineInput: { ...state.inlineInput, visible: false } }));
        }
        return null;
      },
    }),
    {
      name: 'nexel-workspace-store',
      storage: createJSONStorage(() => electronStorage),
      partialize: (state) => ({
        rootPath: state.rootPath,
        rootName: state.rootName,
        activeDir: state.activeDir,
        pinnedPaths: state.pinnedPaths,
        recentWorkspaces: state.recentWorkspaces,
        searchQuery: state.searchQuery,
        isRegex: state.isRegex,
        isMatchCase: state.isMatchCase,
      }),
    }
  )
);
