import {
  getAttribution,
  getStoredUTMParamsFromAttribution,
  TRACKING_PARAMS,
} from "@app/lib/attribution";

/**
 * Extract UTM parameters from query string.
 */
export function extractUTMParams(searchParams: {
  [key: string]: string | string[] | undefined;
}): Record<string, string> {
  return Object.fromEntries(
    TRACKING_PARAMS.filter(
      (key) => typeof searchParams[key] === "string"
    ).map((key) => [key, searchParams[key] as string])
  );
}

/**
 * Get stored UTM parameters.
 * Uses the new attribution layer with localStorage persistence,
 * with fallback to legacy sessionStorage for backward compatibility.
 */
export function getStoredUTMParams(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  // Try new attribution layer first (localStorage)
  const fromAttribution = getStoredUTMParamsFromAttribution();
  const filtered = Object.fromEntries(
    Object.entries(fromAttribution).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  );
  if (Object.keys(filtered).length > 0) {
    return filtered;
  }

  // Fallback to legacy sessionStorage for backward compatibility
  try {
    const storedData = sessionStorage?.getItem("utm_data");
    return storedData ? JSON.parse(storedData) : {};
  } catch {
    return {};
  }
}

/**
 * Get full attribution data with first-touch and last-touch.
 * Use this when you need both attribution models.
 */
export { getAttribution as getFullAttribution };

/**
 * Append UTM parameters to a URL.
 */
export function appendUTMParams(
  url: string,
  utmParams?: Record<string, string>
): string {
  if (typeof window === "undefined") {
    return url;
  }

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const params = utmParams || getStoredUTMParams();

  if (Object.keys(params).length === 0) {
    return url;
  }

  const [baseUrl, existingQuery] = url.split("?");
  const searchParams = new URLSearchParams(existingQuery ?? "");

  // Add UTM parameters, avoiding duplicates.
  for (const [key, value] of Object.entries(params)) {
    if (!searchParams.has(key)) {
      searchParams.set(key, value);
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}
