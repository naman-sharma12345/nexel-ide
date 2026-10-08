import React, { useMemo, useRef, useState } from 'react';
import { runStress, type StressFailure } from '../lib/stress';
import { useJudgeStore } from '../stores/useJudgeStore';
import { useStatusStore } from '../stores/useStatusStore';
import './StressPanel.css';

interface Props { solutionPath?: string | null; onClose: () => void; }

const guessBrute = (p?: string | null) => (p ? p.replace(/(\.[^./\\]+)$/, '_brute$1') : '');
const R = 26, C = 2 * Math.PI * R;

export const StressPanel: React.FC<Props> = ({ solutionPath, onClose }) => {
  const [brute, setBrute] = useState(guessBrute(solutionPath));
  const [iterations, setIterations] = useState(200);
  const [maxN, setMaxN] = useState(8);
  const [maxV, setMaxV] = useState(20);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [state, setState] = useState<'idle' | 'running' | 'pass' | 'fail'>('idle');
  const [failure, setFailure] = useState<StressFailure | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pct = useMemo(() => (progress.total ? progress.done / progress.total : 0), [progress]);

  const run = async (file: string, input: string) => {
    const [r] = await window.nexelAPI.runJudge(file, [{ id: 1, input, expected: '' }], 2000, 256);
    return { out: r?.actual ?? '', verdict: r?.verdict === 'WA' ? 'AC' : (r?.verdict ?? 'RE') };
  };

  const start = async () => {
    if (!solutionPath || !brute.trim()) { useStatusStore.getState().pushToast('Open your solution and enter a brute-force file', 'error'); return; }
    const ac = new AbortController(); abortRef.current = ac;
    setState('running'); setFailure(null); setProgress({ done: 0, total: iterations });
    try {
      const res = await runStress(run, { solution: solutionPath, brute: brute.trim(), iterations, maxN, maxV, seed: Date.now() % 100000 }, ac.signal, setProgress);
      if (res.failure) { setFailure(res.failure); setState('fail'); useStatusStore.getState().pushToast('Stress test found a counter-example', 'error'); }
      else if (res.stopped) setState('idle');
      else { setState('pass'); useStatusStore.getState().pushToast(`Stress passed: ${res.ran} random tests`, 'success'); }
    } catch (e) {
      setState('idle'); useStatusStore.getState().pushToast(e instanceof Error ? e.message : 'Stress run failed', 'error');
    }
  };

  const saveAsTest = () => {
    if (!failure) return;
    const st = useJudgeStore.getState();
    st.addTestCase();
    const id = useJudgeStore.getState().activeTCId;
    st.updateTestCase(id, { name: `Stress #${failure.seed}`, input: failure.input, expected: failure.expected });
    useStatusStore.getState().pushToast('Counter-example saved as a test case', 'success');
  };

  return (
    <div className="nx-stress" role="region" aria-label="Stress tester">
      <div className="nx-stress-top">
        <div className={`nx-stress-ring ${state}`} aria-label={`progress ${Math.round(pct * 100)}%`}>
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle className="trk" cx="32" cy="32" r={R} />
            <circle className="bar" cx="32" cy="32" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - (state === 'pass' ? 1 : pct))} />
          </svg>
          <span className="nx-stress-ring-txt">{state === 'pass' ? '✓' : state === 'fail' ? '!' : `${Math.round(pct * 100)}%`}</span>
        </div>
        <div className="nx-stress-heading">
          <b>Stress Tester</b>
          <span>{state === 'running' ? `${progress.done}/${progress.total} tests` : state === 'pass' ? 'All outputs matched' : state === 'fail' ? 'Mismatch found' : 'solution vs brute force'}</span>
        </div>
        <button className="nx-stress-x" onClick={onClose} title="Back to testcases" aria-label="Close stress tester">×</button>
      </div>

      <label className="nx-stress-field"><span>Brute force file</span>
        <input value={brute} onChange={e => setBrute(e.target.value.slice(0, 500))} spellCheck={false} placeholder="path/to/brute.cpp" />
      </label>
      <div className="nx-stress-row">
        <label className="nx-stress-field"><span>Tests</span><input type="number" min={1} max={2000} value={iterations} onChange={e => setIterations(Math.min(2000, Math.max(1, +e.target.value || 1)))} /></label>
        <label className="nx-stress-field"><span>Max n</span><input type="number" min={1} max={200000} value={maxN} onChange={e => setMaxN(Math.min(200000, Math.max(1, +e.target.value || 1)))} /></label>
        <label className="nx-stress-field"><span>Max a<sub>i</sub></span><input type="number" min={1} value={maxV} onChange={e => setMaxV(Math.max(1, +e.target.value || 1))} /></label>
      </div>

      {state === 'running'
        ? <button className="nx-stress-btn stop" onClick={() => abortRef.current?.abort()}>STOP</button>
        : <button className="nx-stress-btn" onClick={start}>START STRESS</button>}

      {failure && (
        <div className="nx-stress-fail">
          <div className="nx-stress-fail-h"><span className="chip">{failure.verdict}</span> test {failure.iteration} · seed {failure.seed}</div>
          <pre>{failure.input.length > 600 ? failure.input.slice(0, 600) + '…' : failure.input}</pre>
          {failure.diff && <div className="nx-stress-diff"><i>line {failure.diff.line}</i><code className="a">brute: {failure.diff.a}</code><code className="b">yours: {failure.diff.b}</code></div>}
          <button className="nx-stress-btn ghost" onClick={saveAsTest}>Save as test case</button>
        </div>
      )}
    </div>
  );
};
export default StressPanel;
