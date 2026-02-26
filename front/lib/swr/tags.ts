import { useSendNotification } from "@app/hooks/useNotification";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PatchAgentTagsRequestBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/tags";
import type { GetTagsResponseBody } from "@app/pages/api/w/[wId]/tags";
import type { GetSuggestionsResponseBody } from "@app/pages/api/w/[wId]/tags/suggest_from_agents";
import type { GetTagsUsageResponseBody } from "@app/pages/api/w/[wId]/tags/usage";
import { isAPIErrorResponse } from "@app/types/error";
import type { TagKind, TagType } from "@app/types/tag";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useTags({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const tagsFetcher: Fetcher<GetTagsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/tags`,
    tagsFetcher,
    {
      disabled,
    }
  );

  return {
    tags: data?.tags ?? emptyArray(),
    isTagsLoading: !error && !data && !disabled,
    isTagsError: !!error,
    mutateTags: mutate,
  };
}

export function useTagsUsage({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const tagsFetcher: Fetcher<GetTagsUsageResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/tags/usage`,
    tagsFetcher,
    {
      disabled,
    }
  );

  return {
    tags: data?.tags ?? emptyArray(),
    isTagsLoading: !error && !data && !disabled,
    isTagsError: !!error,
    mutateTagsUsage: mutate,
  };
}

export function useTagsSuggestions({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const tagsFetcher: Fetcher<GetSuggestionsResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/tags/suggest_from_agents`,
    tagsFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      disabled,
    }
  );

  return {
    suggestions: data?.suggestions ?? emptyArray(),
    isSuggestionsLoading: !error && !data && !disabled,
    isSuggestionsError: !!error,
  };
}

export function useCreateTag({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();
  const { mutateTags } = useTags({ owner, disabled: true });
  const { mutateTagsUsage } = useTagsUsage({ owner, disabled: true });
  const { fetcherWithBody } = useFetcher();

  const createTag = async (
    name: string,
    agentIds?: string[]
  ): Promise<TagType | null> => {
    try {
      const json = await fetcherWithBody([
        `/api/w/${owner.sId}/tags`,
        { name, agentIds },
        "POST",
      ]);

      void mutateTags();
      void mutateTagsUsage();
      return json.tag;
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Failed to create tag",
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          description: e.error.message || "Failed to create tag",
        });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to create tag",
          description: "An error occurred",
        });
      }
      return null;
    }
  };

  return {
    createTag,
  };
}

export function useDeleteTag({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();
  const { mutateTags } = useTags({ owner, disabled: true });
  const { mutateTagsUsage } = useTagsUsage({ owner, disabled: true });
  const { fetcher } = useFetcher();

  const deleteTag = async (tagId: string) => {
    try {
      await fetcher(`/api/w/${owner.sId}/tags/${tagId}`, {
        method: "DELETE",
      });

      sendNotification({
        type: "success",
        title: "Tag deleted",
      });

      void mutateTags();
      void mutateTagsUsage();
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Failed to delete tag",
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          description: e.error.message || "Failed to delete tag",
        });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to delete tag",
          description: "An error occurred",
        });
      }
    }
  };

  return {
    deleteTag,
  };
}

export function useUpdateTag({
  owner,
  tagId,
}: {
  owner: LightWorkspaceType;
  tagId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateTags } = useTags({ owner, disabled: true });
  const { mutateTagsUsage } = useTagsUsage({ owner, disabled: true });
  const { fetcherWithBody } = useFetcher();

  const updateTag = async ({ name, kind }: { name: string; kind: TagKind }) => {
    try {
      await fetcherWithBody([
        `/api/w/${owner.sId}/tags/${tagId}`,
        { name, kind },
        "PUT",
      ]);

      sendNotification({
        type: "success",
        title: "Tag updated",
      });

      void mutateTags();
      void mutateTagsUsage();
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Failed to delete tag",
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          description: e.error.message || "Failed to create tag",
        });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to delete tag",
          description: "An error occurred",
        });
      }
    }
  };

  return {
    updateTag,
  };
}

export function useUpdateAgentTags({ owner }: { owner: LightWorkspaceType }) {
  const { fetcherWithBody } = useFetcher();

  const updateAgentTags = useCallback(
    async (agentConfigurationId: string, body: PatchAgentTagsRequestBody) => {
      await fetcherWithBody([
        `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/tags`,
        body,
        "PATCH",
      ]);
    },
    [owner, fetcherWithBody]
  );

  return updateAgentTags;
}
