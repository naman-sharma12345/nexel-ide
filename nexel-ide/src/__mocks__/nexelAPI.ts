import type { INexelAPI, IFileNode, ICategorizedContests } from '../nexel-env';

const mockStore = new Map<string, any>();

export const mockNexelAPI: INexelAPI = {
  minimizeWindow: () => {},
  maximizeWindow: () => {},
  closeWindow: () => {},
  
  openWorkspaceDir: async () => 'C:/mock-workspace',
  
  readWorkspaceFiles: async (dirPath: string): Promise<IFileNode[]> => {
    return [
      {
        name: 'src',
        path: `${dirPath}/src`,
        type: 'folder',
        children: [
          { name: 'main.cpp', path: `${dirPath}/src/main.cpp`, type: 'file' }
        ]
      },
      {
        name: 'test.cpp',
        path: `${dirPath}/test.cpp`,
        type: 'file'
      }
    ];
  },
  
  createFile: async (parentPath: string, fileName: string) => `${parentPath}/${fileName}`,
  createFolder: async (parentPath: string, folderName: string) => `${parentPath}/${folderName}`,
  renameNode: async (_oldPath: string, newPath: string) => newPath,
  deleteNode: async () => true,
  readFileContent: async () => '#include <iostream>\nint main() { return 0; }',
  writeFileContent: async () => true,
  
  createTerminal: async () => true,
  writeTerminal: () => {},
  resizeTerminal: () => {},
  onTerminalData: () => {},

  runJudge: async (_filePath: string, testCases: any[], _timeLimit?: number, _memoryLimit?: number) => {
    return testCases.map(tc => ({
      id: tc.id,
      verdict: tc.input.includes('fail') ? 'WA' : 'AC',
      metrics: { time: 42, memory: 1.2, exitCode: 0 },
      actual: tc.input.includes('fail') ? 'wrong output' : tc.expected,
      expected: tc.expected,
      passed: !tc.input.includes('fail'),
      diff: tc.input.includes('fail') ? 'diff details' : ''
    }));
  },

  fetchContests: async (): Promise<ICategorizedContests> => {
    return {
      active: [
        { id: 100, name: 'Mock Active Contest', type: 'CF', phase: 'CODING', durationSeconds: 7200, startTimeSeconds: Date.now() / 1000 }
      ],
      upcoming: [
        { id: 101, name: 'Mock Upcoming Contest', type: 'CF', phase: 'BEFORE', durationSeconds: 7200, startTimeSeconds: Date.now() / 1000 + 3600 }
      ],
      passed: [
        { id: 99, name: 'Mock Finished Contest', type: 'CF', phase: 'FINISHED', durationSeconds: 7200, startTimeSeconds: Date.now() / 1000 - 7200 }
      ]
    };
  },

  fetchContestProblems: async (_contestId: number | string) => {
    return {
      status: 'OK',
      result: [
        { index: 'A', name: 'Mock Problem A', type: 'PROGRAMMING', points: 500 },
        { index: 'B', name: 'Mock Problem B', type: 'PROGRAMMING', points: 1000 }
      ]
    };
  },

  getStoreSync: (key: string) => {
    return mockStore.get(key);
  },

  setStoreSync: (key: string, value: any) => {
    mockStore.set(key, value);
  },

  deleteStoreSync: (key: string) => {
    mockStore.delete(key);
  }
};

// Wire the mock object onto window.nexelAPI
if (typeof window !== 'undefined') {
  window.nexelAPI = mockNexelAPI;
} else {
  (global as any).window = { nexelAPI: mockNexelAPI };
}
(global as any).nexelAPI = mockNexelAPI;
