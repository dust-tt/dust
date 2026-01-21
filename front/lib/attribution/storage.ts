import type { AttributionData, TrackingData, UTMParams } from "./types";
import { STORAGE_KEYS, TRACKING_PARAMS } from "./types";

/**
 * Check if we're in a browser environment.
 */
function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Safely parse JSON, returning null on failure.
 */
function safeJsonParse<T>(json: string | null): T | null {
  if (!json) {
    return null;
  }
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Migrate legacy sessionStorage UTM data to new format.
 * Called once on initialization.
 */
function migrateLegacyData(hasConsent: boolean): void {
  if (!isBrowser() || !hasConsent) {
    return;
  }

  const legacyData = sessionStorage.getItem(STORAGE_KEYS.LEGACY_UTM_DATA);
  if (!legacyData) {
    return;
  }

  // Check if we already have first-touch data
  const existingFirst = localStorage.getItem(STORAGE_KEYS.FIRST_TOUCH);
  if (existingFirst) {
    // Already migrated, clean up legacy
    sessionStorage.removeItem(STORAGE_KEYS.LEGACY_UTM_DATA);
    return;
  }

  const parsed = safeJsonParse<UTMParams>(legacyData);
  if (parsed && Object.keys(parsed).length > 0) {
    const trackingData: TrackingData = {
      ...parsed,
      capturedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.FIRST_TOUCH, JSON.stringify(trackingData));
    localStorage.setItem(STORAGE_KEYS.LAST_TOUCH, JSON.stringify(trackingData));
  }

  sessionStorage.removeItem(STORAGE_KEYS.LEGACY_UTM_DATA);
}

/**
 * Get full attribution data (first-touch and last-touch).
 */
export function getAttribution(): AttributionData {
  if (!isBrowser()) {
    return { firstTouch: null, lastTouch: null };
  }

  return {
    firstTouch: safeJsonParse<TrackingData>(
      localStorage.getItem(STORAGE_KEYS.FIRST_TOUCH)
    ),
    lastTouch: safeJsonParse<TrackingData>(
      localStorage.getItem(STORAGE_KEYS.LAST_TOUCH)
    ),
  };
}

/**
 * Store attribution data with first-touch/last-touch logic.
 * - First-touch is only set once (never overwritten)
 * - Last-touch is always updated
 *
 * @param data - The tracking data to store
 * @param hasConsent - Whether user has consented to tracking (from hasCookiesAccepted)
 */
export function setAttribution(data: TrackingData, hasConsent: boolean): void {
  if (!isBrowser() || !hasConsent) {
    return;
  }

  // Run migration on first store attempt
  migrateLegacyData(hasConsent);

  const current = getAttribution();

  // First-touch: only set if not already present
  if (!current.firstTouch) {
    localStorage.setItem(STORAGE_KEYS.FIRST_TOUCH, JSON.stringify(data));
  }

  // Last-touch: always update
  localStorage.setItem(STORAGE_KEYS.LAST_TOUCH, JSON.stringify(data));
}

/**
 * Get UTM params in the legacy flat format for backward compatibility.
 * Uses last-touch by default (most recent attribution).
 */
export function getStoredUTMParamsFromAttribution(): UTMParams {
  const { lastTouch } = getAttribution();
  if (!lastTouch) {
    return {};
  }

  return Object.fromEntries(
    TRACKING_PARAMS.filter((key) => lastTouch[key] !== undefined).map((key) => [
      key,
      lastTouch[key],
    ])
  );
}
