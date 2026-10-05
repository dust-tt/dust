import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface ManageTracking {
  entity_type: "agent" | "skill";
  manage_session_id: string;
  search_id: string;
  tab: string;
  has_search: boolean;
  filter_count: number;
  filter_categories: string;
  show_hidden: boolean;
}

export const ManageTrackingContext = createContext<ManageTracking | null>(null);

export function useManageTracking() {
  return useContext(ManageTrackingContext);
}

/**
 * @cc [owner:aubin-tchoi,label:product] manage-tracking-privacy-and-attribution
 * Every Manage event MUST carry a page-visit ID and a result-set ID. Query text and filter
 * values MUST remain local; only search presence, category names and counts may be emitted.
 * Read-only listings and consumers outside the Manage provider MUST NOT emit Manage events.
 */
export function useManagePageTracking({
  entityType,
  workspaceId,
  queryKey,
  tab,
  hasSearch,
  filterCount,
  filterCategories,
  showHidden,
  disabled,
}: {
  entityType: ManageTracking["entity_type"];
  workspaceId: string;
  // Used only to detect a new result set, never sent to analytics.
  queryKey: string;
  tab: string;
  hasSearch: boolean;
  filterCount: number;
  filterCategories: string;
  showHidden: boolean;
  disabled: boolean;
}) {
  const [session, setSession] = useState(() => ({
    workspaceId,
    id: crypto.randomUUID(),
  }));
  if (session.workspaceId !== workspaceId) {
    setSession({ workspaceId, id: crypto.randomUUID() });
  }
  const resultKey = JSON.stringify([workspaceId, queryKey]);
  const [search, setSearch] = useState(() => ({
    key: resultKey,
    id: crypto.randomUUID(),
  }));
  if (search.key !== resultKey) {
    setSearch({ key: resultKey, id: crypto.randomUUID() });
  }
  const tracking = useMemo(
    () =>
      disabled
        ? null
        : {
            entity_type: entityType,
            manage_session_id: session.id,
            search_id: search.id,
            tab,
            has_search: hasSearch,
            filter_count: filterCount,
            filter_categories: filterCategories,
            show_hidden: showHidden,
          },
    [
      disabled,
      entityType,
      session.id,
      search.id,
      tab,
      hasSearch,
      filterCount,
      filterCategories,
      showHidden,
    ]
  );
  const viewed = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (tracking && viewed.current !== tracking.manage_session_id) {
      viewed.current = tracking.manage_session_id;
      trackEvent({
        area: TRACKING_AREAS.BUILDER,
        object: "manage_page",
        action: TRACKING_ACTIONS.VIEW,
        extra: { ...tracking },
      });
    }
  }, [tracking]);
  return tracking;
}

/**
 * @cc [owner:aubin-tchoi,label:product] manage-results-once
 * Results MUST be counted only after the current query settles, on its first page. Re-renders,
 * pagination and background refreshes MUST NOT count the same result set again. Errors MUST
 * NOT be reported as zero results. A successful retry may follow an error for the same search ID.
 */
export function useTrackManageResults({
  total,
  isLoading,
  isError,
  pageIndex,
}: {
  total: number;
  isLoading: boolean;
  isError: boolean;
  pageIndex: number;
}) {
  const tracking = useManageTracking();
  const seenResults = useRef(new Set<string>());
  const [lastLoadedTracking, setLastLoadedTracking] = useState(tracking);
  if (!isLoading && !isError && lastLoadedTracking !== tracking) {
    setLastLoadedTracking(tracking);
  }
  useEffect(() => {
    if (!tracking || isLoading || pageIndex !== 0) {
      return;
    }
    const resultKey = `${tracking.search_id}:${isError ? "error" : "success"}`;
    if (seenResults.current.has(resultKey)) {
      return;
    }
    seenResults.current.add(resultKey);
    trackEvent({
      area: TRACKING_AREAS.BUILDER,
      object: "manage_results",
      action: TRACKING_ACTIONS.VIEW,
      extra: {
        ...tracking,
        outcome: isError ? "error" : "success",
        ...(!isError ? { result_count: total } : {}),
      },
    });
  }, [tracking, total, isLoading, isError, pageIndex]);
  // Retained rows still belong to the previous query while a replacement is loading.
  return isLoading || isError ? lastLoadedTracking : tracking;
}

export function trackManageTab(tracking: ManageTracking | null, tab: string) {
  if (!tracking) {
    return;
  }
  trackEvent({
    area: TRACKING_AREAS.BUILDER,
    object: "manage_tab",
    action: TRACKING_ACTIONS.SELECT,
    extra: { ...tracking, selected_tab: tab },
  });
}

export function trackManageFilter(
  tracking: ManageTracking | null,
  change:
    | "apply"
    | "clear_category"
    | "clear_all"
    | "show_hidden"
    | "hide_hidden"
) {
  if (!tracking) {
    return;
  }
  trackEvent({
    area: TRACKING_AREAS.BUILDER,
    object: "manage_filter",
    action: TRACKING_ACTIONS.SELECT,
    extra: { ...tracking, change },
  });
}

export function trackManageDetails(
  tracking: ManageTracking | null,
  targetId: string
) {
  if (!tracking) {
    return;
  }
  trackEvent({
    area: TRACKING_AREAS.BUILDER,
    object: "manage_details",
    action: TRACKING_ACTIONS.OPEN,
    extra: { ...tracking, target_id: targetId },
  });
}

export function trackManageItemAction(
  tracking: ManageTracking | null,
  operation: "edit" | "duplicate" | "try" | "copy_link" | "copy_id" | "export",
  targetId: string
) {
  if (!tracking) {
    return;
  }
  trackEvent({
    area: TRACKING_AREAS.BUILDER,
    object: "manage_action",
    action: TRACKING_ACTIONS.CLICK,
    extra: { ...tracking, operation, target_id: targetId },
  });
}

export function trackManageCreate(
  tracking: ManageTracking | null,
  method: "menu" | "scratch" | "template" | "yaml" | "import"
) {
  if (!tracking) {
    return;
  }
  trackEvent({
    area: TRACKING_AREAS.BUILDER,
    object: "manage_create",
    action: TRACKING_ACTIONS.CLICK,
    extra: { ...tracking, method },
  });
}

/**
 * @cc [owner:aubin-tchoi,label:product] manage-mutation-success
 * Callers MUST emit success only for confirmed writes, with every affected sId. Partial batch
 * results MUST include only updated IDs. APIs that do not report which IDs changed MUST use
 * outcome "accepted" and include the requested IDs instead.
 */
export function trackManageMutation(
  tracking: ManageTracking | null,
  operation:
    | "archive"
    | "favorite"
    | "unfavorite"
    | "set_availability"
    | "set_model"
    | "set_tags"
    | "publish"
    | "unpublish"
    | "import"
    | "enable"
    | "disable",
  targetIds: string[],
  properties: {
    outcome?: "accepted";
    availability?: string;
    import_source?: "files" | "repository" | "yaml";
    skipped_count?: number;
  } = {}
) {
  if (!tracking || targetIds.length === 0) {
    return;
  }
  trackEvent({
    area: TRACKING_AREAS.BUILDER,
    object: "manage_action",
    action: TRACKING_ACTIONS.SUBMIT,
    extra: {
      ...tracking,
      operation,
      outcome: "success",
      target_ids: targetIds.join(","),
      target_count: targetIds.length,
      ...(targetIds.length === 1 ? { target_id: targetIds[0] } : {}),
      ...properties,
    },
  });
}
