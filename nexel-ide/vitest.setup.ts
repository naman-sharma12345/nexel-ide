import '@testing-library/jest-dom';
import './src/__mocks__/setup';

// jsdom gaps hit by the full-shell smoke test
if (typeof document !== 'undefined' && !document.queryCommandSupported) {
  (document as any).queryCommandSupported = () => false;
}
if (typeof document !== 'undefined' && !document.execCommand) {
  (document as any).execCommand = () => false;
}
