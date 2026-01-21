import posthog from "posthog-js";

import type { AttributionData } from "../types";

/**
 * Sync attribution data to PostHog with proper first/last touch handling.
 * - First-touch: Uses $set_once (will not overwrite existing values)
 * - Last-touch: Uses $set (will overwrite with latest values)
 */
export function syncAttributionToPostHog(attribution: AttributionData): void {
  if (!posthog.__loaded) {
    return;
  }

  const { firstTouch, lastTouch } = attribution;

  // First-touch: Use $set_once (will not overwrite existing values)
  if (firstTouch) {
    posthog.capture("$set", {
      $set_once: {
        initial_utm_source: firstTouch.utm_source,
        initial_utm_medium: firstTouch.utm_medium,
        initial_utm_campaign: firstTouch.utm_campaign,
        initial_utm_content: firstTouch.utm_content,
        initial_utm_term: firstTouch.utm_term,
        initial_gclid: firstTouch.gclid,
        initial_referrer: firstTouch.referrer,
        initial_landing_page: firstTouch.landingPage,
        first_touch_date: new Date(firstTouch.capturedAt).toISOString(),
      },
    });
  }

  // Last-touch: Use $set (will overwrite)
  if (lastTouch) {
    posthog.capture("$set", {
      $set: {
        last_utm_source: lastTouch.utm_source,
        last_utm_medium: lastTouch.utm_medium,
        last_utm_campaign: lastTouch.utm_campaign,
        last_utm_content: lastTouch.utm_content,
        last_utm_term: lastTouch.utm_term,
        last_gclid: lastTouch.gclid,
      },
    });
  }
}
