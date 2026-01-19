import {
  getAttribution,
  getStoredUTMParamsFromAttribution,
  TRACKING_PARAMS,
} from "@app/lib/attribution";

// Extract UTM parameters from query string
export const extractUTMParams = (searchParams: {
  [key: string]: string | string[] | undefined;
}): { [key: string]: string } => {
  const utmParams: { [key: string]: string } = {};

  // Extract only string values from query parameters
  TRACKING_PARAMS.forEach((key) => {
    const value = searchParams[key];
    if (typeof value === "string") {
      utmParams[key] = value;
    }
  });

  return utmParams;
};

/**
 * Get stored UTM parameters.
 * Uses the new attribution layer with localStorage persistence,
 * with fallback to legacy sessionStorage for backward compatibility.
 */
export const getStoredUTMParams = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }

  // Try new attribution layer first (localStorage)
  const fromAttribution = getStoredUTMParamsFromAttribution();
  // Filter out undefined values to match expected return type
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(fromAttribution)) {
    if (value !== undefined) {
      filtered[key] = value;
    }
  }
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
};

/**
 * Get full attribution data with first-touch and last-touch.
 * Use this when you need both attribution models.
 */
export { getAttribution as getFullAttribution };

// Helper to append UTM parameters to URLs
export const appendUTMParams = (
  url: string,
  utmParams?: { [key: string]: string }
): string => {
  if (typeof window === "undefined") {
    return url;
  }

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const params = utmParams || getStoredUTMParams();

  if (Object.keys(params).length === 0) {
    return url;
  }

  const [baseUrl, existingQuery] = url.split("?");
  const searchParams = new URLSearchParams(existingQuery || "");

  // Add UTM parameters, avoiding duplicates
  Object.entries(params).forEach(([key, value]) => {
    if (!searchParams.has(key)) {
      searchParams.set(key, value);
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
};
