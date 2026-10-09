/** Only a safe subset of LSP traffic may cross the renderer->main boundary. */
const ALLOWED = /^(initialize|initialized|shutdown|exit|\$\/cancelRequest|textDocument\/[A-Za-z]+|workspace\/(didChangeConfiguration|didChangeWatchedFiles|symbol))$/;
export const MAX_LSP_MESSAGE_CHARS = 4_000_000;

export function validateLspMessage(msg: unknown): Record<string, unknown> {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error('lsp: message must be an object');
  const m = msg as Record<string, unknown>;
  if (m.jsonrpc !== '2.0') throw new Error('lsp: bad jsonrpc version');
  if (typeof m.method === 'string') {
    if (!ALLOWED.test(m.method)) throw new Error(`lsp: method not allowed: ${m.method.slice(0, 60)}`);
  } else if (!('id' in m) || !('result' in m || 'error' in m)) throw new Error('lsp: not a request, notification or response');
  if (JSON.stringify(m).length > MAX_LSP_MESSAGE_CHARS) throw new Error('lsp: message too large');
  return m;
}
