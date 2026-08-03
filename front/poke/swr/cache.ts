import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  DeleteAllPokeCacheResponseBody,
  GetPokeCacheResponseBody,
  RedisInstance,
} from "@app/types/api/poke/cache";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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

export function usePokeCacheDeleteAll() {
  const sendNotification = useSendNotification();
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const doDeleteAll = async ({
    resourceId,
  }: {
    resourceId: string;
  }): Promise<boolean> => {
    setIsDeletingAll(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("resourceId", resourceId);

      const res = await clientFetch(
        `/api/poke/cache/all?${queryParams.toString()}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        sendNotification({
          title: "Failed to delete cache entries",
          description: errorData.error?.message ?? "Unknown error",
          type: "error",
        });
        return false;
      }

      const body: DeleteAllPokeCacheResponseBody = await res.json();
      sendNotification({
        title: "Cache entries deleted",
        description: `Deleted ${body.deletedCount} entries matching '${body.pattern}'.`,
        type: "success",
      });
      return true;
    } catch (error) {
      sendNotification({
        title: "Failed to delete cache entries",
        description: normalizeError(error).message,
        type: "error",
      });
      return false;
    } finally {
      setIsDeletingAll(false);
    }
  };

  return { doDeleteAll, isDeletingAll };
}
