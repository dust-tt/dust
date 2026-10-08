import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { GetTagsUsageResponseBody } from "@app/lib/resources/tags_resource";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PatchAgentTagsRequestBody } from "@app/types/api/assistant/configuration/agent_tags";
import type { GetTagsResponseBody } from "@app/types/api/tags";
import type { TagType } from "@app/types/tag";
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

export function useCreateTag({ owner }: { owner: LightWorkspaceType }) {
  const sendApiErrorNotification = useSendApiErrorNotification();
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
      sendApiErrorNotification({
        title: "Failed to create tag",
        error: json,
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
