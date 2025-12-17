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
import type {
  GetSkillConfigurationsResponseBody,
  GetSkillConfigurationsWithRelationsResponseBody,
  GetSkillWithRelationsResponseBody,
} from "@app/pages/api/w/[wId]/skills";
import type { GetSkillConfigurationsHistoryResponseBody } from "@app/pages/api/w/[wId]/skills/[sId]/history";
import type { GetSimilarSkillsResponseBody } from "@app/pages/api/w/[wId]/skills/similar";
import type { LightWorkspaceType } from "@app/types";
import { Ok } from "@app/types";
import type {
  SkillStatus,
  SkillType,
} from "@app/types/assistant/skill_configuration";

export function useSkills({
  owner,
  disabled,
  status,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
  status?: SkillStatus;
}) {
  const skillsFetcher: Fetcher<GetSkillConfigurationsResponseBody> = fetcher;

  const statusQueryParam = status ? `?status=${status}` : "";

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills${statusQueryParam}`,
    skillsFetcher,
    { disabled }
  );

  return {
    skills: data?.skillConfigurations ?? emptyArray(),
    isSkillsError: !!error,
    isSkillsLoading: isLoading,
    mutateSkills: mutate,
  };
}

export function useSkillsWithRelations({
  owner,
  disabled,
  status,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
  status: SkillStatus;
}) {
  const skillsFetcher: Fetcher<GetSkillConfigurationsWithRelationsResponseBody> =
    fetcher;

  const { data, isLoading, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills?withRelations=true&status=${status}`,
    skillsFetcher,
    { disabled }
  );

  return {
    skillsWithRelations: data?.skillConfigurations ?? emptyArray(),
    isSkillsWithRelationsLoading: isLoading,
    mutateSkillsWithRelations: mutate,
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

export function useArchiveSkill({
  owner,
  skillConfiguration,
}: {
  owner: LightWorkspaceType;
  skillConfiguration: SkillType;
}) {
  const sendNotification = useSendNotification();
  const { mutateSkillsWithRelations: mutateArchivedSkills } =
    useSkillsWithRelations({
      owner,
      status: "archived",
      disabled: true,
    });
  const { mutateSkillsWithRelations: mutateActiveSkills } =
    useSkillsWithRelations({
      owner,
      status: "active",
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
      void mutateArchivedSkills();
      void mutateActiveSkills();

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

export function useRestoreSkill({
  owner,
  skill,
}: {
  owner: LightWorkspaceType;
  skill: SkillType;
}) {
  const sendNotification = useSendNotification();
  const { mutateSkillsWithRelations: mutateArchivedSkills } =
    useSkillsWithRelations({
      owner,
      status: "archived",
      disabled: true,
    });
  const { mutateSkillsWithRelations: mutateActiveSkills } =
    useSkillsWithRelations({
      owner,
      status: "active",
      disabled: true,
    });

  const doRestore = async () => {
    if (!skill.sId) {
      return;
    }
    const res = await clientFetch(
      `/api/w/${owner.sId}/skills/${skill.sId}/restore`,
      {
        method: "POST",
      }
    );

    if (res.ok) {
      void mutateArchivedSkills();
      void mutateActiveSkills();

      sendNotification({
        type: "success",
        title: `Successfully restored ${skill.name}`,
        description: `${skill.name} was successfully restored.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error restoring ${skill.name}`,
        description: `Error: ${errorData.message}`,
      });
    }
    return res.ok;
  };

  return doRestore;
}

export function useSkillHistory({
  owner,
  skillConfiguration,
  limit,
  disabled,
}: {
  owner: LightWorkspaceType;
  skillConfiguration?: SkillType;
  limit?: number;
  disabled?: boolean;
}) {
  const skillHistoryFetcher: Fetcher<GetSkillConfigurationsHistoryResponseBody> =
    fetcher;

  const queryParams = limit ? `?limit=${limit}` : "";
  const { data, error, mutate } = useSWRWithDefaults(
    skillConfiguration
      ? `/api/w/${owner.sId}/skills/${skillConfiguration.sId}/history${queryParams}`
      : null,
    skillHistoryFetcher,
    { disabled }
  );

  return {
    skillHistory: data?.history,
    isSkillHistoryLoading: !error && !data && !disabled,
    isSkillHistoryError: error,
    mutateSkillHistory: mutate,
  };
}

export function useSkillWithRelations({
  owner,
  disabled,
  skillId,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
  skillId: string;
}) {
  const skillsFetcher: Fetcher<GetSkillWithRelationsResponseBody> = fetcher;

  const { data, isLoading } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills/${skillId}?withRelations=true`,
    skillsFetcher,
    { disabled }
  );

  return {
    skillWithRelations: data?.skill ?? null,
    isSkillWithRelationsLoading: isLoading,
  };
}
