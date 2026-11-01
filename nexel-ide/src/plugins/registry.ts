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
