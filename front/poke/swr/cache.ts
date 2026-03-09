import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetPokeCacheResponseBody,
  RedisInstance,
} from "@app/pages/api/poke/cache";
import { useState } from "react";
import type { Fetcher } from "swr";

interface UsePokeCacheLookupParams {
  rawKey?: string;
  resourceId?: string;
  params?: Record<string, string>;
  disabled?: boolean;
}

export function usePokeCacheLookup({
  rawKey,
  resourceId,
  params,
  disabled,
}: UsePokeCacheLookupParams) {
  const { fetcher } = useFetcher();
  const cacheFetcher: Fetcher<GetPokeCacheResponseBody> = fetcher;

  const queryParams = new URLSearchParams();
  if (rawKey) {
    queryParams.set("rawKey", rawKey);
  }
  if (resourceId) {
    queryParams.set("resourceId", resourceId);
  }
  if (params) {
    queryParams.set("params", JSON.stringify(params));
  }

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/cache?${queryParams.toString()}`,
    cacheFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isCacheLoading: !error && !data && !disabled,
    isCacheError: error,
    mutateCache: mutate,
  };
}

interface UsePokeCacheInvalidateParams {
  rawKey?: string;
  resourceId?: string;
  params?: Record<string, string>;
  redisInstance: RedisInstance;
}

export function usePokeCacheInvalidate() {
  const [isInvalidating, setIsInvalidating] = useState(false);

  const doInvalidate = async ({
    rawKey,
    resourceId,
    params,
    redisInstance,
  }: UsePokeCacheInvalidateParams) => {
    setIsInvalidating(true);
    try {
      const queryParams = new URLSearchParams();
      if (rawKey) {
        queryParams.set("rawKey", rawKey);
      }
      if (resourceId) {
        queryParams.set("resourceId", resourceId);
      }
      if (params) {
        queryParams.set("params", JSON.stringify(params));
      }
      queryParams.set("redisInstance", redisInstance);

      const res = await clientFetch(
        `/api/poke/cache?${queryParams.toString()}`,
        {
          method: "DELETE",
        }
      );

      return res.ok;
    } finally {
      setIsInvalidating(false);
    }
  };

  return { doInvalidate, isInvalidating };
}
