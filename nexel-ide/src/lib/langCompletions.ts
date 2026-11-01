// Tier-1 zero-install completions for Python and Java (works on every machine).
export interface LangItem { label: string; insert: string; detail: string; snippet?: boolean }

export const PYTHON_ITEMS: LangItem[] = [
  { label: 'fastinput', insert: 'import sys\ninput = sys.stdin.readline\n', detail: 'Fast input' },
  { label: 'readints', insert: 'list(map(int, input().split()))', detail: 'Read int list' },
  { label: 'heapq', insert: 'import heapq', detail: 'Priority queue module' },
  { label: 'deque', insert: 'from collections import deque', detail: 'Double-ended queue' },
  { label: 'defaultdict', insert: 'from collections import defaultdict', detail: 'Dict with default' },
  { label: 'bisect_left', insert: 'bisect.bisect_left(${1:a}, ${2:x})', detail: 'Lower bound', snippet: true },
  { label: 'sortkey', insert: '${1:a}.sort(key=lambda ${2:x}: ${3:x})', detail: 'Sort with key', snippet: true },
  { label: 'main', insert: 'def main():\n\t${1:pass}\n\nif __name__ == "__main__":\n\tmain()', detail: 'Main guard', snippet: true },
  { label: 'dsu', insert: 'def find(x):\n\twhile p[x] != x:\n\t\tp[x] = p[p[x]]\n\t\tx = p[x]\n\treturn x', detail: 'DSU find', snippet: true },
];

export const JAVA_ITEMS: LangItem[] = [
  { label: 'fastio', insert: 'BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\nStringTokenizer st = new StringTokenizer(br.readLine());', detail: 'Fast input' },
  { label: 'psvm', insert: 'public static void main(String[] args) throws IOException {\n\t${1}\n}', detail: 'main method', snippet: true },
  { label: 'sout', insert: 'System.out.println(${1});', detail: 'Print line', snippet: true },
  { label: 'PriorityQueue', insert: 'PriorityQueue<${1:Integer}> pq = new PriorityQueue<>();', detail: 'Min-heap', snippet: true },
  { label: 'ArrayList', insert: 'ArrayList<${1:Integer}> ${2:list} = new ArrayList<>();', detail: 'Dynamic array', snippet: true },
  { label: 'HashMap', insert: 'HashMap<${1:Integer}, ${2:Integer}> ${3:map} = new HashMap<>();', detail: 'Hash map', snippet: true },
  { label: 'fori', insert: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', detail: 'for loop', snippet: true },
];

export function registerLangCompletions(monaco: any): { dispose(): void }[] {
  const mk = (lang: string, items: LangItem[]) =>
    monaco.languages.registerCompletionItemProvider(lang, {
      provideCompletionItems: (model: any, pos: any) => {
        const w = model.getWordUntilPosition(pos);
        const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn };
        return {
          suggestions: items.map(i => ({
            label: i.label, kind: monaco.languages.CompletionItemKind.Snippet, detail: `${i.detail} (Nexel)`,
            insertText: i.insert, range,
            insertTextRules: i.snippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          })),
        };
      },
    });
  return [mk('python', PYTHON_ITEMS), mk('java', JAVA_ITEMS)];
}
