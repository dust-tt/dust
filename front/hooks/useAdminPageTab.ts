import { useQueryParams } from "@app/hooks/useQueryParams";

/**
 * Syncs an admin page's active tab with `?tab=` in the URL. The default tab
 * clears the query param so deep links stay short. Unknown values fall back to
 * `defaultTab`.
 */
export function useAdminPageTab<T extends string>(
  tabs: readonly T[],
  defaultTab: T
): { tab: T; setTab: (next: T) => void } {
  const { tab: tabParam } = useQueryParams(["tab"]);
  const value = tabParam.value;
  const tab = tabs.includes(value as T) ? (value as T) : defaultTab;

  const setTab = (next: T) => {
    tabParam.setParam(next === defaultTab ? undefined : next);
  };

  return { tab, setTab };
}
