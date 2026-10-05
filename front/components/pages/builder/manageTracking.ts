import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";
import { MIN_NAME_SEARCH_QUERY_LENGTH } from "@app/types/api/search";
import { createContext, useContext, useEffect, useRef } from "react";

type ManageTracking = { entity_type: "agent" | "skill"; tab: string };

// Only the editable Manage pages provide this context; shared controls elsewhere stay untracked.
export const ManageTrackingContext = createContext<ManageTracking | null>(null);

export function useManageTracking() {
  return useContext(ManageTrackingContext);
}

/**
 * @cc [owner:aubin-tchoi,label:product] manage-results-tracking
 * Emit only settled, successful first-page results, once per consecutive query key.
 * Query keys and search text MUST stay local. Refreshes and pagination MUST NOT add views.
 */
export function useTrackManageResults({
  queryKey,
  searchTerm,
  total,
  disabled,
}: {
  queryKey: string;
  searchTerm: string;
  total: number;
  disabled: boolean;
}) {
  const tracking = useManageTracking();
  const entityType = tracking?.entity_type;
  const tab = tracking?.tab;
  const lastQuery = useRef<string | null>(null);
  const queryLength = searchTerm.trim().length;
  useEffect(() => {
    if (
      !entityType ||
      !tab ||
      disabled ||
      (queryLength > 0 && queryLength < MIN_NAME_SEARCH_QUERY_LENGTH) ||
      lastQuery.current === queryKey
    ) {
      return;
    }
    lastQuery.current = queryKey;
    trackEvent({
      area: TRACKING_AREAS.BUILDER,
      object: "manage_results",
      action: TRACKING_ACTIONS.VIEW,
      extra: {
        entity_type: entityType,
        tab,
        has_search: queryLength >= MIN_NAME_SEARCH_QUERY_LENGTH,
        result_count: total,
      },
    });
  }, [entityType, tab, disabled, queryKey, queryLength, total]);
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
  operation: "edit" | "duplicate" | "try",
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
