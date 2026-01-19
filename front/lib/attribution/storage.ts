import type { AttributionData, TrackingData, UTMParams } from "./types";
import { COOKIE_EXPIRATION_DAYS, COOKIE_NAMES, STORAGE_KEYS } from "./types";

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
 * Set a cookie with proper expiration and security flags.
 */
function setCookie(name: string, value: string, days: number): void {
  if (!isBrowser()) {
    return;
  }
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

/**
 * Get a cookie value by name.
 */
function getCookie(name: string): string | null {
  if (!isBrowser()) {
    return null;
  }
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Get tracking data from localStorage, falling back to cookie.
 */
function getStoredData(
  localStorageKey: string,
  cookieName: string
): TrackingData | null {
  if (!isBrowser()) {
    return null;
  }

  // Try localStorage first
  const localData = safeJsonParse<TrackingData>(
    localStorage.getItem(localStorageKey)
  );
  if (localData) {
    return localData;
  }

  // Fall back to cookie
  return safeJsonParse<TrackingData>(getCookie(cookieName));
}

/**
 * Store tracking data in both localStorage and cookie.
 */
function setStoredData(
  localStorageKey: string,
  cookieName: string,
  data: TrackingData,
  hasConsent: boolean
): void {
  if (!isBrowser() || !hasConsent) {
    return;
  }

  const json = JSON.stringify(data);
  localStorage.setItem(localStorageKey, json);
  setCookie(cookieName, json, COOKIE_EXPIRATION_DAYS);
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
    setStoredData(
      STORAGE_KEYS.FIRST_TOUCH,
      COOKIE_NAMES.FIRST_TOUCH,
      trackingData,
      hasConsent
    );
    setStoredData(
      STORAGE_KEYS.LAST_TOUCH,
      COOKIE_NAMES.LAST_TOUCH,
      trackingData,
      hasConsent
    );
  }

  sessionStorage.removeItem(STORAGE_KEYS.LEGACY_UTM_DATA);
}

/**
 * Get full attribution data (first-touch and last-touch).
 * Reading is always allowed regardless of consent.
 */
export function getAttribution(): AttributionData {
  return {
    firstTouch: getStoredData(
      STORAGE_KEYS.FIRST_TOUCH,
      COOKIE_NAMES.FIRST_TOUCH
    ),
    lastTouch: getStoredData(STORAGE_KEYS.LAST_TOUCH, COOKIE_NAMES.LAST_TOUCH),
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
    setStoredData(
      STORAGE_KEYS.FIRST_TOUCH,
      COOKIE_NAMES.FIRST_TOUCH,
      data,
      hasConsent
    );
  }

  // Last-touch: always update
  setStoredData(
    STORAGE_KEYS.LAST_TOUCH,
    COOKIE_NAMES.LAST_TOUCH,
    data,
    hasConsent
  );
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

  // Extract only UTM params, exclude metadata
  const {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    gclid,
    fbclid,
    msclkid,
    li_fat_id,
  } = lastTouch;

  const params: UTMParams = {};
  if (utm_source) {
    params.utm_source = utm_source;
  }
  if (utm_medium) {
    params.utm_medium = utm_medium;
  }
  if (utm_campaign) {
    params.utm_campaign = utm_campaign;
  }
  if (utm_content) {
    params.utm_content = utm_content;
  }
  if (utm_term) {
    params.utm_term = utm_term;
  }
  if (gclid) {
    params.gclid = gclid;
  }
  if (fbclid) {
    params.fbclid = fbclid;
  }
  if (msclkid) {
    params.msclkid = msclkid;
  }
  if (li_fat_id) {
    params.li_fat_id = li_fat_id;
  }

  return params;
}
