import { useCallback } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PatchAgentTagsRequestBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/tags";
import type { GetTagsResponseBody } from "@app/pages/api/w/[wId]/tags";
import type { GetSuggestionsResponseBody } from "@app/pages/api/w/[wId]/tags/suggest_from_agents";
import type { GetTagsUsageResponseBody } from "@app/pages/api/w/[wId]/tags/usage";
import type { LightWorkspaceType } from "@app/types";
import type { TagKind, TagType } from "@app/types/tag";

export function useTags({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
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

  const createTag = async (
    name: string,
    agentIds?: string[]
  ): Promise<TagType | null> => {
    const res = await clientFetch(`/api/w/${owner.sId}/tags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, agentIds }),
    });

    if (!res.ok) {
      const json = await res.json();
      sendNotification({
        type: "error",
        title: "Failed to create tag",
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        description: json.error.message || "Failed to create tag",
      });

      return null;
    }

    void mutateTags();
    void mutateTagsUsage();
    const json = await res.json();
    return json.tag;
  };

  return {
    createTag,
  };
}

export function useDeleteTag({ owner }: { owner: LightWorkspaceType }) {
  const sendNotification = useSendNotification();
  const { mutateTags } = useTags({ owner, disabled: true });
  const { mutateTagsUsage } = useTagsUsage({ owner, disabled: true });

  const deleteTag = async (tagId: string) => {
    const res = await clientFetch(`/api/w/${owner.sId}/tags/${tagId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const json = await res.json();

      sendNotification({
        type: "error",
        title: "Failed to delete tag",
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        description: json.error.message || "Failed to delete tag",
      });

      return;
    }

    sendNotification({
      type: "success",
      title: "Tag deleted",
    });

    void mutateTags();
    void mutateTagsUsage();
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

  const updateTag = async ({ name, kind }: { name: string; kind: TagKind }) => {
    const res = await clientFetch(`/api/w/${owner.sId}/tags/${tagId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        kind,
      }),
    });

    if (!res.ok) {
      const json = await res.json();

      sendNotification({
        type: "error",
        title: "Failed to delete tag",
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        description: json.error.message || "Failed to create tag",
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "Tag updated",
    });

    void mutateTags();
    void mutateTagsUsage();
  };

  return {
    updateTag,
  };
}

export function useUpdateAgentTags({ owner }: { owner: LightWorkspaceType }) {
  const updateAgentTags = useCallback(
    async (agentConfigurationId: string, body: PatchAgentTagsRequestBody) => {
      await clientFetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/tags`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
    },
    [owner]
  );

  return updateAgentTags;
}
