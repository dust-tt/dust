import type { UserType } from "@marketing/types/user";

export const DUST_COOKIES_ACCEPTED = "dust-cookies-accepted";
export const DUST_HAS_SESSION = "dust-has-session";

export function hasSessionIndicator(
  cookieValue: string | number | boolean | undefined
): boolean {
  return cookieValue === "1" || cookieValue === 1 || cookieValue === true;
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

export function shouldCheckGeolocation(
  cookieValue: string | boolean | undefined
): boolean {
  return cookieValue === undefined;
}
