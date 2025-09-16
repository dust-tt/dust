import type { Fetcher } from "swr";

import type { GeoLocationResponse } from "@app/pages/api/geo/location";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { fetcher, useSWRWithDefaults } from "./swr";

const GEO_CACHE_KEY = "dust-geo-location";
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

interface CachedGeoData {
  data: GeoLocationResponse;
  timestamp: number;
}

function getCachedGeoData(): GeoLocationResponse | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const cached = localStorage.getItem(GEO_CACHE_KEY);
    if (!cached) {
      return null;
    }

    const { data, timestamp }: CachedGeoData = JSON.parse(cached);
    const now = Date.now();

    if (now - timestamp > CACHE_DURATION) {
      localStorage.removeItem(GEO_CACHE_KEY);
      return null;
    }

    return data;
  } catch (err) {
    const error = normalizeError(err);
    console.warn("Failed to parse cached geo data:", error.message);
    localStorage.removeItem(GEO_CACHE_KEY);
    return null;
  }
}

function setCachedGeoData(data: GeoLocationResponse): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const cached: CachedGeoData = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cached));
  } catch (err) {
    const error = normalizeError(err);
    console.warn("Failed to cache geo data:", error.message);
  }
}

export function useGeolocation({ disabled }: { disabled?: boolean } = {}) {
  const cachedData = getCachedGeoData();
  const shouldFetch = !disabled && !cachedData;

  const geoFetcher: Fetcher<GeoLocationResponse> = async (url: string) => {
    const result = await fetcher(url);
    setCachedGeoData(result);
    return result;
  };

  const { data, error } = useSWRWithDefaults(
    shouldFetch ? "/api/geo/location" : null,
    geoFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: CACHE_DURATION,
    }
  );

  return {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    geoData: cachedData || data,
    isGeoDataLoading: !error && !cachedData && !data && !disabled,
    isGeoDataError: error,
  };
}
