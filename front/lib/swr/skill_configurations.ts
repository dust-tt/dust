import type { ImportFormValues } from "@app/components/skills/import/formSchema";
import { useDebounceWithAbort } from "@app/hooks/useDebounce";
import { useSendNotification } from "@app/hooks/useNotification";
import type { ImportSkillsResponseBody } from "@app/lib/api/skills/detection/github/import_skills";
import { useAppRouter } from "@app/lib/platform";
import type {
  DetectedSkillSummary,
  DetectSkillsResponseBody,
} from "@app/lib/skill_detection";
import { parseGitHubRepoUrl } from "@app/lib/skill_detection";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { getManageSkillsRoute } from "@app/lib/utils/router";
import type { GetSkillHistoryResponseBody } from "@app/types/api/assistant/skills/history";
import type {
  GetSkillResponseBody,
  GetSkillsResponseBody,
  GetSkillsWithRelationsResponseBody,
  GetSkillWithRelationsResponseBody,
  SearchSkillsResponseBody,
} from "@app/types/api/skills";
import type { GetSimilarSkillsResponseBody } from "@app/types/api/skills/existing_skill_checker";
import type {
  SkillAvailability,
  SkillReinforcementMode,
  SkillStatus,
  SkillType,
  SkillWithoutInstructionsAndToolsType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { isAPIErrorResponse } from "@app/types/error";
import { Ok } from "@app/types/shared/result";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useState } from "react";
import type { Fetcher, SWRConfiguration } from "swr";
import type { SWRMutationConfiguration } from "swr/mutation";
import useSWRMutation from "swr/mutation";

const DETECT_SKILLS_DEBOUNCE_MS = 1_000;
const SEARCH_SKILLS_DEBOUNCE_MS = 250;

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
  const { fetcher } = useFetcher();
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
  availability,
  bypassEditorVisibility,
  swrOptions,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
  status?: SkillStatus;
  globalSpaceOnly?: boolean;
  availability?: SkillAvailability | SkillAvailability[];
  // Admin-only: bypass the editor-visibility rule and also list unpublished
  // (editors-only) skills the caller does not edit.
  bypassEditorVisibility?: boolean;
  swrOptions?: SWRConfiguration;
}): {
  skills: GetSkillsResponseBody["skills"];
  isSkillsError: boolean;
  isSkillsLoading: boolean;
  mutateSkills: () => void;
} {
  const { fetcher } = useFetcher();

  const queryParams = new URLSearchParams();
  if (status) {
    queryParams.set("status", status);
  }
  if (globalSpaceOnly) {
    queryParams.set("globalSpaceOnly", "true");
  }
  if (availability) {
    const availabilities = Array.isArray(availability)
      ? availability
      : [availability];
    for (const value of availabilities) {
      queryParams.append("availability", value);
    }
  }
  if (bypassEditorVisibility) {
    queryParams.set("bypassEditorVisibility", "true");
  }
  const queryString = queryParams.toString();

  const skillsFetcher: Fetcher<GetSkillsResponseBody> = fetcher;
  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills${queryString ? `?${queryString}` : ""}`,
    skillsFetcher,
    { ...swrOptions, disabled }
  );

  return {
    skills:
      data?.skills ?? emptyArray<GetSkillsResponseBody["skills"][number]>(),
    isSkillsError: !!error,
    isSkillsLoading: isLoading,
    mutateSkills: mutate,
  };
}

export function useSearchSkills({
  owner,
  searchTerm,
  disabled,
  swrOptions,
}: {
  owner: LightWorkspaceType;
  searchTerm: string;
  disabled?: boolean;
  swrOptions?: SWRConfiguration;
}) {
  const { fetcher } = useFetcher();
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

  // The delayed value controls the external network request; search-result
  // filtering and ordering remain derived synchronously by the caller.
  useEffect(() => {
    const timeout = setTimeout(
      () => setDebouncedSearchTerm(searchTerm),
      SEARCH_SKILLS_DEBOUNCE_MS
    );
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  const queryParams = new URLSearchParams({
    query: debouncedSearchTerm.slice(0, 200),
  });
  const skillsFetcher: Fetcher<SearchSkillsResponseBody> = fetcher;
  const { data, error, isValidating } = useSWRWithDefaults(
    `/api/w/${owner.sId}/skills/search?${queryParams.toString()}`,
    skillsFetcher,
    {
      ...swrOptions,
      disabled,
      keepPreviousData: true,
    }
  );

  return {
    skills:
      data?.skills ?? emptyArray<SearchSkillsResponseBody["skills"][number]>(),
    isSkillsError: !!error,
    isSkillsLoading:
      searchTerm !== debouncedSearchTerm || (!error && (!data || isValidating)),
  };
}

export function useSkillsWithRelations({
  owner,
  disabled,
  status,
  onlyCustom,
  bypassEditorVisibility,
  withMessageCount,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
  status: SkillStatus;
  onlyCustom?: boolean;
  // Admin-only: bypass the editor-visibility rule and also list unpublished
  // (editors-only) skills the caller does not edit.
  bypassEditorVisibility?: boolean;
  withMessageCount?: boolean;
}) {
  const { fetcher } = useFetcher();
  const skillsFetcher: Fetcher<GetSkillsWithRelationsResponseBody> = fetcher;

  const queryParams = new URLSearchParams({
    withRelations: "true",
    status,
  });
  if (onlyCustom) {
    queryParams.set("onlyCustom", "true");
  }
  if (bypassEditorVisibility) {
    queryParams.set("bypassEditorVisibility", "true");
  }
  if (withMessageCount) {
    queryParams.set("withMessageCount", "true");
  }

  const { data, isLoading, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(
      `/api/w/${owner.sId}/skills?${queryParams.toString()}`,
      skillsFetcher,
      { disabled }
    );

  return {
    skillsWithRelations: data?.skills ?? emptyArray(),
    isSkillsWithRelationsLoading: isLoading,
    mutateSkillsWithRelations: mutate,
    mutateSkillsWithRelationsRegardlessOfQueryParams:
      mutateRegardlessOfQueryParams,
  };
}

export function useUpdateSkillsAvailability({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();

  const {
    mutateSkillsWithRelationsRegardlessOfQueryParams: mutateActiveSkills,
  } = useSkillsWithRelations({
    owner,
    status: "active",
    disabled: true,
  });

  const doUpdateAvailability = async (
    skillIds: string[],
    availability: SkillAvailability
  ): Promise<boolean> => {
    try {
      await fetcher(`/api/w/${owner.sId}/skills/availability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillIds, availability }),
      });

      void mutateActiveSkills();

      sendNotification({
        type: "success",
        title: "Skills updated",
        description: `Successfully updated ${skillIds.length} skill${pluralize(skillIds.length)}.`,
      });
      return true;
    } catch (err) {
      sendNotification({
        type: "error",
        title: "Error updating skills",
        description: `Error: ${isAPIErrorResponse(err) ? err.error.message : "An unexpected error occurred."}`,
      });
      return false;
    }
  };

  return doUpdateAvailability;
}

export function useSimilarSkills({ owner }: { owner: LightWorkspaceType }) {
  const { fetcher } = useFetcher();
  const getSimilarSkills = useCallback(
    async (
      naturalDescription: string,
      options: {
        excludeSkillId: string | null;
        // Restricts the skills to compare against. Defaults server-side to all published skills.
        availabilities?: SkillAvailability[];
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
            availabilities: options?.availabilities,
          }),
          signal: options?.signal,
        }
      );
      return new Ok(response.similar_skills);
    },
    [owner.sId, fetcher]
  );

  return { getSimilarSkills };
}

export function useArchiveSkill({
  owner,
  skill,
}: {
  owner: LightWorkspaceType;
  skill: SkillWithoutInstructionsAndToolsType;
}) {
  const { fetcher } = useFetcher();
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
      return false;
    }
    try {
      await fetcher(`/api/w/${owner.sId}/skills/${skill.sId}`, {
        method: "DELETE",
      });

      void mutateArchivedSkills();
      void mutateActiveSkills();
      void mutateSuggestedSkills();

      sendNotification({
        type: "success",
        title: `Successfully archived ${skill.name}`,
        description: `${skill.name} was successfully archived.`,
      });
      return true;
    } catch (err) {
      sendNotification({
        type: "error",
        title: `Error archiving ${skill.name}`,
        description: `Error: ${isAPIErrorResponse(err) ? err.error.message : "An unexpected error occurred."}`,
      });
      return false;
    }
  };

  return doArchive;
}

export function useBatchArchiveSkills({
  owner,
  skillIds,
}: {
  owner: LightWorkspaceType;
  skillIds: string[];
}) {
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const {
    mutateSkillsWithRelationsRegardlessOfQueryParams: mutateSkillsWithRelations,
  } = useSkillsWithRelations({
    owner,
    status: "active",
    disabled: true,
  });

  const doArchive = async () => {
    if (skillIds.length === 0) {
      return false;
    }

    try {
      await fetcher(`/api/w/${owner.sId}/skills/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillIds }),
      });

      void mutateSkillsWithRelations();

      sendNotification({
        type: "success",
        title: "Successfully archived skills",
        description: `${skillIds.length} skill${pluralize(skillIds.length)} ${skillIds.length === 1 ? "was" : "were"} successfully archived.`,
      });
      return true;
    } catch (err) {
      sendNotification({
        type: "error",
        title: "Error archiving skills",
        description: `Error: ${isAPIErrorResponse(err) ? err.error.message : "An unexpected error occurred."}`,
      });
      return false;
    }
  };

  return doArchive;
}

export function useUpdateSkillFavorite({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const router = useAppRouter();

  const { mutateSkills: mutateActiveSkills } = useSkills({
    owner,
    status: "active",
    disabled: true,
  });
  const { mutateSkillsWithRelations: mutateActiveSkillsWithRelations } =
    useSkillsWithRelations({
      owner,
      status: "active",
      disabled: true,
    });

  const updateSkillFavorite = useCallback(
    async (
      skill: SkillWithoutInstructionsAndToolsType,
      isFavorite: boolean
    ) => {
      try {
        await fetcher(`/api/w/${owner.sId}/skills/${skill.sId}/favorite`, {
          method: isFavorite ? "POST" : "DELETE",
        });

        void mutateActiveSkills();
        void mutateActiveSkillsWithRelations();

        if (isFavorite) {
          sendNotification({
            type: "success",
            title: "Added to favorites",
            description: skill.name,
            action: {
              label: "View",
              onClick: () => {
                void router
                  .push(
                    `${getManageSkillsRoute(owner.sId)}#?selectedTab=favorites`
                  )
                  .then(() =>
                    window.dispatchEvent(new HashChangeEvent("hashchange"))
                  );
              },
            },
          });
        }
        return true;
      } catch (err) {
        sendNotification({
          type: "error",
          title: `Failed to ${isFavorite ? "favorite" : "unfavorite"} ${skill.name}`,
          description: isAPIErrorResponse(err)
            ? err.error.message
            : "An unexpected error occurred.",
        });
        return false;
      }
    },
    [
      fetcher,
      mutateActiveSkills,
      mutateActiveSkillsWithRelations,
      owner.sId,
      router,
      sendNotification,
    ]
  );

  return { updateSkillFavorite };
}

type SkillReinforcementUpdate = {
  reinforcement?: SkillReinforcementMode;
  selfImprovementLock?: boolean;
  selfImprovementCostsCapMicroUsd?: number | null;
  selfImprovementCostsCapAwuCredits?: number | null;
};

export function useUpdateSkillReinforcement({
  owner,
  onlyCustom,
}: {
  owner: LightWorkspaceType;
  onlyCustom?: boolean;
}) {
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();

  const { mutateSkillsWithRelations: mutateActiveSkills } =
    useSkillsWithRelations({
      owner,
      status: "active",
      onlyCustom,
      disabled: true,
    });

  const updateSkillReinforcement = useCallback(
    async (skillId: string, update: SkillReinforcementUpdate) => {
      try {
        await fetcher(`/api/w/${owner.sId}/skills/${skillId}/reinforcement`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        void mutateActiveSkills();
        return true;
      } catch (err) {
        sendNotification({
          type: "error",
          title: "Failed to update reinforcement settings",
          description: isAPIErrorResponse(err)
            ? err.error.message
            : "An unexpected error occurred.",
        });
        return false;
      }
    },
    [owner.sId, fetcher, mutateActiveSkills, sendNotification]
  );

  return { updateSkillReinforcement };
}

export function useRestoreSkill({
  owner,
  skill,
}: {
  owner: LightWorkspaceType;
  skill: SkillWithoutInstructionsAndToolsType;
}) {
  const { fetcher } = useFetcher();
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
      return false;
    }
    try {
      await fetcher(`/api/w/${owner.sId}/skills/${skill.sId}/restore`, {
        method: "POST",
      });

      void mutateArchivedSkills();
      void mutateActiveSkills();

      sendNotification({
        type: "success",
        title: `Successfully restored ${skill.name}`,
        description: `${skill.name} was successfully restored.`,
      });
      return true;
    } catch (err) {
      sendNotification({
        type: "error",
        title: `Error restoring ${skill.name}`,
        description: `Error: ${isAPIErrorResponse(err) ? err.error.message : "An unexpected error occurred."}`,
      });
      return false;
    }
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
  const { fetcher } = useFetcher();
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
  const { fetcher } = useFetcher();
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

export function useDetectSkillsFromRepo({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();

  const [detectedSkills, setDetectedSkills] = useState<DetectedSkillSummary[]>(
    []
  );
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [repositoryNotFound, setRepositoryNotFound] = useState<boolean>(false);

  const triggerDetect = useDebounceWithAbort(
    useCallback(
      async (repoUrl: string, signal: AbortSignal) => {
        if (!repoUrl || parseGitHubRepoUrl(repoUrl).isErr()) {
          setDetectedSkills([]);
          setDetectError(null);
          setRepositoryNotFound(false);
          setIsDetecting(false);
          return;
        }

        setIsDetecting(true);
        setDetectError(null);
        setRepositoryNotFound(false);

        try {
          const response: DetectSkillsResponseBody = await fetcher(
            `/api/w/${owner.sId}/skills/detect`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ repoUrl }),
              signal,
            }
          );

          setDetectedSkills(response.skills);
        } catch (err) {
          if (signal.aborted) {
            return;
          }
          setDetectedSkills([]);
          if (isAPIErrorResponse(err)) {
            setRepositoryNotFound(
              err.error.type === "skill_github_repository_not_found"
            );
            // Detect errors are errors we want to expose to consumers: repository not found is singled out above.
            setDetectError(
              err.error.type === "skill_github_repository_not_found"
                ? null
                : err.error.message
            );
          } else {
            setDetectError("Failed to detect skills from this repository.");
          }
        } finally {
          if (!signal.aborted) {
            setIsDetecting(false);
          }
        }
      },
      [owner.sId, fetcher]
    ),
    { delayMs: DETECT_SKILLS_DEBOUNCE_MS }
  );

  return {
    isDetecting,
    detectError: isDetecting ? null : detectError,
    repositoryNotFound: !isDetecting && repositoryNotFound,
    detectedSkills: isDetecting || detectError ? [] : detectedSkills,
    triggerDetect,
  };
}

function notifyImportResult(
  data: ImportSkillsResponseBody,
  sendNotification: ReturnType<typeof useSendNotification>
): {
  successCount: number;
  skipped: string[];
} {
  const importedCount = data.imported.length;
  const updatedCount = data.updated.length;
  const successCount = importedCount + updatedCount;
  const skipped = data.skipped.map((e) => e.message);

  if (successCount > 0) {
    const parts: string[] = [];
    if (importedCount > 0) {
      parts.push(`${importedCount} skill${pluralize(importedCount)} imported`);
    }
    if (updatedCount > 0) {
      parts.push(`${updatedCount} skill${pluralize(updatedCount)} updated`);
    }
    if (skipped.length > 0) {
      parts.push(`${skipped.length} skill${pluralize(skipped.length)} skipped`);
    }
    sendNotification({
      type: "success",
      title: "Import successful",
      description: parts.join(", ") + ".",
    });
  } else {
    sendNotification({
      type: "error",
      title: "Import failed",
      description: skipped[0] ?? "Failed to import skills.",
    });
  }

  return { successCount, skipped };
}

export function useImportSkills({ owner }: { owner: LightWorkspaceType }) {
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();

  const [isImporting, setIsImporting] = useState(false);
  const { mutateSkillsWithRelations: mutateActiveSkills } =
    useSkillsWithRelations({
      owner,
      status: "active",
      disabled: true,
    });

  const importSkills = useCallback(
    async (formData: ImportFormValues, files: File[]) => {
      setIsImporting(true);
      try {
        let data: ImportSkillsResponseBody;
        switch (formData.importType) {
          case "repository": {
            data = await fetcher(`/api/w/${owner.sId}/skills/import`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                repoUrl: formData.repoUrl,
                names: formData.selectedSkillNames,
              }),
            });
            break;
          }
          case "files": {
            const body = new FormData();
            for (const file of files) {
              body.append("files", file);
            }
            for (const name of formData.selectedSkillNames) {
              body.append("names", name);
            }
            data = await fetcher(`/api/w/${owner.sId}/skills/import/upload`, {
              method: "POST",
              body,
            });
            break;
          }
        }

        void mutateActiveSkills();

        return notifyImportResult(data, sendNotification);
      } catch (err) {
        const message = isAPIErrorResponse(err)
          ? err.error.message
          : "Failed to import skills.";
        sendNotification({
          type: "error",
          title: "Import failed",
          description: message,
        });
        return { successCount: 0, errors: [message] };
      } finally {
        setIsImporting(false);
      }
    },
    [owner.sId, mutateActiveSkills, sendNotification, fetcher]
  );

  return { importSkills, isImporting };
}

export function useDetectSkillsFromFiles({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();

  const [detectedSkills, setDetectedSkills] = useState<DetectedSkillSummary[]>(
    []
  );
  const [isUploading, setIsUploading] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  const triggerDetect = useCallback(
    async (files: File[]) => {
      setIsUploading(true);
      setDetectError(null);
      setDetectedSkills([]);

      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      try {
        const data: DetectSkillsResponseBody = await fetcher(
          `/api/w/${owner.sId}/skills/detect/upload`,
          {
            method: "POST",
            body: formData,
          }
        );
        setDetectedSkills(data.skills);
      } catch (err) {
        setDetectError(
          isAPIErrorResponse(err)
            ? err.error.message
            : "Failed to detect skills from the uploaded files."
        );
      } finally {
        setIsUploading(false);
      }
    },
    [owner.sId, fetcher]
  );

  return {
    detectedSkills,
    isUploading,
    detectError,
    triggerDetect,
  };
}
