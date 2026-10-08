import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JudgeSystem } from '../JudgeSystem';
import { useJudgeStore } from '../../stores/useJudgeStore';

describe('JudgeSystem component rendering', () => {
  beforeEach(() => {
    // Reset judge store to default clean state
    useJudgeStore.setState({
      testCases: [
        { id: 1, name: 'TC 1', input: '5', expected: '10', actual: '', verdict: 'IDLE' }
      ],
      activeTCId: 1,
      activeTab: 'input',
      isRunning: false
    });
  });

  it('renders input tab text area by default', () => {
    render(<JudgeSystem activeFilePath="main.cpp" />);
    const textarea = screen.getByPlaceholderText(/Enter active testcase input data.../i);
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('5');
  });

  it('verifies the Diff Viewer correctly highlights mismatched and matched lines', () => {
    // Populate store with mismatched diff state
    useJudgeStore.setState({
      testCases: [
        {
          id: 1,
          name: 'TC 1',
          input: '5',
          expected: 'line1\nline2\nline3',
          actual: 'line1\nlineX\nline3',
          verdict: 'WA'
        }
      ],
      activeTCId: 1,
      activeTab: 'diff'
    });

    const { container } = render(<JudgeSystem activeFilePath="main.cpp" />);
    
    // Check row classes for match/mismatch
    const lineRows = container.querySelectorAll('.nx-diff-line-row');
    expect(lineRows.length).toBe(3);
    
    expect(lineRows[0]).toHaveClass('match');
    expect(lineRows[1]).toHaveClass('mismatch');
    expect(lineRows[2]).toHaveClass('match');
  });

  it('verifies that an AC verdict applies correct classes to textarea and metrics panel', () => {
    // Set store state to correct AC verdict
    useJudgeStore.setState({
      testCases: [
        {
          id: 1,
          name: 'TC 1',
          input: '5',
          expected: '10',
          actual: '10',
          verdict: 'AC',
          time: 25,
          memory: 0.8,
          exitCode: 0
        }
      ],
      activeTCId: 1,
      activeTab: 'actual'
    });

    const { container } = render(<JudgeSystem activeFilePath="main.cpp" />);
    
    // Verify textarea has .passed-area class
    const textarea = container.querySelector('.nx-judge-textarea');
    expect(textarea).toHaveClass('passed-area');

    // Verify metrics panel has .passed class
    const metricsPanel = container.querySelector('.nx-judge-metrics-panel');
    expect(metricsPanel).toHaveClass('passed');
  });
});
