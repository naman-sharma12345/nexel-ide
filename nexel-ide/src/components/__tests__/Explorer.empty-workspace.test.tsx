import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Explorer } from '../Explorer';
import { useWorkspaceStore } from '../../stores/useWorkspaceStore';

describe('Explorer with an empty workspace folder', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      rootPath: 'C:/empty-ws',
      rootName: 'EMPTY-WS',
      activeDir: 'C:/empty-ws',
      tree: [],
      pinnedPaths: [],
      searchQuery: '',
      isRegex: false,
      isMatchCase: false,
      lastSelectedNode: null,
      inlineInput: { visible: false, nodePath: '', mode: 'new-file', defaultValue: '' },
    });
    vi.spyOn(window.nexelAPI, 'readWorkspaceFiles').mockResolvedValue([]);
  });

  it('offers creation entry points instead of the Open Folder prompt', () => {
    render(<Explorer />);
    expect(screen.getByText('This folder is empty')).toBeInTheDocument();
    expect(screen.getByText('New File')).toBeInTheDocument();
    expect(screen.getByText('New Folder')).toBeInTheDocument();
    expect(screen.queryByText('Open Folder')).not.toBeInTheDocument();
  });

  it('header New File button reveals the inline input at the workspace root', () => {
    render(<Explorer />);
    fireEvent.click(screen.getByTitle('New File'));
    expect(screen.getByDisplayValue('untitled.txt')).toBeInTheDocument();
  });

  it('creates a file at the workspace root from the empty state', async () => {
    const createSpy = vi.spyOn(window.nexelAPI, 'createFile');
    render(<Explorer />);
    fireEvent.click(screen.getByText('New File'));
    const input = await screen.findByDisplayValue('untitled.txt');
    fireEvent.change(input, { target: { value: 'solve.cpp' } });
    fireEvent.submit(input.closest('form')!);
    await vi.waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith('C:/empty-ws', 'solve.cpp');
    });
  });

  it('creates a folder at the workspace root from the empty state', async () => {
    const folderSpy = vi.spyOn(window.nexelAPI, 'createFolder');
    render(<Explorer />);
    fireEvent.click(screen.getByText('New Folder'));
    const input = await screen.findByDisplayValue('NewFolder');
    fireEvent.change(input, { target: { value: 'stress' } });
    fireEvent.submit(input.closest('form')!);
    await vi.waitFor(() => {
      expect(folderSpy).toHaveBeenCalledWith('C:/empty-ws', 'stress');
    });
  });
});
