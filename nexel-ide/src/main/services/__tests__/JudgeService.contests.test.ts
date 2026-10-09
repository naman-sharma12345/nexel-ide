// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JudgeService } from '../JudgeService';

// Mock child_process and fs/promises
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

  it('fetchProblems no longer needs an external scraper', async () => {
    const judgeService = new JudgeService();
    await expect(judgeService.fetchProblems(-5)).rejects.toThrow('Invalid contest id');
  });
});
