// Marketing and UTM parameter keys to track across the application.
export const MARKETING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "li_fat_id",
] as const;

export type UTMParams = Partial<
  Record<(typeof MARKETING_PARAMS)[number], string>
>;

// Click ID keys that should be persisted as first-party cookies.
const CLICK_ID_KEYS = ["gclid", "fbclid", "msclkid", "li_fat_id"] as const;

// Per-platform recommended cookie expiry in days.
const CLICK_ID_COOKIE_EXPIRY_DAYS: Record<
  (typeof CLICK_ID_KEYS)[number],
  number
> = {
  li_fat_id: 30,
  gclid: 90,
  fbclid: 7,
  msclkid: 90,
};

// Extract UTM parameters from query string
export const extractUTMParams = (searchParams: {
  [key: string]: string | string[] | undefined;
}): UTMParams => {
  const utmParams: UTMParams = {};

  for (const key of MARKETING_PARAMS) {
    const value = searchParams[key];
    if (typeof value === "string") {
      utmParams[key] = value;
    }
  }

  return utmParams;
};

// Write click ID values as first-party cookies with per-platform expiry.
export function persistClickIdCookies(params: UTMParams): void {
  if (typeof document === "undefined") {
    return;
  }

  for (const key of CLICK_ID_KEYS) {
    const value = params[key];
    if (value) {
      const expiryDays = CLICK_ID_COOKIE_EXPIRY_DAYS[key];
      const expires = new Date(
        Date.now() + expiryDays * 24 * 60 * 60 * 1000
      ).toUTCString();
      document.cookie = `_dust_${key}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax; Secure`;
    }
  }
}

// Read click ID cookies back as UTMParams.
function getClickIdCookies(): UTMParams {
  if (typeof document === "undefined") {
    return {};
  }

  const params: UTMParams = {};
  const cookies = document.cookie.split("; ");

  for (const key of CLICK_ID_KEYS) {
    const prefix = `_dust_${key}=`;
    const cookie = cookies.find((c) => c.startsWith(prefix));
    if (cookie) {
      params[key] = decodeURIComponent(cookie.slice(prefix.length));
    }
  }

  return params;
}

// Get stored UTM parameters from sessionStorage, with cookie fallback for click IDs.
export const getStoredUTMParams = (): UTMParams => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const cookieParams = getClickIdCookies();
    const storedData = sessionStorage.getItem("utm_data");
    const sessionParams: UTMParams = storedData ? JSON.parse(storedData) : {};

    // sessionStorage wins when both present.
    return { ...cookieParams, ...sessionParams };
  } catch {
    return {};
  }
};

// Append UTM parameters to URLs.
export const appendUTMParams = (url: string, utmParams?: UTMParams): string => {
  if (typeof window === "undefined") {
    return url;
  }

  const params = utmParams ?? getStoredUTMParams();

  if (Object.keys(params).length === 0) {
    return url;
  }

  const [baseUrl, existingQuery] = url.split("?");
  const searchParams = new URLSearchParams(existingQuery ?? "");

  for (const [key, value] of Object.entries(params)) {
    if (!searchParams.has(key)) {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
};
