import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetDiscoveryForYouResponseBody,
  GetDiscoveryTrendingResponseBody,
  GetFeaturedDiscoveryItemsResponseBody,
} from "@app/types/api/discovery";
import type { Fetcher } from "swr";

const DISCOVERY_PENDING_POLL_INTERVAL_MS = 1_000;

function pollWhilePending(
  data: { items: unknown[] | null } | undefined
): number {
  return data?.items === null ? DISCOVERY_PENDING_POLL_INTERVAL_MS : 0;
}

interface UseDiscoveryOptions {
  workspaceId: string;
}

export function useDiscoveryFeatured({ workspaceId }: UseDiscoveryOptions) {
  const { fetcher } = useFetcher();
  const featuredFetcher: Fetcher<GetFeaturedDiscoveryItemsResponseBody> =
    fetcher;
  const { data, isLoading } = useSWRWithDefaults(
    `/api/w/${workspaceId}/discovery/featured`,
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
