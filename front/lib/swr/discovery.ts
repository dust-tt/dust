import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetDiscoveryForYouResponseBody,
  GetDiscoveryTrendingResponseBody,
  GetFeaturedDiscoveryItemsResponseBody,
  GetGroupDiscoveryPinsResponseBody,
} from "@app/types/api/discovery";
import type { GroupPinnedItemType } from "@app/types/discovery";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";
import { mutate } from "swr";

const DISCOVERY_PENDING_POLL_INTERVAL_MS = 1_000;

function pollWhilePending(
  data: { items: unknown[] | null } | undefined
): number {
  return data?.items === null ? DISCOVERY_PENDING_POLL_INTERVAL_MS : 0;
}

interface UseDiscoveryOptions {
  workspaceId: string;
}

function featuredUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/discovery/featured`;
}

function groupPinsUrl(workspaceId: string, groupId: string): string {
  return `/api/w/${workspaceId}/groups/${groupId}/discovery/pins`;
}

export function useDiscoveryFeatured({ workspaceId }: UseDiscoveryOptions) {
  const { fetcher } = useFetcher();
  const featuredFetcher: Fetcher<GetFeaturedDiscoveryItemsResponseBody> =
    fetcher;
  const { data, isLoading } = useSWRWithDefaults(
    featuredUrl(workspaceId),
    featuredFetcher
  );

  return {
    featuredItems: data?.items ?? emptyArray(),
    isFeaturedLoading: isLoading,
  };
}

export function useDiscoveryForYou({ workspaceId }: UseDiscoveryOptions) {
  const { fetcher } = useFetcher();
  const forYouFetcher: Fetcher<GetDiscoveryForYouResponseBody> = fetcher;
  const { data, isLoading } = useSWRWithDefaults(
    `/api/w/${workspaceId}/discovery/for_you`,
    forYouFetcher,
    { revalidateOnFocus: false, refreshInterval: pollWhilePending }
  );

  return {
    forYouItems: data?.items ?? emptyArray(),
    isForYouLoading: isLoading || data?.items === null,
  };
}

export function useDiscoveryTrending({ workspaceId }: UseDiscoveryOptions) {
  const { fetcher } = useFetcher();
  const trendingFetcher: Fetcher<GetDiscoveryTrendingResponseBody> = fetcher;
  const { data, isLoading } = useSWRWithDefaults(
    `/api/w/${workspaceId}/discovery/trending`,
    trendingFetcher,
    { revalidateOnFocus: false, refreshInterval: pollWhilePending }
  );

  return {
    trendingItems: data?.items ?? emptyArray(),
    isTrendingLoading: isLoading || data?.items === null,
  };
}

interface UseGroupDiscoveryPinsOptions {
  workspaceId: string;
  groupId: string;
}

export function useGroupDiscoveryPins({
  workspaceId,
  groupId,
}: UseGroupDiscoveryPinsOptions) {
  const { fetcher } = useFetcher();
  const groupPinsFetcher: Fetcher<GetGroupDiscoveryPinsResponseBody> = fetcher;
  const { data, isLoading, isValidating } = useSWRWithDefaults(
    groupPinsUrl(workspaceId, groupId),
    groupPinsFetcher
  );

  return {
    groupPins: data?.items ?? emptyArray(),
    isGroupPinsLoading: isLoading,
    isGroupPinsRefreshing: isValidating && !isLoading,
  };
}

interface PinDiscoveryItemArgs {
  groupId: string;
  position: number;
  type: GroupPinnedItemType;
  itemId: string;
  itemName: string;
  audienceName: string;
}

export function usePinDiscoveryItem({ workspaceId }: UseDiscoveryOptions) {
  const sendNotification = useSendNotification();
  const [isPinning, setIsPinning] = useState(false);

  const doPin = useCallback(
    async ({
      groupId,
      position,
      type,
      itemId,
      itemName,
      audienceName,
    }: PinDiscoveryItemArgs): Promise<boolean> => {
      setIsPinning(true);
      try {
        const res = await clientFetch(
          `${groupPinsUrl(workspaceId, groupId)}/${position}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, itemId }),
          }
        );

        if (!res.ok) {
          const error = await res.json();
          sendNotification({
            type: "error",
            title: "Failed to pin to Featured",
            description:
              error?.error?.message ?? "An unexpected error occurred.",
          });
          return false;
        }

        sendNotification({
          type: "success",
          title: `Pinned in position ${position + 1}`,
          description: `${itemName} is now featured for ${audienceName}.`,
        });
        await Promise.all([
          mutate(featuredUrl(workspaceId)),
          mutate(groupPinsUrl(workspaceId, groupId)),
        ]);
        return true;
      } catch (e) {
        sendNotification({
          type: "error",
          title: "Failed to pin to Featured",
          description: normalizeError(e).message,
        });
        return false;
      } finally {
        setIsPinning(false);
      }
    },
    [workspaceId, sendNotification]
  );

  return { doPin, isPinning };
}
