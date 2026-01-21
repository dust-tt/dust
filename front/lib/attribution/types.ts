/**
 * Tracking parameter keys that we capture from URLs.
 * Includes standard UTM parameters plus platform-specific click IDs.
 */
export const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid", // Google Ads
  "fbclid", // Facebook/Meta
  "msclkid", // Microsoft/Bing
  "li_fat_id", // LinkedIn
] as const;

export type TrackingParamKey = (typeof TRACKING_PARAMS)[number];

/**
 * Tracking data captured from a single visit.
 * Contains UTM parameters plus metadata about when/where they were captured.
 */
export interface TrackingData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  msclkid?: string;
  li_fat_id?: string;
  capturedAt: number; // Unix timestamp in milliseconds
  landingPage?: string; // Path where captured (e.g., "/pricing")
  referrer?: string; // document.referrer value
}

/**
 * Full attribution data supporting both first-touch and last-touch models.
 * - firstTouch: The original source that brought the user (never overwritten)
 * - lastTouch: The most recent source (updated on each new visit with tracking params)
 */
export interface AttributionData {
  firstTouch: TrackingData | null;
  lastTouch: TrackingData | null;
}

/**
 * Storage keys used for persisting attribution data.
 */
export const STORAGE_KEYS = {
  FIRST_TOUCH: "dust_attribution_first",
  LAST_TOUCH: "dust_attribution_last",
  // Legacy key for migration
  LEGACY_UTM_DATA: "utm_data",
} as const;

/**
 * Flat UTM params object for backward compatibility with existing code.
 * This is what gets sent to APIs and included in form submissions.
 */
export type UTMParams = Partial<
  Pick<TrackingData, (typeof TRACKING_PARAMS)[number]>
>;
