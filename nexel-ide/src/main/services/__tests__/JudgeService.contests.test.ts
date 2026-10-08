// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { JudgeService } from '../JudgeService';
import { EventEmitter } from 'events';

// Mock child_process and fs/promises
vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();
  return {
    ...original,
    spawn: vi.fn(),
  };
});

vi.mock('fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs/promises')>();
  return {
    ...original,
    readFile: vi.fn(),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
});

interface MockChildProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

describe('JudgeService Contests System (New User / No Credentials)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('fetchContests fetches and categorizes contests correctly from public API without credentials', async () => {
    const mockContestsList = {
      status: 'OK',
      result: [
        { id: 100, name: 'Active Contest', type: 'CF', phase: 'CODING', frozen: false, durationSeconds: 7200, startTimeSeconds: 1700000000, relativeTimeSeconds: 0 },
        { id: 101, name: 'Upcoming Contest 1', type: 'CF', phase: 'BEFORE', frozen: false, durationSeconds: 7200, startTimeSeconds: 1700007200, relativeTimeSeconds: -7200 },
        { id: 102, name: 'Upcoming Contest 2', type: 'CF', phase: 'BEFORE', frozen: false, durationSeconds: 7200, startTimeSeconds: 1700014400, relativeTimeSeconds: -14400 },
        { id: 99, name: 'Passed Contest 1', type: 'CF', phase: 'FINISHED', frozen: false, durationSeconds: 7200, startTimeSeconds: 1699992800, relativeTimeSeconds: 7200 },
        { id: 98, name: 'Passed Contest 2', type: 'CF', phase: 'FINISHED', frozen: false, durationSeconds: 7200, startTimeSeconds: 1699985600, relativeTimeSeconds: 14400 }
      ]
    };

    const globalFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockContestsList
    });
    vi.stubGlobal('fetch', globalFetchMock);

    const judgeService = new JudgeService();
    const contests = await judgeService.fetchContests();

    expect(globalFetchMock).toHaveBeenCalledWith('https://codeforces.com/api/contest.list?gym=false', expect.objectContaining({ signal: expect.anything() }));
    expect(contests.active.length).toBe(1);
    expect(contests.active[0].id).toBe(100);
    expect(contests.upcoming.length).toBe(2);
    expect(contests.passed.length).toBe(2);
    expect(contests.passed[0].id).toBe(99);

    vi.unstubAllGlobals();
  });

  it('fetchProblems spawns scraper with isolated non-existent credential/cookie file environments', async () => {
    const mockSpawn = spawn as unknown as ReturnType<typeof vi.fn>;
    const mockReadFile = fs.readFile as unknown as ReturnType<typeof vi.fn>;

    const childMock = new EventEmitter() as unknown as MockChildProcess;
    childMock.stdout = new EventEmitter();
    childMock.stderr = new EventEmitter();
    childMock.kill = vi.fn();

    mockSpawn.mockReturnValue(childMock);
    
    const mockProblemsJson = JSON.stringify({
      A: { index: 'A', title: 'Problem A', url: 'https://codeforces.com/contest/99/problem/A', timeLimit: '1.0s', memoryLimit: '256MB', statement: '<p>statement</p>' }
    });
    mockReadFile.mockResolvedValue(mockProblemsJson);

    const judgeService = new JudgeService();
    const fetchPromise = judgeService.fetchProblems(99);

    // Simulate child process executing successfully and closing
    setTimeout(() => {
      childMock.emit('close', 0);
    }, 50);

    const result = await fetchPromise;

    // Verify spawn details
    expect(mockSpawn).toHaveBeenCalled();
    const spawnArgs = mockSpawn.mock.calls[0];
    expect(spawnArgs[0]).toBe('node');
    expect(spawnArgs[1][0]).toContain('cf_problems.js');
    expect(spawnArgs[1][1]).toBe('99');

    // Verify env is passed correctly with NON_INTERACTIVE
    const spawnOpts = spawnArgs[2];
    expect(spawnOpts.env.NON_INTERACTIVE).toBe('true');

    // Verify we successfully parsed the problems
    expect(result).toHaveProperty('A');
    expect((result as any).A.title).toBe('Problem A');
  });
});
