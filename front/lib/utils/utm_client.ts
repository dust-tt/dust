import type { UTMParams } from "@app/lib/utils/utm";
import { getStoredUTMParams } from "@app/lib/utils/utm";
import { posthog } from "posthog-js";

// Append UTM parameters to URLs.
export const appendUTMParams = (url: string, utmParams?: UTMParams): string => {
  if (typeof window === "undefined") {
    return url;
  }

  const params = utmParams ?? getStoredUTMParams();

  const posthogId = posthog.get_distinct_id();
  if (posthogId) {
    params.posthog_id = posthogId;
  }

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
