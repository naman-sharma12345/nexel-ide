import { dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Worker } from 'worker_threads';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  isOpen?: boolean;
  children?: FileNode[];
}

export class FileSystemService {
  async openDir(): Promise<string | null> {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Nexel IDE Workspace Folder'
      });
      if (result.canceled) return null;
      return result.filePaths[0];
    } catch (err) {
      console.error("Native showOpenDialog call failed:", err);
      throw err;
    }
  }

  async readFiles(dirPath: string): Promise<FileNode[]> {
    return new Promise((resolve, reject) => {
      // Load the CommonJS wrapper which bootstraps the TypeScript worker
      const workerPath = path.join(__dirname, 'FileTreeWorker.cjs');
      const worker = new Worker(workerPath, {
        workerData: { dirPath }
      });

      worker.on('message', (message: { children?: FileNode[]; error?: string }) => {
        if (message.error) {
          reject(new Error(message.error));
        } else if (message.children) {
          resolve(message.children);
        } else {
          resolve([]);
        }
      });

      worker.on('error', (err) => {
        reject(err);
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit status ${code}`));
        }
      });
    });
  }

  async createFile(parentPath: string, fileName: string): Promise<string> {
    const resolvedParent = path.resolve(parentPath);
    const filePath = path.join(parentPath, fileName);
    const resolvedFile = path.resolve(filePath);

    if (!resolvedFile.startsWith(resolvedParent)) {
      throw new Error("Security Violation: Path traversal attempt blocked");
    }

    // New File must never truncate an existing file, including a racing create.
    await fs.writeFile(filePath, '', { encoding: 'utf8', flag: 'wx' });
    return filePath;
  }

  async createFolder(parentPath: string, folderName: string): Promise<string> {
    const resolvedParent = path.resolve(parentPath);
    const folderPath = path.join(parentPath, folderName);
    const resolvedFolder = path.resolve(folderPath);

    if (!resolvedFolder.startsWith(resolvedParent)) {
      throw new Error("Security Violation: Path traversal attempt blocked");
    }

    await fs.mkdir(folderPath, { recursive: true });
    return folderPath;
  }

  async rename(oldPath: string, newPath: string): Promise<string> {
    await fs.rename(oldPath, newPath);
    return newPath;
  }

  async deleteNode(targetPath: string): Promise<boolean> {
    await fs.rm(targetPath, { recursive: true, force: true });
    return true;
  }

  async readFileContent(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf8');
  }

  async writeFileContent(filePath: string, content: string): Promise<boolean> {
    await fs.writeFile(filePath, content, 'utf8');
    return true;
  }
}
