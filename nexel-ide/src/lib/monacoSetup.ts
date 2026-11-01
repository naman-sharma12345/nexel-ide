/**
 * Bundle Monaco locally instead of pulling it from the jsDelivr CDN at runtime.
 *  - Works offline (contests on flaky Wi-Fi, LAN-only exam halls).
 *  - No remote code executing inside the Electron renderer (supply-chain hardening, enables a strict CSP).
 *  - Only the editor worker is shipped: C++/Python/Java tokenizers are Monarch grammars that run on the
 *    main thread, so the heavy TS/JSON/CSS/HTML language workers would be dead weight.
 * Ref: https://github.com/suren-atoyan/monaco-react#use-monaco-editor-as-an-npm-package
 */
import 'monaco-editor/esm/vs/editor/editor.all.js';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/rust/rust.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/go/go.contribution.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });

export { monaco };
