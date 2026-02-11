import { useCallback } from "react";
import type { Fetcher } from "swr";
import type { SWRMutationConfiguration } from "swr/mutation";
import useSWRMutation from "swr/mutation";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetSkillsResponseBody,
  GetSkillsWithRelationsResponseBody,
} from "@app/pages/api/w/[wId]/skills";
import type {
  GetSkillResponseBody,
  GetSkillWithRelationsResponseBody,
} from "@app/pages/api/w/[wId]/skills/[sId]";
import type { GetSkillHistoryResponseBody } from "@app/pages/api/w/[wId]/skills/[sId]/history";
import type { GetSimilarSkillsResponseBody } from "@app/pages/api/w/[wId]/skills/similar";
import type {
  SkillStatus,
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

export function useSkill(options: {
  workspaceId: string;
  skillId: string | null;
  withRelations: true;
  disabled?: boolean;
}): {
  skill: SkillWithRelationsType | null;
  isSkillLoading: boolean;
  isSkillError: boolean;
  mutateSkill: () => void;
};
export function useSkill(options: {
  workspaceId: string;
  skillId: string | null;
  withRelations?: false;
  disabled?: boolean;
}): {
  skill: SkillType | null;
  isSkillLoading: boolean;
  isSkillError: boolean;
  mutateSkill: () => void;
};
export function useSkill({
  workspaceId,
  skillId,
  withRelations = false,
  disabled = false,
}: {
  workspaceId: string;
  skillId: string | null;
  withRelations?: boolean;
  disabled?: boolean;
}): {
  skill: SkillType | SkillWithRelationsType | null;
  isSkillLoading: boolean;
  isSkillError: boolean;
  mutateSkill: () => void;
} {
  const skillFetcher: Fetcher<
    GetSkillResponseBody | GetSkillWithRelationsResponseBody
  > = fetcher;

  const url = skillId
    ? `/api/w/${workspaceId}/skills/${skillId}${withRelations ? "?withRelations=true" : ""}`
    : null;

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    url,
    skillFetcher,
    { disabled }
  );

  return {
    skill: data?.skill ?? null,
    isSkillLoading: isLoading,
    isSkillError: !!error,
    mutateSkill: mutate,
  };
}

export function useSkills({
  owner,
  disabled,
  status,
  globalSpaceOnly,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
  status?: SkillStatus;
  globalSpaceOnly?: boolean;
}) {
  const skillsFetcher: Fetcher<GetSkillsResponseBody> = fetcher;

  const queryParams = new URLSearchParams();
  if (status) {
    queryParams.set("status", status);
  }
  if (globalSpaceOnly) {
    queryParams.set("globalSpaceOnly", "true");
  }
  const queryString = queryParams.toString();

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills${queryString ? `?${queryString}` : ""}`,
    skillsFetcher,
    { disabled }
  );

  return {
    skills: data?.skills ?? emptyArray(),
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
  const skillsFetcher: Fetcher<GetSkillsWithRelationsResponseBody> = fetcher;

  const { data, isLoading, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills?withRelations=true&status=${status}`,
    skillsFetcher,
    { disabled }
  );

  return {
    skillsWithRelations: data?.skills ?? emptyArray(),
    isSkillsWithRelationsLoading: isLoading,
    mutateSkillsWithRelations: mutate,
  };
}

export function useSimilarSkills({ owner }: { owner: LightWorkspaceType }) {
  const getSimilarSkills = useCallback(
    async (
      naturalDescription: string,
      options: {
        excludeSkillId: string | null;
        signal?: AbortSignal;
      }
    ) => {
      const response: GetSimilarSkillsResponseBody = await fetcher(
        `/api/w/${owner.sId}/skills/similar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            naturalDescription,
            excludeSkillId: options?.excludeSkillId ?? undefined,
          }),
          signal: options?.signal,
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
  const { mutateSkillsWithRelations: mutateSuggestedSkills } =
    useSkillsWithRelations({
      owner,
      status: "suggested",
      disabled: true,
    });

  const doArchive = async () => {
    if (!skill.sId) {
      return;
    }
    const res = await clientFetch(`/api/w/${owner.sId}/skills/${skill.sId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      void mutateArchivedSkills();
      void mutateActiveSkills();
      void mutateSuggestedSkills();

      sendNotification({
        type: "success",
        title: `Successfully archived ${skill.name}`,
        description: `${skill.name} was successfully archived.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Error archiving ${skill.name}`,
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
  skill,
  limit,
  disabled,
}: {
  owner: LightWorkspaceType;
  skill?: SkillType;
  limit?: number;
  disabled?: boolean;
}) {
  const skillHistoryFetcher: Fetcher<GetSkillHistoryResponseBody> = fetcher;

  const queryParams = limit ? `?limit=${limit}` : "";
  const { data, error, mutate } = useSWRWithDefaults(
    skill
      ? `/api/w/${owner.sId}/skills/${skill.sId}/history${queryParams}`
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

export function useSkillWithRelations(
  owner: LightWorkspaceType,
  options?: SWRMutationConfiguration<
    GetSkillWithRelationsResponseBody,
    Error,
    string,
    string
  >
) {
  const { trigger, isMutating } = useSWRMutation(
    `/api/w/${owner.sId}/skills`,
    async (url: string, { arg }: { arg: string }) => {
      return fetcher(`${url}/${arg}?withRelations=true`);
    },
    options
  );

  return {
    fetchSkillWithRelations: trigger,
    isLoading: isMutating,
  };
}
