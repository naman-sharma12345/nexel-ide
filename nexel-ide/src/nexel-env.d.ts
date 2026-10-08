export interface IFileNode {
  name: string;       // e.g., "main.cpp"
  path: string;       // e.g., "C:/contests/main.cpp"
  type: 'file' | 'folder';
  children?: IFileNode[]; // Recursive: folders can have more files/folders inside
}

export interface IContest {
  id: number;
  name: string;
  type: string;
  phase: 'BEFORE' | 'CODING' | 'FINISHED' | 'PENDING_SYSTEM_TEST' | 'SYSTEM_TEST';
  durationSeconds: number;
  startTimeSeconds: number;
  relativeTimeSeconds?: number;
}

export interface ICategorizedContests {
  active: IContest[];
  upcoming: IContest[];
  passed: IContest[];
}

export interface INexelAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  openWorkspaceDir: () => Promise<string | null>;
  readWorkspaceFiles: (dirPath: string) => Promise<IFileNode[]>;
  createFile: (parentPath: string, fileName: string) => Promise<string>;
  createFolder: (parentPath: string, folderName: string) => Promise<string>;
  renameNode: (oldPath: string, newPath: string) => Promise<string>;
  deleteNode: (targetPath: string) => Promise<boolean>;
  readFileContent: (filePath: string) => Promise<string>;
  writeFileContent: (filePath: string, content: string) => Promise<boolean>;
  createTerminal: () => Promise<boolean>;
  writeTerminal: (data: string) => void;
  resizeTerminal: (cols: number, rows: number) => void;
  onTerminalData: (callback: (data: string) => void) => void;
  runJudge: (
    filePath: string,
    testCases: Array<{ id: number; input: string; expected: string }>,
    timeLimit?: number,
    memoryLimit?: number
  ) => Promise<Array<{
    id: number;
    verdict: 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE';
    metrics: { time: number; memory: number; exitCode: number | null };
    actual: string;
    expected?: string;
    passed?: boolean;
    diff?: string;
  }>>;
  fetchContests: (
    workspaceDir?: string | null
  ) => Promise<ICategorizedContests>;
  fetchContestProblems: (
    contestId: number | string
  ) => Promise<Record<string, unknown>>;
  onCompanionProblem?: (callback: (problem: {
    name: string; group: string; url: string; timeLimit: number; memoryLimit: number; fileName: string;
    tests: Array<{ input: string; output: string }>;
  }) => void) => void;
  getStoreSync: (key: string) => any;
  setStoreSync: (key: string, value: any) => void;
  deleteStoreSync: (key: string) => void;
}

declare global {
  interface Window {
    nexelAPI: INexelAPI;
  }
}