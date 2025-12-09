import { useCallback } from "react";
import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetSkillConfigurationsResponseBody } from "@app/pages/api/w/[wId]/skills";
import type { GetSimilarSkillsResponseBody } from "@app/pages/api/w/[wId]/skills/similar";
import type { LightWorkspaceType } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export function useSkillConfigurations({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const skillConfigurationsFetcher: Fetcher<GetSkillConfigurationsResponseBody> =
    fetcher;

  const { data, error, isLoading } = useSWRWithDefaults(
    `/api/w/${workspaceId}/skills`,
    skillConfigurationsFetcher,
    { disabled }
  );

  return {
    skillConfigurations: data?.skillConfigurations ?? emptyArray(),
    isSkillConfigurationsError: !!error,
    isSkillConfigurationsLoading: isLoading,
  };
}

export function useSimilarSkills({ owner }: { owner: LightWorkspaceType }) {
  const getSimilarSkills = useCallback(
    async (naturalDescription: string, signal?: AbortSignal) => {
      try {
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
      } catch (e: unknown) {
        return new Err(normalizeError(e));
      }
    },
    [owner.sId]
  );

  return { getSimilarSkills };
}
