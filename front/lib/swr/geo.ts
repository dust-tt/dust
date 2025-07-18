import type { Fetcher } from "swr";

import type { GeoLocationResponse } from "@app/pages/api/geo/location";

import { fetcher, useSWRWithDefaults } from "./swr";

export function useGeolocation({ disabled }: { disabled?: boolean } = {}) {
  const geoFetcher: Fetcher<GeoLocationResponse> = fetcher;

  const { data, error } = useSWRWithDefaults(
    disabled ? null : "/api/geo/location",
    geoFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60 * 60 * 1000, // 1 hour
    }
  );

  return {
    geoData: data,
    isGeoDataLoading: !error && !data && !disabled,
    isGeoDataError: error,
  };
}
