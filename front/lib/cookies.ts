import type { UserType } from "@app/types/user";

export const DUST_COOKIES_ACCEPTED = "dust-cookies-accepted";

/**
 * Determines if cookies have been accepted based on cookie value or user authentication
 * @param cookieValue - The value of the dust-cookies-accepted cookie
 * @param user - Optional user object (logged in users are considered to have accepted cookies)
 * @returns boolean indicating if cookies are accepted
 */
export function hasCookiesAccepted(
  cookieValue: string | boolean | undefined,
  user?: UserType | null
): boolean {
  // Logged-in users are considered to have accepted cookies
  if (user) {
    return true;
  }

  // Check explicit cookie consent values
  return (
    cookieValue === "true" || cookieValue === "auto" || cookieValue === true
  );
}

/**
 * Checks if we should auto-accept cookies based on geolocation
 * @param cookieValue - The current cookie value
 * @returns boolean indicating if we should check geolocation
 */
export function shouldCheckGeolocation(
  cookieValue: string | boolean | undefined
): boolean {
  return cookieValue === undefined;
}
