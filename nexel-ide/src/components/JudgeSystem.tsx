import React, { useState } from 'react';
import { useJudgeStore } from '../stores/useJudgeStore';
import { useEditorStore } from '../stores/useEditorStore';
import { StressPanel } from './StressPanel';
import './JudgeSystem.css';

interface JudgeSystemProps {
  activeFilePath?: string | null;
}

export const JudgeSystem: React.FC<JudgeSystemProps> = ({ activeFilePath }) => {
  const {
    testCases,
    activeTCId,
    activeTab,
    isRunning,
    addTestCase,
    deleteTestCase,
    updateTestCase,
    setActiveTCId,
    setActiveTab,
    setRunning,
  } = useJudgeStore();

  const [showAcEffect, setShowAcEffect] = useState<boolean>(false);
  const [showWaEffect, setShowWaEffect] = useState<boolean>(false);
  const [showStress, setShowStress] = useState<boolean>(false);

  const activeTC = testCases.find(tc => tc.id === activeTCId) || testCases[0];

  const handleDeleteTestCase = (e: React.MouseEvent, idToDelete: number) => {
    e.stopPropagation();
    deleteTestCase(idToDelete);
  };

  const handleTextChange = (value: string) => {
    // Only allow updating input and expected. actual is read-only.
    if (activeTab === 'input' || activeTab === 'expected') {
      updateTestCase(activeTCId, { [activeTab]: value });
    }
  };

  const handleRun = async () => {
    if (!activeFilePath) {
      alert("Please open a valid C++, Python, or Java source file in the editor first.");
      return;
    }

    setRunning(true);
    
    // Set all testcases to RUNNING state for visual cue animations
    useJudgeStore.setState({
      testCases: testCases.map(tc => ({ ...tc, verdict: 'RUNNING', actual: '' }))
    });

    try {
      const payload = testCases.map(tc => ({
        id: tc.id,
        input: tc.input,
        expected: tc.expected
      }));

      const results = await window.nexelAPI.runJudge(activeFilePath, payload, 2000, 256);

      useJudgeStore.setState({
        testCases: testCases.map(tc => {
          const res = results.find(r => r.id === tc.id);
          if (res) {
            return {
              ...tc,
              verdict: res.verdict,
              actual: res.actual,
              time: res.metrics.time,
              memory: res.metrics.memory,
              exitCode: res.metrics.exitCode,
              errorMsg: res.diff
            };
          }
          return tc;
        })
      });

      const allAc = results.length > 0 && results.every(r => r.verdict === 'AC');
      const anyWa = results.some(r => r.verdict === 'WA' || r.verdict === 'TLE' || r.verdict === 'MLE' || r.verdict === 'RE');

      if (allAc) {
        setShowAcEffect(true);
        useEditorStore.getState().triggerAcCelebration();
        setTimeout(() => setShowAcEffect(false), 1500);
      } else if (anyWa) {
        setShowWaEffect(true);
        setTimeout(() => setShowWaEffect(false), 800);
      }

      setActiveTab('actual');

    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      useJudgeStore.setState({
        testCases: testCases.map(tc => ({
          ...tc,
          verdict: 'RE',
          actual: message || 'Execution error'
        }))
      });
    } finally {
      setRunning(false);
    }
  };

  const getVerdictLabel = (verdict?: string) => {
    if (!verdict || verdict === 'IDLE') return 'IDLE';
    if (verdict === 'RUNNING') return 'RUNNING';
    if (verdict === 'AC') return 'ACCEPTED (AC)';
    if (verdict === 'WA') return 'WRONG ANSWER (WA)';
    if (verdict === 'TLE') return 'TIME LIMIT EXCEEDED (TLE)';
    if (verdict === 'MLE') return 'MEMORY LIMIT EXCEEDED (MLE)';
    if (verdict === 'RE') return 'RUNTIME ERROR (RE)';
    return verdict;
  };

  return (
    <div className={`nx-judge-wrapper ${showAcEffect ? 'ac-celebrate-glow' : ''}`}>
      <div className="nx-judge-header">
        <span className="nx-judge-title">NEXEL JUDGE</span>
        <button className={`nx-judge-stress-toggle ${showStress ? 'on' : ''}`} onClick={() => setShowStress(v => !v)} title="Stress tester: solution vs brute force" aria-pressed={showStress}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>
          STRESS
        </button>
      </div>

      {showStress ? <StressPanel solutionPath={activeFilePath} onClose={() => setShowStress(false)} /> : <>

      <div className="nx-judge-tcs-shelf">
        <div className="nx-judge-tcs-scroll">
          {testCases.map((tc) => {
            const isActive = tc.id === activeTCId;
            let statusClass = 'idle';
            if (tc.verdict === 'RUNNING') statusClass = 'running';
            else if (tc.verdict === 'AC') statusClass = 'passed';
            else if (tc.verdict && tc.verdict !== 'IDLE') statusClass = 'failed';

            return (
              <div 
                key={tc.id} 
                className={`nx-tc-pill ${isActive ? 'active' : ''} ${statusClass}`}
                onClick={() => setActiveTCId(tc.id)}
              >
                <span className="nx-tc-pill-name">{tc.name}</span>
                {tc.verdict && tc.verdict !== 'IDLE' && tc.verdict !== 'RUNNING' && (
                  <span className={`nx-tc-verdict-dot ${statusClass}`}>
                    {tc.verdict}
                  </span>
                )}
                <button 
                  className="nx-tc-pill-del" 
                  title="Delete Testcase"
                  onClick={(e) => handleDeleteTestCase(e, tc.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button 
            className="nx-tc-add-btn" 
            title="Add Testcase"
            onClick={addTestCase}
            disabled={isRunning}
          >
            +
          </button>
        </div>
      </div>

      <div className="nx-judge-tabs">
        {([
          { key: 'input', label: 'Input' },
          { key: 'expected', label: 'Expected' },
          { key: 'actual', label: 'Actual' },
          { key: 'diff', label: 'Diff' }
        ] as const).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              className={`nx-judge-tab-pill ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="nx-judge-textbox-container">
        {activeTab === 'diff' ? (
          <div className="nx-judge-diff-viewer">
            <div className="nx-diff-hdr-row">
              <span className="nx-diff-column-hdr green">EXPECTED</span>
              <span className="nx-diff-column-hdr red">ACTUAL</span>
            </div>
            <div className="nx-diff-lines-container">
              {(() => {
                const expectedLines = (activeTC.expected || '').trim().split(/\r?\n/);
                const actualLines = (activeTC.actual || activeTC.errorMsg || '').trim().split(/\r?\n/);
                const maxLines = Math.max(expectedLines.length, actualLines.length);
                
                if (maxLines === 0 || (!activeTC.expected && !activeTC.actual && !activeTC.errorMsg)) {
                  return <div className="nx-diff-empty">No execution data to compare yet.</div>;
                }

                return Array.from({ length: maxLines }).map((_, i) => {
                  const expLine = expectedLines[i] !== undefined ? expectedLines[i] : '';
                  const actLine = actualLines[i] !== undefined ? actualLines[i] : '';
                  const isMatch = expLine.trimEnd() === actLine.trimEnd();
                  
                  return (
                    <div key={i} className={`nx-diff-line-row ${isMatch ? 'match' : 'mismatch'}`}>
                      <div className="nx-diff-cell expected-cell">
                        <span className="nx-line-num">{i + 1}</span>
                        <span className="nx-line-text">{expLine || ' '}</span>
                      </div>
                      <div className="nx-diff-cell actual-cell">
                        <span className="nx-line-num">{i + 1}</span>
                        <span className="nx-line-text">{actLine || ' '}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        ) : (
          <textarea
            className={`nx-judge-textarea ${
              activeTab === 'actual' && activeTC.verdict === 'AC' ? 'passed-area' : ''
            } ${
              activeTab === 'actual' && activeTC.verdict && activeTC.verdict !== 'AC' && activeTC.verdict !== 'IDLE' ? 'failed-area' : ''
            }`}
            value={activeTC ? (activeTC[activeTab as 'input' | 'expected' | 'actual'] || '') : ''}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={`Enter active testcase ${activeTab} data...`}
            disabled={activeTab === 'actual' || isRunning}
          />
        )}
      </div>

      <div className="nx-judge-run-footer">
        <button 
          className={`nx-judge-run-btn ${isRunning ? 'running' : ''}`}
          onClick={handleRun}
          disabled={isRunning}
        >
          {isRunning ? (
            <span className="nx-run-spinner" />
          ) : (
            <>
              <svg className="nx-run-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              RUN
            </>
          )}
        </button>

        <div className={`nx-judge-metrics-panel ${
          activeTC.verdict === 'AC' ? 'passed' : ''
        } ${
          activeTC.verdict && activeTC.verdict !== 'AC' && activeTC.verdict !== 'IDLE' && activeTC.verdict !== 'RUNNING' ? 'failed' : ''
        } ${showWaEffect ? 'wa-shake' : ''}`}>
          {activeTC.verdict === 'RUNNING' ? (
            <span className="nx-metric-chip running">RUNNING...</span>
          ) : (
            <>
              <div className="nx-metric-chip" title="CPU Execution Time">
                {activeTC.time !== undefined ? `${activeTC.time}ms` : '--'}
              </div>
              <div className="nx-metric-divider">│</div>
              <div className="nx-metric-chip" title="Peak Resident Memory">
                {activeTC.memory !== undefined ? `${activeTC.memory}MB` : '--'}
              </div>
              <div className="nx-metric-divider">│</div>
              <div className={`nx-metric-chip verdict-chip ${
                activeTC.verdict === 'AC' ? 'passed' : ''
              } ${
                activeTC.verdict && activeTC.verdict !== 'AC' && activeTC.verdict !== 'IDLE' ? 'failed' : ''
              }`} title={getVerdictLabel(activeTC.verdict)}>
                {activeTC.verdict || 'IDLE'}
              </div>
            </>
          )}
        </div>
      </div>
      </>}
    </div>
  );
};

export default JudgeSystem;
