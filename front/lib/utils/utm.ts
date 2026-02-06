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

// Type for UTM parameters - derived from MARKETING_PARAMS.
export type UTMParams = Partial<
  Record<(typeof MARKETING_PARAMS)[number], string>
>;

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

// Get stored UTM parameters from sessionStorage.
export const getStoredUTMParams = (): UTMParams => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const storedData = sessionStorage.getItem("utm_data");
    return storedData ? JSON.parse(storedData) : {};
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
