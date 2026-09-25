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

export type DiscoverySuggestionSection = "for_you" | "trending";

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
