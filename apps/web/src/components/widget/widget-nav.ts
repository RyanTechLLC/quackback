/**
 * Widget navigation model — the single source of truth for the widget's tabs,
 * views, and which view/tab the widget lands on for a given enabled-surface
 * config. Kept as a pure module (no React) so the routing rules are unit-tested
 * directly rather than through the route component.
 */

/** Bottom-bar tabs. Each maps to one enabled surface. */
export type WidgetTab = 'feedback' | 'changelog' | 'help' | 'chat'

/**
 * Discrete views the widget can render. The feedback surface's root is
 * 'feedback-feed' (the ideas feed + composer); every other surface's root view
 * shares its tab name. Detail views ('post-detail', '*-detail', 'help-category',
 * 'success') are pushed on top of a root.
 */
export type WidgetView =
  | 'feedback-feed'
  | 'post-detail'
  | 'success'
  | 'changelog'
  | 'changelog-detail'
  | 'help'
  | 'help-category'
  | 'help-detail'
  | 'chat'

/** Which surfaces the workspace has enabled for this widget (from the loader). */
export interface EnabledTabs {
  feedback?: boolean
  changelog?: boolean
  help?: boolean
  chat?: boolean
}

/** Highest-priority enabled tab, in order feedback > changelog > help > chat. */
export function resolveInitialTab(tabs: EnabledTabs): WidgetTab {
  if (tabs.feedback) return 'feedback'
  if (tabs.changelog) return 'changelog'
  if (tabs.help) return 'help'
  return 'chat'
}

/** Root view for the initial tab (feedback -> 'feedback-feed'; others share the name). */
export function resolveInitialView(tabs: EnabledTabs): WidgetView {
  const tab = resolveInitialTab(tabs)
  if (tab === 'feedback') return 'feedback-feed'
  return tab
}
