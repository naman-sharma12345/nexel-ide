import React, { useState, useEffect, useRef } from 'react';
import './Explorer.css';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import type { FileNode } from '../stores/useWorkspaceStore';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: FileNode | null;
}

interface ExplorerProps {
  onFileSelect?: (filePath: string, isDoubleClicked?: boolean) => void;
  activeFilePath?: string | null;
}

/** Active file and clicked (selected) node are different states: only one row may look active. */
export function explorerRowState(activePath: string | null | undefined, selectedPath: string | null, nodePath: string): 'active' | 'selected' | 'none' {
  if (activePath && activePath === nodePath) return 'active';
  if (selectedPath && selectedPath === nodePath) return 'selected';
  return 'none';
}

export interface FlatVisibleNode { node: FileNode; parent: FileNode | null; }

/** Visible rows in render order: a folder's children appear only while it is open. */
export function flattenVisibleNodes(nodes: FileNode[], parent: FileNode | null = null): FlatVisibleNode[] {
  const out: FlatVisibleNode[] = [];
  for (const n of nodes) {
    out.push({ node: n, parent });
    if (n.type === 'folder' && n.isOpen && n.children) {
      out.push(...flattenVisibleNodes(n.children, n));
    }
  }
  return out;
}

export const Explorer: React.FC<ExplorerProps> = ({ onFileSelect, activeFilePath }) => {
  const {
    rootPath,
    rootName,
    tree,
    pinnedPaths,
    searchQuery,
    isRegex,
    isMatchCase,
    lastSelectedNode,
    inlineInput,
    togglePin,
    setSearchQuery,
    setRegex,
    setMatchCase,
    setLastSelectedNode,
    setInlineInput,
    openWorkspaceDir,
    refreshTree,
    toggleFolder,
    collapseAllFolders,
    triggerHeaderNewFile,
    triggerHeaderNewFolder,
    handleDeleteNode,
    handleInlineSubmit,
  } = useWorkspaceStore();

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    node: null
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const treeScrollRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Load initial workspace tree if rootPath is restored by Zustand
  useEffect(() => {
    if (rootPath && tree.length === 0) {
      refreshTree();
    }
  }, [rootPath, tree.length, refreshTree]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const clickHandler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener('click', clickHandler);
    return () => window.removeEventListener('click', clickHandler);
  }, []);

  // Autofocus inline input and select text
  useEffect(() => {
    if (inlineInput.visible && inputRef.current) {
      inputRef.current.focus();
      if (inlineInput.mode === 'rename') {
        const dotIndex = inlineInput.defaultValue.lastIndexOf('.');
        if (dotIndex > 0 && inlineInput.mode === 'rename') {
          inputRef.current.setSelectionRange(0, dotIndex);
        } else {
          inputRef.current.select();
        }
      } else {
        inputRef.current.select();
      }
    }
  }, [inlineInput.visible, inlineInput.mode, inlineInput.defaultValue]);

  // Drag and Drop implementation
  const handleDragStart = (e: React.DragEvent, node: FileNode) => {
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, node: FileNode) => {
    if (node.type === 'folder') {
      e.preventDefault(); // Allows drop
      e.currentTarget.classList.add('nx-drag-over');
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('nx-drag-over');
  };

  const handleDrop = async (e: React.DragEvent, targetNode: FileNode) => {
    e.preventDefault();
    e.currentTarget.classList.remove('nx-drag-over');
    
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === targetNode.path) return;

    const sourceName = sourcePath.split('/').pop() || '';
    const newPath = `${targetNode.path}/${sourceName}`;

    try {
      await window.nexelAPI.renameNode(sourcePath, newPath);
      await refreshTree();
    } catch (err) {
      console.error("Drop relocate operation failed:", err);
    }
  };

  // Context Menu Actions
  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    
    const menuHeight = node.type === 'folder' ? 220 : 180;
    const adjustedY = e.clientY + menuHeight > window.innerHeight 
      ? Math.max(10, e.clientY - menuHeight) 
      : e.clientY;

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: adjustedY,
      node
    });
  };

  const handleEmptyAreaContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!rootPath) return;

    const menuHeight = 220;
    const adjustedY = e.clientY + menuHeight > window.innerHeight 
      ? Math.max(10, e.clientY - menuHeight) 
      : e.clientY;

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: adjustedY,
      node: { name: rootName, path: rootPath, type: 'folder' }
    });
  };

  const triggerNewFile = (parentFolder: FileNode) => {
    setContextMenu(prev => ({ ...prev, visible: false }));
    setInlineInput({
      visible: true,
      nodePath: parentFolder.path,
      mode: 'new-file',
      defaultValue: 'untitled.txt'
    });
  };

  const triggerNewFolder = (parentFolder: FileNode) => {
    setContextMenu(prev => ({ ...prev, visible: false }));
    setInlineInput({
      visible: true,
      nodePath: parentFolder.path,
      mode: 'new-folder',
      defaultValue: 'NewFolder'
    });
  };

  const triggerRename = (node: FileNode) => {
    setContextMenu(prev => ({ ...prev, visible: false }));
    setInlineInput({
      visible: true,
      nodePath: node.path,
      mode: 'rename',
      defaultValue: node.name
    });
  };

  const handleInlineSubmitWrapper = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = inputRef.current?.value.trim();
    if (!value) {
      setInlineInput({ visible: false });
      return;
    }
    const createdPath = await handleInlineSubmit(value);
    if (createdPath && onFileSelect) {
      onFileSelect(createdPath, true);
    }
  };

  // Renders the muted/accented extension beautifully
  const renderLabelWithHighlights = (name: string, isSelected: boolean) => {
    if (searchQuery) {
      let isMatch: boolean;
      let q = searchQuery;
      if (!isMatchCase) q = q.toLowerCase();

      let target = name;
      if (!isMatchCase) target = target.toLowerCase();

      if (isRegex) {
        try {
          const reg = new RegExp(searchQuery, isMatchCase ? '' : 'i');
          isMatch = reg.test(name);
        } catch {
          isMatch = false;
        }
      } else {
        isMatch = target.includes(q);
      }

      if (isMatch) {
        return <span className="nx-node-text nx-search-match">{name}</span>;
      }
    }

    const dotIndex = name.lastIndexOf('.');
    if (dotIndex === -1 || name.startsWith('.')) {
      return <span className="nx-node-text">{name}</span>;
    }
    const baseName = name.substring(0, dotIndex);
    const extension = name.substring(dotIndex);
    return (
      <span className="nx-node-text">
        {baseName}
        <span className={`nx-file-ext ${isSelected ? 'active' : ''}`}>{extension}</span>
      </span>
    );
  };

  const scrollRowIntoView = (path: string) => {
    requestAnimationFrame(() => {
      treeScrollRef.current?.querySelector(`[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  };

  // VS Code-style tree keyboard navigation on the focused tree panel.
  const handleTreeKeyDown = (e: React.KeyboardEvent) => {
    if (inlineInput.visible) return;
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const flat = flattenVisibleNodes(tree);
    if (!flat.length) return;
    const idx = flat.findIndex(f => f.node.path === lastSelectedNode?.path);

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      let targetIdx: number;
      if (idx === -1) targetIdx = e.key === 'ArrowDown' ? 0 : flat.length - 1;
      else targetIdx = e.key === 'ArrowDown' ? Math.min(idx + 1, flat.length - 1) : Math.max(idx - 1, 0);
      setLastSelectedNode(flat[targetIdx].node);
      scrollRowIntoView(flat[targetIdx].node.path);
    } else if (e.key === 'ArrowRight' && idx >= 0) {
      e.preventDefault();
      const { node } = flat[idx];
      if (node.type === 'folder') {
        if (!node.isOpen) toggleFolder(node.path);
        else if (node.children && node.children.length) {
          setLastSelectedNode(node.children[0]);
          scrollRowIntoView(node.children[0].path);
        }
      }
    } else if (e.key === 'ArrowLeft' && idx >= 0) {
      e.preventDefault();
      const { node, parent } = flat[idx];
      if (node.type === 'folder' && node.isOpen) toggleFolder(node.path);
      else if (parent) {
        setLastSelectedNode(parent);
        scrollRowIntoView(parent.path);
      }
    } else if (e.key === 'Enter' && idx >= 0) {
      e.preventDefault();
      const { node } = flat[idx];
      if (node.type === 'folder') toggleFolder(node.path);
      else if (onFileSelect) onFileSelect(node.path, true);
    } else if (e.key === 'F2' && idx >= 0) {
      e.preventDefault();
      triggerRename(flat[idx].node);
    } else if (e.key === 'Delete' && idx >= 0) {
      e.preventDefault();
      handleDeleteNode(flat[idx].node);
    }
  };

  // Tree recursive rendering
  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map((node, index) => {
      const rowState = explorerRowState(activeFilePath, lastSelectedNode?.path ?? null, node.path);
      const isFolder = node.type === 'folder';

      // Inline editing element placement
      const isInlineEditingThisNode = inlineInput.visible && inlineInput.nodePath === node.path && inlineInput.mode === 'rename';
      const showInlineCreationHere = inlineInput.visible && inlineInput.nodePath === node.path && (inlineInput.mode === 'new-file' || inlineInput.mode === 'new-folder');

      return (
        <div key={`${node.path}-${index}`} className="nx-node-block">
          {isInlineEditingThisNode ? (
            <form onSubmit={handleInlineSubmitWrapper} className="nx-inline-input-form" style={{ paddingLeft: `${depth * 14 + 18}px` }}>
              <div className="nx-inline-input-wrapper">
                <span className="nx-inline-icon-indicator">
                  {node.type === 'folder' ? (
                    <svg className="nx-svg-icon folder open" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  ) : (
                    <svg className="nx-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                      <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                  )}
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  defaultValue={inlineInput.defaultValue}
                  onBlur={() => setInlineInput({ visible: false })}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setInlineInput({ visible: false });
                  }}
                  className="nx-inline-textbox"
                />
              </div>
            </form>
          ) : (
            <div 
              className={`nx-node-row ${rowState === 'active' ? 'nx-row-selected' : rowState === 'selected' ? 'nx-row-focused' : ''}`}
              data-path={node.path}
              data-ext={!isFolder && node.name.includes('.') ? node.name.split('.').pop()!.toLowerCase() : undefined}
              style={{ paddingLeft: `${depth * 14 + 18}px` }}
              draggable
              onDragStart={(e) => handleDragStart(e, node)}
              onDragOver={(e) => handleDragOver(e, node)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, node)}
              onContextMenu={(e) => handleContextMenu(e, node)}
              onClick={(e) => {
                e.stopPropagation();
                treeScrollRef.current?.focus();
                setLastSelectedNode(node);
                if (isFolder) {
                  toggleFolder(node.path);
                } else {
                  if (onFileSelect) onFileSelect(node.path, false);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                treeScrollRef.current?.focus();
                setLastSelectedNode(node);
                if (!isFolder && onFileSelect) {
                  onFileSelect(node.path, true);
                }
              }}
            >
              {isFolder ? (
                <span className={`nx-chevron ${node.isOpen ? 'open' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 5l7 7-7 7"/></svg>
                </span>
              ) : (
                <span className="nx-chevron-spacer" />
              )}

              <span className="nx-icon-frame">
                {isFolder ? (
                  <svg className={`nx-svg-icon folder ${node.isOpen ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                ) : (
                  <svg className="nx-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                  </svg>
                )}
              </span>

              {renderLabelWithHighlights(node.name, rowState !== 'none')}

              {/* Hover quick shortcut overlay */}
              <div className="nx-row-actions">
                {isFolder && (
                  <button className="nx-row-act-btn" title="New File" onClick={(e) => { e.stopPropagation(); triggerNewFile(node); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                  </button>
                )}
                <button className="nx-row-act-btn delete" title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteNode(node); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
            </div>
          )}

          {/* Inline creation field inside matching folder tree */}
          {showInlineCreationHere && (
            <div style={{ paddingLeft: `${(depth + 1) * 14 + 18}px` }}>
              <form onSubmit={handleInlineSubmitWrapper} className="nx-inline-input-form">
                <div className="nx-inline-input-wrapper">
                  <span className="nx-inline-icon-indicator">
                    {inlineInput.mode === 'new-folder' ? (
                      <svg className="nx-svg-icon folder open" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : (
                      <svg className="nx-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                        <polyline points="13 2 13 9 20 9"></polyline>
                      </svg>
                    )}
                  </span>
                  <input
                    ref={inputRef}
                    type="text"
                    defaultValue={inlineInput.defaultValue}
                    onBlur={() => setInlineInput({ visible: false })}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setInlineInput({ visible: false });
                    }}
                    className="nx-inline-textbox"
                  />
                </div>
              </form>
            </div>
          )}

          {isFolder && node.isOpen && node.children && (
            <div className="nx-nested-children">
              {renderTree(node.children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="nx-explorer-wrapper">
      <div className="nx-explorer-header">
        <span className="nx-explorer-title" onClick={openWorkspaceDir} title="Click to Switch Working Directories">
          {rootName}
        </span>
        
        <div className="nx-action-bar">
          <button 
            className="nx-action-btn" 
            title="New File" 
            onClick={triggerHeaderNewFile}
            disabled={!rootPath}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
          </button>
          <button 
            className="nx-action-btn" 
            title="New Folder" 
            onClick={triggerHeaderNewFolder}
            disabled={!rootPath}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
          </button>
          <button className="nx-action-btn" title="Refresh Tree" onClick={() => refreshTree()} disabled={!rootPath}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
          </button>
          <button className="nx-action-btn" title="Collapse All Folders" onClick={collapseAllFolders} disabled={tree.length === 0}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.5"></rect><line x1="7" y1="12" x2="17" y2="12"></line></svg>
          </button>
        </div>
      </div>

      {/* Real-time Workspace Search/Filter belt */}
      {rootPath && (
        <div className="nx-search-belt">
          <div className="nx-search-input-frame">
            <input 
              type="text" 
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="nx-search-textbox"
            />
            <div className="nx-search-toggles">
              <button 
                className={`nx-search-tog-btn ${isMatchCase ? 'active' : ''}`}
                title="Match Case"
                onClick={() => setMatchCase(!isMatchCase)}
              >
                Aa
              </button>
              <button 
                className={`nx-search-tog-btn ${isRegex ? 'active' : ''}`}
                title="Use Regular Expression"
                onClick={() => setRegex(!isRegex)}
              >
                .*
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sleek Bookmarks/Pinned shelf */}
      {pinnedPaths.length > 0 && (
        <div className="nx-pinned-shelf">
          <div className="nx-shelf-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            PINNED WORKSPACE FILES
          </div>
          <div className="nx-shelf-items">
            {pinnedPaths.map((pathStr) => {
              const nameStr = pathStr.split('/').pop() || '';
              return (
                <div 
                  key={pathStr} 
                  className={`nx-shelf-item ${activeFilePath === pathStr ? 'active' : ''}`}
                  onClick={() => onFileSelect && onFileSelect(pathStr, false)}
                >
                  <span className="nx-shelf-icon-frame">
                    <svg className="nx-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                      <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                  </span>
                  <span className="nx-shelf-text">{nameStr}</span>
                  <button 
                    className="nx-shelf-unpin-btn" 
                    title="Unpin File"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(pathStr);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main tree list scroll panel */}
      <div 
        className="nx-tree-scroll"
        ref={treeScrollRef}
        tabIndex={0}
        onKeyDown={handleTreeKeyDown}
        onContextMenu={handleEmptyAreaContextMenu}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setLastSelectedNode(null);
          }
        }}
      >
        {!rootPath ? (
          <div className="nx-empty-state">
            <button className="nx-open-prompt-btn" onClick={openWorkspaceDir}>Open Folder</button>
          </div>
        ) : (
          <>
            {/* Workspace is open but the folder is empty: offer creation entry points
                and let the root inline form (below) render here too. */}
            {tree.length === 0 && !(inlineInput.visible && inlineInput.nodePath === rootPath && (inlineInput.mode === 'new-file' || inlineInput.mode === 'new-folder')) && (
              <div className="nx-empty-state nx-empty-state--ws">
                <span className="nx-empty-label">This folder is empty</span>
                <div className="nx-empty-actions">
                  <button className="nx-empty-action-btn" onClick={triggerHeaderNewFile}>New File</button>
                  <button className="nx-empty-action-btn" onClick={triggerHeaderNewFolder}>New Folder</button>
                </div>
              </div>
            )}
            {/* Render root level inline creation form */}
            {inlineInput.visible && inlineInput.nodePath === rootPath && (inlineInput.mode === 'new-file' || inlineInput.mode === 'new-folder') && (
              <div style={{ paddingLeft: '18px', margin: '2px 8px' }}>
                <form onSubmit={handleInlineSubmitWrapper} className="nx-inline-input-form">
                  <div className="nx-inline-input-wrapper">
                    <span className="nx-inline-icon-indicator">
                      {inlineInput.mode === 'new-folder' ? (
                        <svg className="nx-svg-icon folder open" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      ) : (
                        <svg className="nx-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                          <polyline points="13 2 13 9 20 9"></polyline>
                        </svg>
                      )}
                    </span>
                    <input
                      ref={inputRef}
                      type="text"
                      defaultValue={inlineInput.defaultValue}
                      onBlur={() => setInlineInput({ visible: false })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setInlineInput({ visible: false });
                      }}
                      className="nx-inline-textbox"
                    />
                  </div>
                </form>
              </div>
            )}

            {renderTree(tree)}
          </>
        )}
      </div>

      {/* Floating high-fidelity Context Menu */}
      {contextMenu.visible && contextMenu.node && (
        <div 
          ref={contextMenuRef}
          className="nx-context-menu"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
        >
          {contextMenu.node.type === 'folder' ? (
            <>
              <div className="nx-context-item" onClick={() => triggerNewFile(contextMenu.node!)}>New File</div>
              <div className="nx-context-item" onClick={() => triggerNewFolder(contextMenu.node!)}>New Folder</div>
              <div className="nx-divider" />
            </>
          ) : null}
          {contextMenu.node.path !== rootPath ? (
            <>
              <div className="nx-context-item" onClick={() => triggerRename(contextMenu.node!)}>Rename...</div>
              <div className="nx-context-item danger" onClick={() => handleDeleteNode(contextMenu.node!)}>Delete</div>
              <div className="nx-divider" />
              <div className="nx-context-item" onClick={() => handleTogglePin(contextMenu.node!)}>
                {pinnedPaths.includes(contextMenu.node.path) ? 'Unpin File' : 'Pin File to Shelf'}
              </div>
            </>
          ) : null}
          <div className="nx-context-item" onClick={() => handleCopyPath(contextMenu.node!)}>Copy Path</div>
        </div>
      )}
    </div>
  );

  function handleTogglePin(node: FileNode) {
    setContextMenu(prev => ({ ...prev, visible: false }));
    togglePin(node.path);
  }

  function handleCopyPath(node: FileNode) {
    setContextMenu(prev => ({ ...prev, visible: false }));
    navigator.clipboard.writeText(node.path);
  }
};
