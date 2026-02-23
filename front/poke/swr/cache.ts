import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeCacheResponseBody } from "@app/pages/api/poke/cache";
import type { Fetcher } from "swr";

interface UsePokeCacheLookupParams {
  rawKey?: string;
  disabled?: boolean;
}

export function usePokeCacheLookup({
  rawKey,
  disabled,
}: UsePokeCacheLookupParams) {
  const { fetcher } = useFetcher();
  const cacheFetcher: Fetcher<GetPokeCacheResponseBody> = fetcher;

  const queryParams = new URLSearchParams();
  if (rawKey) {
    queryParams.set("rawKey", rawKey);
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
