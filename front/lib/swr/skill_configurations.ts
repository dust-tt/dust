import { useCallback } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetSkillConfigurationsResponseBody } from "@app/pages/api/w/[wId]/skills";
import type { GetSimilarSkillsResponseBody } from "@app/pages/api/w/[wId]/skills/similar";
import type { LightWorkspaceType } from "@app/types";
import { Ok } from "@app/types";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

export function useSkillConfigurations({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const skillConfigurationsFetcher: Fetcher<GetSkillConfigurationsResponseBody> =
    fetcher;

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/skills`,
    skillConfigurationsFetcher,
    { disabled }
  );

  return {
    skillConfigurations: data?.skillConfigurations ?? emptyArray(),
    isSkillConfigurationsError: !!error,
    isSkillConfigurationsLoading: isLoading,
    mutateSkillConfigurations: mutate,
  };
}

export function useSimilarSkills({ owner }: { owner: LightWorkspaceType }) {
  const getSimilarSkills = useCallback(
    async (naturalDescription: string, signal?: AbortSignal) => {
      const response: GetSimilarSkillsResponseBody = await fetcher(
        `/api/w/${owner.sId}/skills/similar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ naturalDescription }),
          signal,
        }
      );
      return new Ok(response.similar_skills);
    },
    [owner.sId]
  );

  return { getSimilarSkills };
}

export function useArchiveSkillConfiguration({
  owner,
  skillConfiguration,
}: {
  owner: LightWorkspaceType;
  skillConfiguration: SkillConfigurationType;
}) {
  const sendNotification = useSendNotification();
  const { mutateSkillConfigurations } = useSkillConfigurations({
    workspaceId: owner.sId,
    disabled: true,
  });

  const doArchive = async () => {
    if (!skillConfiguration.sId) {
      return;
    }
    const res = await clientFetch(
      `/api/w/${owner.sId}/skills/${skillConfiguration.sId}`,
      {
        method: "DELETE",
      }
    );

    if (res.ok) {
      void mutateSkillConfigurations();

      sendNotification({
        type: "success",
        title: `Successfully archived ${skillConfiguration.name}`,
        description: `${skillConfiguration.name} was successfully archived.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error archiving ${skillConfiguration.name}`,
        description: `Error: ${errorData.message}`,
      });
    }
    return res.ok;
  };

  return doArchive;
}
