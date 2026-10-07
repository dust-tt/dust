import type {
  CatalogItem,
  CatalogQuery,
} from "@app/components/assistant/conversation/discover/catalog";
import { getItemId } from "@app/components/assistant/conversation/discover/catalog";
import type { TrackingAction, TrackingExtra } from "@app/lib/tracking";
import {
  TRACKING_ACTIONS,
  TRACKING_AREAS,
  trackEvent,
} from "@app/lib/tracking";

// PostHog events for the new-conversation Discover surface. `trackEvent`
// names them `discover:<object>:<action>`. Views are the denominator: a use
// case or suggestion with views and no clicks is one we surfaced and nobody
// took.

const HOMEPAGE_USE_CASE_OBJECT = "homepage_use_case";
const DISCOVERY_SUGGESTION_OBJECT = "discovery_suggestion";
const DISCOVER_ITEM_OBJECT = "item";
const DISCOVER_ITEM_DETAILS_OBJECT = "item_details";
const SCROLL_PULL_OBJECT = "scroll_pull";

export type DiscoverySuggestionSection = "for_you" | "trending";
export type DiscoverItemSource =
  | "featured"
  | DiscoverySuggestionSection
  | "catalog";

interface HomepageUseCaseTracking {
  useCaseId: string;
}

interface DiscoverySuggestionTracking {
  section: DiscoverySuggestionSection;
  itemKind: "agent" | "skill";
  itemId: string;
}

/**
 * @cc [owner:frankaloia,label:product] homepage-use-case-click-names-the-use-case
 * A homepage use case click MUST be tracked with the stable `use_case_id`, so
 * use cases that are offered and never picked can be told apart from ones that
 * were not shown.
 */
export function trackHomepageUseCaseClick({
  useCaseId,
}: HomepageUseCaseTracking): void {
  trackEvent({
    area: TRACKING_AREAS.DISCOVER,
    object: HOMEPAGE_USE_CASE_OBJECT,
    action: TRACKING_ACTIONS.CLICK,
    extra: { use_case_id: useCaseId },
  });
}

export function trackHomepageUseCaseDismiss({
  useCaseId,
}: HomepageUseCaseTracking): void {
  trackEvent({
    area: TRACKING_AREAS.DISCOVER,
    object: HOMEPAGE_USE_CASE_OBJECT,
    action: TRACKING_ACTIONS.DISMISS,
    extra: { use_case_id: useCaseId },
  });
}

export function trackHomepageUseCaseView({
  useCaseId,
}: HomepageUseCaseTracking): void {
  trackEvent({
    area: TRACKING_AREAS.DISCOVER,
    object: HOMEPAGE_USE_CASE_OBJECT,
    action: TRACKING_ACTIONS.VIEW,
    extra: { use_case_id: useCaseId },
  });
}

/**
 * @cc [owner:frankaloia,label:product] suggestion-click-names-the-surfaced-item
 * A For You or Trending click MUST be tracked with `section`, `item_kind`,
 * and `item_id`, so a click can be joined to the suggestion that was shown.
 */
export function trackDiscoverySuggestionClick({
  section,
  itemKind,
  itemId,
}: DiscoverySuggestionTracking): void {
  trackEvent({
    area: TRACKING_AREAS.DISCOVER,
    object: DISCOVERY_SUGGESTION_OBJECT,
    action: TRACKING_ACTIONS.CLICK,
    extra: {
      section,
      item_kind: itemKind,
      item_id: itemId,
    },
  });
}

export function trackDiscoverySuggestionView({
  section,
  itemKind,
  itemId,
}: DiscoverySuggestionTracking): void {
  trackEvent({
    area: TRACKING_AREAS.DISCOVER,
    object: DISCOVERY_SUGGESTION_OBJECT,
    action: TRACKING_ACTIONS.VIEW,
    extra: {
      section,
      item_kind: itemKind,
      item_id: itemId,
    },
  });
}

interface DiscoverItemTracking {
  source: DiscoverItemSource;
  item: CatalogItem;
  catalogQuery?: CatalogQuery;
}

function getDiscoverItemTrackingExtra({
  source,
  item,
  catalogQuery,
}: DiscoverItemTracking): TrackingExtra {
  return {
    source,
    item_kind: item.kind,
    item_id: getItemId(item),
    is_dust_provided: item.isDustProvided,
    ...(catalogQuery && {
      catalog_view: catalogQuery.view,
      catalog_kind: catalogQuery.kind,
      catalog_has_search_term: catalogQuery.searchTerm !== "",
      ...(catalogQuery.tagId !== null && {
        catalog_tag_id: catalogQuery.tagId,
      }),
    }),
  };
}

function trackDiscoverItemEvent(
  object: string,
  action: TrackingAction,
  tracking: DiscoverItemTracking
): void {
  trackEvent({
    area: TRACKING_AREAS.DISCOVER,
    object,
    action,
    extra: getDiscoverItemTrackingExtra(tracking),
  });
}

/**
 * @cc [owner:adrsimon,label:product] discover-item-events-name-source-and-item
 * Picking an item, or clicking Details on it, from a Discover row or card MUST be tracked with
 * `source`, `item_kind`, and `item_id`. Catalog events MUST also carry the query that produced the
 * displayed results, so a pick can be attributed to the view, kind, tag, or search that surfaced it.
 */
export function trackDiscoverItemSelect(tracking: DiscoverItemTracking): void {
  trackDiscoverItemEvent(
    DISCOVER_ITEM_OBJECT,
    TRACKING_ACTIONS.SELECT,
    tracking
  );
}

export function trackDiscoverItemDetailsOpen(
  tracking: DiscoverItemTracking
): void {
  trackDiscoverItemEvent(
    DISCOVER_ITEM_DETAILS_OBJECT,
    TRACKING_ACTIONS.OPEN,
    tracking
  );
}

export function trackDiscoverScrollPullOpen(): void {
  trackEvent({
    area: TRACKING_AREAS.DISCOVER,
    object: SCROLL_PULL_OBJECT,
    action: TRACKING_ACTIONS.OPEN,
  });
}
