import type { ComponentType, ReactNode } from 'react';

/** A dock entry contributed by a plugin. */
export interface PluginNavItem {
  id: string;
  label: string;
  icon: ReactNode;
}

/**
 * A Nexel plugin: an optional bundle of nav sections, panels and commands that can be
 * toggled from Settings -> Extensions. Disabled plugins contribute nothing: no dock
 * entries, no panels, no palette commands, no listeners.
 */
export interface NexelPlugin {
  id: string;
  name: string;
  blurb: string;
  /** Nav sections this plugin owns (hidden unless enabled). */
  navItems: PluginNavItem[];
  /** Section ids this plugin owns; used to redirect away when disabled. */
  sections: string[];
  /** Palette command ids this plugin owns; filtered out when disabled. */
  commandIds: string[];
  /** True when the plugin is on by default for a fresh install. */
  defaultEnabled: boolean;
  /** Section id -> panel component, owned and lazy-loaded by the plugin itself. */
  panels?: Record<string, ComponentType<{ activeFilePath?: string | null }>>;
  /** React hook the shell calls for every registered plugin with its enabled state. */
  useActivation?: (enabled: boolean) => void;
  /** Offline completion data contributed while the plugin is enabled. */
  completions?: PluginCompletionContribution;
  /** Status bar items contributed while the plugin is enabled. */
  statusItems?: ComponentType[];
}

/** Completion data a plugin contributes when enabled (merged into the offline C++ provider). */
export interface PluginCompletionContribution {
  /** Extra dataset categories, e.g. { cp: [...] }. Keys are added to the served categories. */
  dataset?: Record<string, { label: string; insertText?: string; detail?: string; documentation?: string; score?: number }[]>;
  /** Snippet map, same shape as core snippets.json. Served only while enableSnippets is on. */
  snippets?: Record<string, { prefix: string; description?: string; body: string[] | string }>;
}

const REGISTRY = new Map<string, NexelPlugin>();
export function registerPlugin(p: NexelPlugin) { REGISTRY.set(p.id, p); }
export function listPlugins(): NexelPlugin[] { return [...REGISTRY.values()]; }
/** Single seam for "is plugin X on" checks in core UI: core names the id, the registry owns resolution. */
export function pluginEnabledById(id: string, prefs: Record<string, boolean>): boolean {
  const pl = getPlugin(id);
  return pl ? pluginEnabled(pl, prefs) : false;
}

export function getPlugin(id: string): NexelPlugin | undefined { return REGISTRY.get(id); }
/** Whether a persisted plugins map enables this plugin (absent = default). */
export function pluginEnabled(p: NexelPlugin, prefs: Record<string, boolean>): boolean {
  return p.id in prefs ? !!prefs[p.id] : p.defaultEnabled;
}

/** Status bar items contributed by all enabled plugins. Core renders these, never a plugin id. */
export function collectPluginStatusItems(prefs: Record<string, boolean>): ComponentType[] {
  return listPlugins().filter((p) => pluginEnabled(p, prefs)).flatMap((p) => p.statusItems ?? []);
}

/** Merged completion contributions from all enabled plugins. Core code asks this, never a plugin id. */
export function collectPluginCompletions(prefs: Record<string, boolean>): Required<PluginCompletionContribution> & { categories: string[] } {
  const categories: string[] = [];
  const dataset: NonNullable<PluginCompletionContribution['dataset']> = {};
  const snippets: NonNullable<PluginCompletionContribution['snippets']> = {};
  for (const p of listPlugins()) {
    if (!pluginEnabled(p, prefs) || !p.completions) continue;
    for (const [k, v] of Object.entries(p.completions.dataset ?? {})) { dataset[k] = v; categories.push(k); }
    Object.assign(snippets, p.completions.snippets ?? {});
  }
  return { categories, dataset, snippets };
}
