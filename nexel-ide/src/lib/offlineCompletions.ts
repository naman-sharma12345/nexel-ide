/**
 * Offline C++ completion collector (dataset categories + CP snippets).
 * Pure and monaco-free so suggestion CONTENT is unit-testable; Editor maps these to monaco items.
 */
export interface OfflineItem {
  label: string;
  insertText: string;
  detail: string;
  documentation: string;
  category: string;
  score: number;
  isSnippet: boolean;
}

export function collectOfflineItems(opts: {
  dataset: Record<string, { label: string; insertText?: string; detail?: string; documentation?: string; score?: number }[]>;
  snippets: Record<string, { prefix: string; description?: string; body: string[] | string }>;
  clangdOn: boolean;
  /** Dataset categories contributed by enabled plugins (e.g. ['cp']). Core categories serve when clangd is off; plugin categories always serve. */
  pluginCategories?: string[];
  enableSnippets: boolean;
  hasUsingStd: boolean;
}): OfflineItem[] {
  const { dataset, snippets, clangdOn, pluginCategories = [], enableSnippets, hasUsingStd } = opts;
  const out: OfflineItem[] = [];
  const categories = (clangdOn ? [] : ['keywords', 'containers', 'algorithms', 'math', 'io']).concat(pluginCategories);
  for (const category of categories) {
    for (const item of dataset[category] ?? []) {
      let label = item.label;
      let insertText = item.insertText || item.label;
      if (hasUsingStd) {
        if (label.startsWith('std::')) label = label.substring(5);
        if (insertText.startsWith('std::')) insertText = insertText.substring(5);
      }
      out.push({
        label, insertText,
        detail: item.detail || `${category} (Nexel Autocomplete)`,
        documentation: item.documentation || '',
        category,
        score: item.score !== undefined ? item.score : 50,
        isSnippet: false,
      });
    }
  }
  if (enableSnippets) {
    for (const [key, val] of Object.entries(snippets)) {
      const bodyStr = Array.isArray(val.body) ? val.body.join('\n') : val.body;
      out.push({
        label: val.prefix,
        insertText: bodyStr,
        detail: val.description || 'Snippet',
        documentation: `**${val.description || key}**\n\n\`\`\`cpp\n${bodyStr}\n\`\`\``,
        category: 'snippet',
        score: 999,
        isSnippet: true,
      });
    }
  }
  return out;
}
