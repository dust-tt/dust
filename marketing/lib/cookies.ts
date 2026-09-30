import type { UserType } from "@marketing/types/user";

export const DUST_COOKIES_ACCEPTED = "dust-cookies-accepted";
export const DUST_HAS_SESSION = "dust-has-session";

// Set when the visitor opts into going straight to the app from the marketing
// root. Read server-side in the root page's `getServerSideProps`.
export const DUST_SKIP_LANDING = "dust-skip-landing";
// Set when the visitor dismisses the opt-in prompt without opting in, so it
// stops being offered. Client-side only.
export const DUST_SKIP_LANDING_PROMPT_DISMISSED =
  "dust-skip-landing-prompt-dismissed";

const SKIP_LANDING_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // 1 year

// Host-only (no `domain`) on purpose: the preference is per-region, so opting in
// on dust.tt must not silently opt the visitor in on eu.dust.tt.
export const SKIP_LANDING_COOKIE_OPTIONS = {
  path: "/",
  maxAge: SKIP_LANDING_COOKIE_MAX_AGE_SECONDS,
  sameSite: "lax",
} as const;

function isCookieFlagSet(
  cookieValue: string | number | boolean | undefined
): boolean {
  return cookieValue === "1" || cookieValue === 1 || cookieValue === true;
}

export function hasSessionIndicator(
  cookieValue: string | number | boolean | undefined
): boolean {
  return isCookieFlagSet(cookieValue);
}

export function shouldSkipLanding(
  cookieValue: string | number | boolean | undefined
): boolean {
  return isCookieFlagSet(cookieValue);
}

export function isSkipLandingPromptDismissed(
  cookieValue: string | number | boolean | undefined
): boolean {
  return isCookieFlagSet(cookieValue);
}

export function hasCookiesAccepted(
  cookieValue: string | boolean | undefined,
  user?: UserType | null
): boolean {
  if (user) {
    return true;
  }

  return (
    cookieValue === "true" || cookieValue === "auto" || cookieValue === true
  );
}

/**
 * @cc [owner:dchristenhuis,label:product;security] explicit-analytics-consent-only
 * Returns true only when the visitor clicked an accept action, i.e. the cookie is exactly `"true"`.
 * The geolocation-based `"auto"` value, a missing cookie, and a logged-in session MUST NOT count as
 * explicit consent.
 */
export function hasExplicitAnalyticsConsent(
  cookieValue: string | boolean | undefined
): boolean {
  return cookieValue === "true" || cookieValue === true;
}

// Separate from DUST_COOKIES_ACCEPTED: accepting analytics cookies never implies replay consent.
export const DUST_SESSION_REPLAY_CONSENT = "dust-session-replay-consent";

export type SessionReplayConsentValue = "granted" | "denied";

/**
 * @cc [owner:dchristenhuis,label:product;security] replay-consent-explicit-only
 * Returns true only when the replay consent cookie is exactly `"granted"`. A missing, unknown, or
 * `"denied"` value MUST return false. Login state, geolocation, and the analytics consent cookie
 * MUST NOT be inputs to this decision.
 */
export function hasSessionReplayConsent(
  cookieValue: string | boolean | undefined
): boolean {
  return cookieValue === "granted";
}

// Host-only (no `domain`) on purpose: marketing replay consent must not be readable by, or leak
// into, app.dust.tt where onboarding recording follows its own rules.
export const CONSENT_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 183 * 24 * 60 * 60, // 6 months
  sameSite: "lax",
} as const;

export function shouldCheckGeolocation(
  cookieValue: string | boolean | undefined
): boolean {
  return cookieValue === undefined;
}
