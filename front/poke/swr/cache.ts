import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeCacheResponseBody } from "@app/pages/api/poke/cache";
import type { Fetcher } from "swr";

interface UsePokeCacheLookupParams {
  type?: string;
  params?: Record<string, string>;
  rawKey?: string;
  disabled?: boolean;
}

export function usePokeCacheLookup({
  type,
  params,
  rawKey,
  disabled,
}: UsePokeCacheLookupParams) {
  const cacheFetcher: Fetcher<GetPokeCacheResponseBody> = fetcher;

  const queryParams = new URLSearchParams();
  if (rawKey) {
    queryParams.set("rawKey", rawKey);
  } else if (type) {
    queryParams.set("type", type);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        queryParams.set(key, value);
      }
    }
  }

  const { data, error } = useSWRWithDefaults(
    `/api/poke/cache?${queryParams.toString()}`,
    cacheFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isCacheLoading: !error && !data && !disabled,
    isCacheError: error,
  };
}
