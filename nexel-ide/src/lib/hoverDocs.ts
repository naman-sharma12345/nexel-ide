// Tier-1 hover docs: zero-install, works offline on every machine.
// While clangd serves C/C++ it already shows the exact signature and type, so this provider then only adds the
// CP-specific note (complexity + tip) underneath instead of a second signature.
import { isClangdActive } from './clangd/state';
export interface HoverDoc { sig: string; doc: string; cx?: string }

export const CPP_DOCS: Record<string, HoverDoc> = {
  sort: { sig: 'void sort(RandomIt first, RandomIt last, Compare comp = less<>())', doc: 'Sorts the range in ascending order (introsort).', cx: 'O(n log n)' },
  lower_bound: { sig: 'It lower_bound(It first, It last, const T& value)', doc: 'First element that is **not less** than `value` in a sorted range.', cx: 'O(log n)' },
  upper_bound: { sig: 'It upper_bound(It first, It last, const T& value)', doc: 'First element **greater** than `value` in a sorted range.', cx: 'O(log n)' },
  binary_search: { sig: 'bool binary_search(It first, It last, const T& value)', doc: 'Checks whether `value` exists in a sorted range.', cx: 'O(log n)' },
  accumulate: { sig: 'T accumulate(It first, It last, T init)', doc: 'Sums the range. Pass `0LL` as `init` to avoid int overflow.', cx: 'O(n)' },
  iota: { sig: 'void iota(It first, It last, T value)', doc: 'Fills the range with increasing values starting at `value`.', cx: 'O(n)' },
  next_permutation: { sig: 'bool next_permutation(It first, It last)', doc: 'Rearranges to the next lexicographic permutation; false when wrapped.', cx: 'O(n)' },
  unique: { sig: 'It unique(It first, It last)', doc: 'Removes consecutive duplicates; returns new logical end. Sort first.', cx: 'O(n)' },
  reverse: { sig: 'void reverse(It first, It last)', doc: 'Reverses the order of the elements in the range.', cx: 'O(n)' },
  memset: { sig: 'void* memset(void* dest, int ch, size_t count)', doc: 'Sets bytes. Only safe for 0 and -1 on int arrays.', cx: 'O(n)' },
  gcd: { sig: 'T gcd(T a, T b)', doc: 'Greatest common divisor (C++17, `<numeric>`).', cx: 'O(log min(a,b))' },
  lcm: { sig: 'T lcm(T a, T b)', doc: 'Least common multiple (C++17). Watch for overflow: use `a / gcd(a,b) * b`.' },
  priority_queue: { sig: 'priority_queue<T, vector<T>, Compare>', doc: 'Max-heap by default. Use `greater<T>` for a min-heap.', cx: 'push/pop O(log n)' },
  vector: { sig: 'vector<T>', doc: 'Dynamic array. `reserve(n)` avoids reallocations; `assign(n, v)` resets.', cx: 'push_back amortised O(1)' },
  map: { sig: 'map<K, V>', doc: 'Ordered red-black tree map.', cx: 'O(log n) per op' },
  unordered_map: { sig: 'unordered_map<K, V>', doc: 'Hash map. Use a custom hash on Codeforces to dodge anti-hash tests.', cx: 'O(1) average' },
  set: { sig: 'set<T>', doc: 'Ordered unique keys. `lower_bound` as a member is O(log n).', cx: 'O(log n) per op' },
  multiset: { sig: 'multiset<T>', doc: 'Ordered with duplicates. Erase one with `erase(find(x))`, not `erase(x)`.' },
  deque: { sig: 'deque<T>', doc: 'Double-ended queue with O(1) push/pop at both ends.' },
  bitset: { sig: 'bitset<N>', doc: 'Fixed-size bit array; `count()`, shifts and `&|^` run 64 bits at a time.', cx: 'O(N / 64)' },
  pair: { sig: 'pair<A, B>', doc: 'Two values; compared lexicographically (first, then second).' },
  stoi: { sig: 'int stoi(const string& s)', doc: 'Parses an int; throws on invalid input or overflow.' },
  to_string: { sig: 'string to_string(T value)', doc: 'Converts a number to its decimal string.' },
  max_element: { sig: 'It max_element(It first, It last)', doc: 'Iterator to the largest element. Dereference with `*`.', cx: 'O(n)' },
  min_element: { sig: 'It min_element(It first, It last)', doc: 'Iterator to the smallest element.', cx: 'O(n)' },
  __builtin_popcount: { sig: 'int __builtin_popcount(unsigned x)', doc: 'Number of set bits. Use `__builtin_popcountll` for 64-bit.', cx: 'O(1)' },
  __lg: { sig: 'int __lg(x)', doc: 'Floor of log2(x) (GCC).', cx: 'O(1)' },
};

export const PY_DOCS: Record<string, HoverDoc> = {
  heappush: { sig: 'heapq.heappush(heap, item)', doc: 'Push onto a min-heap.', cx: 'O(log n)' },
  heappop: { sig: 'heapq.heappop(heap)', doc: 'Pop the smallest item.', cx: 'O(log n)' },
  bisect_left: { sig: 'bisect.bisect_left(a, x)', doc: 'Leftmost insertion point keeping `a` sorted.', cx: 'O(log n)' },
  bisect_right: { sig: 'bisect.bisect_right(a, x)', doc: 'Rightmost insertion point keeping `a` sorted.', cx: 'O(log n)' },
  deque: { sig: 'collections.deque([iterable])', doc: 'O(1) appends and pops from both ends.' },
  Counter: { sig: 'collections.Counter(iterable)', doc: 'Dict subclass counting hashables.' },
  defaultdict: { sig: 'collections.defaultdict(default_factory)', doc: 'Dict that creates missing keys on access.' },
  sorted: { sig: 'sorted(iterable, *, key=None, reverse=False)', doc: 'Returns a new sorted list (stable).', cx: 'O(n log n)' },
  accumulate: { sig: 'itertools.accumulate(iterable)', doc: 'Running totals (prefix sums).' },
  permutations: { sig: 'itertools.permutations(iterable, r=None)', doc: 'All r-length permutations in lexicographic order.' },
  combinations: { sig: 'itertools.combinations(iterable, r)', doc: 'All r-length combinations without repeats.' },
};

export function hoverFor(lang: string, word: string): HoverDoc | undefined {
  const t = lang === 'python' ? PY_DOCS : lang === 'cpp' || lang === 'c' ? CPP_DOCS : undefined;
  return t && Object.prototype.hasOwnProperty.call(t, word) ? t[word] : undefined;
}

export function registerHoverDocs(monaco: any): { dispose(): void }[] {
  const mk = (lang: string) => monaco.languages.registerHoverProvider(lang, {
    provideHover: (model: any, pos: any) => {
      const w = model.getWordAtPosition(pos);
      if (!w) return null;
      const d = hoverFor(lang, w.word);
      if (!d) return null;
      if (lang === 'cpp' && isClangdActive()) {
        return {
          range: { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn },
          contents: [{ value: `**Nexel CP note** · ${d.doc}` + (d.cx ? `  \n**Complexity:** \`${d.cx}\`` : '') }],
        };
      }
      return {
        range: { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn },
        contents: [
          { value: '```' + lang + '\n' + d.sig + '\n```' },
          { value: d.doc + (d.cx ? `\n\n**Complexity:** \`${d.cx}\`` : '') },
        ],
      };
    },
  });
  return [mk('cpp'), mk('python')];
}
