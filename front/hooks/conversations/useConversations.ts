import {
  emptyArray,
  useFetcher,
  useSWRInfiniteWithDefaults,
} from "@app/lib/swr/swr";
import type { GetConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";
import {
  type SWRInfiniteMutatorOptions,
  unstable_serialize,
} from "swr/infinite";

const DEFAULT_LIMIT = 100;

type ConversationsUpdater = (
  prevData: ConversationWithoutContentType[] | undefined
) => ConversationWithoutContentType[] | undefined;

type MutateOptions = {
  revalidate?: boolean;
};

function getConversationsKey(
  workspaceId: string,
  limit: number,
  previousPageData: GetConversationsResponseBody | null
) {
  if (previousPageData && !previousPageData.hasMore) {
    return null;
  }

  const baseUrl = `/api/w/${workspaceId}/assistant/conversations?limit=${limit}`;

  if (previousPageData === null) {
    return baseUrl;
  }

  return `${baseUrl}&lastValue=${previousPageData.lastValue}`;
}

function updateConversationPages(
  prevPages: GetConversationsResponseBody[] | undefined,
  updater: ConversationsUpdater
) {
  if (!prevPages) {
    return prevPages;
  }

  const allConversations = prevPages.flatMap((page) => page.conversations);
  const updatedConversations = updater(allConversations);

  if (!updatedConversations) {
    return prevPages;
  }

  let offset = 0;
  return prevPages.map((page, index) => {
    const isLastPage = index === prevPages.length - 1;
    const conversations = updatedConversations.slice(
      offset,
      isLastPage ? undefined : offset + page.conversations.length
    );
    offset += page.conversations.length;
    return { ...page, conversations };
  });
}

export function useConversations({
  workspaceId,
  limit = DEFAULT_LIMIT,
}: {
  workspaceId: string;
  limit?: number;
}) {
  const { fetcher } = useFetcher();
  const conversationsFetcher: Fetcher<GetConversationsResponseBody> = fetcher;

  const { data, error, mutate, size, setSize, isValidating } =
    useSWRInfiniteWithDefaults(
      (
        _pageIndex: number,
        previousPageData: GetConversationsResponseBody | null
      ) => getConversationsKey(workspaceId, limit, previousPageData),
      conversationsFetcher,
      {
        revalidateAll: false,
        revalidateFirstPage: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      }
    );

  const conversations = useMemo(() => {
    if (!data) {
      return emptyArray<ConversationWithoutContentType>();
    }
    return data.flatMap((page) => page.conversations);
  }, [data]);

  const hasMore = data ? (data[data.length - 1]?.hasMore ?? false) : false;

  const loadMore = useCallback(() => {
    if (hasMore && !isValidating) {
      void setSize(size + 1);
    }
  }, [hasMore, isValidating, setSize, size]);

  const mutateConversations = useCallback(
    (updater?: ConversationsUpdater, options?: MutateOptions) => {
      if (!updater) {
        return mutate();
      }

      const swrOptions: SWRInfiniteMutatorOptions<
        GetConversationsResponseBody[]
      > = {
        revalidate: options?.revalidate ?? true,
      };

      return mutate(
        (prevPages) => updateConversationPages(prevPages, updater),
        swrOptions
      );
    },
    [mutate]
  );

  return {
    conversations,
    isConversationsLoading: !error && !data,
    isConversationsError: error,
    mutateConversations,
    hasMore,
    loadMore,
    isLoadingMore: isValidating && size > 1,
  };
}

export function useMutateConversations({
  workspaceId,
  limit = DEFAULT_LIMIT,
}: {
  workspaceId: string;
  limit?: number;
}) {
  const { mutate } = useSWRConfig();

  const mutateConversations = useCallback(
    (updater?: ConversationsUpdater, options?: MutateOptions) => {
      const key = unstable_serialize((pageIndex, previousPageData) =>
        getConversationsKey(workspaceId, limit, previousPageData)
      );

      if (!updater) {
        return mutate(key);
      }

      const mutateOptions = {
        revalidate: options?.revalidate ?? true,
      };

      return mutate<GetConversationsResponseBody[]>(
        key,
        (prevPages) => updateConversationPages(prevPages, updater),
        mutateOptions
      );
    },
    [limit, mutate, workspaceId]
  );

  return {
    mutateConversations,
  };
}
