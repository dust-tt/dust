import type { ImportFormValues } from "@app/components/skills/import/formSchema";
import { useDebounce, useDebounceWithAbort } from "@app/hooks/useDebounce";
import { useFormatErrorDescription } from "@app/hooks/useFormatErrorDescription";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { useAppRouter } from "@app/lib/platform";
import type {
  DetectedSkillSummary,
  DetectSkillsResponseBody,
} from "@app/lib/skill_detection";
import { parseGitHubRepoUrl } from "@app/lib/skill_detection";
import {
  emptyArray,
  useFetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import { getManageSkillsRoute } from "@app/lib/utils/router";
import type { GetSkillHistoryResponseBody } from "@app/types/api/assistant/skills/history";
import type { SearchType } from "@app/types/api/search";
import { MIN_NAME_SEARCH_QUERY_LENGTH } from "@app/types/api/search";
import type {
  GetSkillResponseBody,
  GetSkillWithRelationsResponseBody,
  SearchSkillsResponseBody,
  SkillSearchFacet,
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
  SkillSearchSelectionMode,
  SkillSearchSort,
  SkillSearchSortOrder,
} from "@app/types/api/skills";
import type { ImportSkillsResponseBody } from "@app/types/api/skills/detection/github/import_skills";
import type { GetSimilarSkillsResponseBody } from "@app/types/api/skills/existing_skill_checker";
import type {
  SkillAvailability,
  SkillListItemType,
  SkillReinforcementMode,
  SkillType,
  SkillWithoutInstructionsAndToolsType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { isAPIErrorResponse } from "@app/types/error";
import { Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

const DETECT_SKILLS_DEBOUNCE_MS = 1_000;
const SEARCH_SKILLS_DEBOUNCE_MS = 250;
const SEARCH_SKILLS_QUERY_MAX_LENGTH = 200;

export function useSkill(options: {
  workspaceId: string;
  skillId: string | null;
  withRelations: true;
  disabled?: boolean;
  shouldRetryOnError?: boolean;
}): {
  skill: SkillWithRelationsType | null;
  isSkillLoading: boolean;
  isSkillError: boolean;
  isSkillNotFound: boolean;
  mutateSkill: () => Promise<GetSkillWithRelationsResponseBody | undefined>;
  // Also refreshes the other variants of the skill fetch (with/without relations).
  mutateSkillRegardlessOfQueryParams: () => void;
};
export function useSkill(options: {
  workspaceId: string;
  skillId: string | null;
  withRelations?: false;
  disabled?: boolean;
  shouldRetryOnError?: boolean;
}): {
  skill: SkillType | null;
  isSkillLoading: boolean;
  isSkillError: boolean;
  isSkillNotFound: boolean;
  mutateSkill: () => Promise<GetSkillResponseBody | undefined>;
  // Also refreshes the other variants of the skill fetch (with/without relations).
  mutateSkillRegardlessOfQueryParams: () => void;
};
export function useSkill({
  workspaceId,
  skillId,
  withRelations = false,
  disabled = false,
  shouldRetryOnError = true,
}: {
  workspaceId: string;
  skillId: string | null;
  withRelations?: boolean;
  disabled?: boolean;
  // Off for fetches where a failure is a normal outcome (deep links to missing skills).
  shouldRetryOnError?: boolean;
}): {
  skill: SkillType | SkillWithRelationsType | null;
  isSkillLoading: boolean;
  isSkillError: boolean;
  isSkillNotFound: boolean;
  mutateSkill: () => Promise<
    GetSkillResponseBody | GetSkillWithRelationsResponseBody | undefined
  >;
  // Also refreshes the other variants of the skill fetch (with/without relations).
  mutateSkillRegardlessOfQueryParams: () => void;
} {
  const { fetcher } = useFetcher();
  const skillFetcher: Fetcher<
    GetSkillResponseBody | GetSkillWithRelationsResponseBody
  > = fetcher;

  const url = skillId
    ? `/api/w/${workspaceId}/skills/${skillId}${withRelations ? "?withRelations=true" : ""}`
    : null;

  const { data, error, isLoading, mutate, mutateRegardlessOfQueryParams } =
    useSWRWithDefaults(url, skillFetcher, {
      disabled,
      shouldRetryOnError,
    });

  return {
    skill: data?.skill ?? null,
    isSkillLoading: isLoading,
    isSkillError: !!error,
    isSkillNotFound:
      isAPIErrorResponse(error) && error.error.type === "skill_not_found",
    mutateSkill: mutate,
    mutateSkillRegardlessOfQueryParams: mutateRegardlessOfQueryParams,
  };
}

/**
 * @cc [owner:aubin-tchoi,label:product] management-search-minimum-length
 * Name search sends an empty query below MIN_NAME_SEARCH_QUERY_LENGTH trimmed
 * characters. Autocomplete keeps accepting shorter input.
 */
export function useSearchSkills({
  owner,
  searchEndpoint,
  searchTerm,
  searchType = "autocomplete",
  offset,
  limit,
  sortBy,
  sortOrder,
  selectionMode,
  excludeSkillId,
  permissionFiltering,
  filters,
  facets,
  disabled,
  keepPreviousData = true,
  debounceMs = SEARCH_SKILLS_DEBOUNCE_MS,
}: {
  owner: LightWorkspaceType;
  searchEndpoint?: string;
  searchTerm: string;
  searchType?: SearchType;
  offset?: number;
  limit?: number;
  sortBy?: SkillSearchSort;
  sortOrder?: SkillSearchSortOrder;
  selectionMode?: SkillSearchSelectionMode;
  excludeSkillId?: string | null;
  permissionFiltering?: SkillSearchPermissionFiltering;
  filters?: SkillSearchFilters;
  facets?: SkillSearchFacet[];
  disabled?: boolean;
  /** When false, clear results while the next query loads (e.g. command palette). */
  keepPreviousData?: boolean;
  /** Set to 0 when the caller already debounces the search term. */
  debounceMs?: number;
}) {
  const { fetcherWithBody } = useFetcher();
  const { mutate: globalMutate } = useSWRConfig();
  const truncatedSearchTerm = searchTerm.slice(
    0,
    SEARCH_SKILLS_QUERY_MAX_LENGTH
  );
  const query =
    searchType === "name" &&
    truncatedSearchTerm.trim().length < MIN_NAME_SEARCH_QUERY_LENGTH
      ? ""
      : truncatedSearchTerm;
  const { debouncedValue: debouncedSearchTerm, setValue: setSearchTerm } =
    useDebounce(query, { delay: debounceMs });
  const isDebouncing = query !== debouncedSearchTerm;

  useEffect(() => {
    setSearchTerm(query);
  }, [query, setSearchTerm]);

  const url = searchEndpoint ?? `/api/w/${owner.sId}/skills/search`;
  const body = {
    ...filters,
    query: debouncedSearchTerm,
    searchType,
    offset,
    limit,
    sortBy,
    sortOrder,
    selectionMode,
    excludeSkillId: excludeSkillId ?? undefined,
    permissionFiltering,
    facets,
  };
  const skillsFetcher = async () => {
    const response: SearchSkillsResponseBody = await fetcherWithBody([
      url,
      body,
      "POST",
    ]);
    return { ...response, searchTerm: debouncedSearchTerm };
  };

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    [url, body],
    skillsFetcher,
    {
      disabled: disabled || isDebouncing,
      // Keep results visible while the next query debounces or loads, instead of
      // flashing a loading placeholder on every keystroke.
      keepPreviousData,
    }
  );

  // Search filters and offsets are in the body, so refresh every search key for this workspace.
  const mutateRegardlessOfQueryParams = useCallback(
    () => globalMutate((key) => Array.isArray(key) && key[0] === url),
    [globalMutate, url]
  );

  return {
    skills:
      (disabled ? undefined : data?.skills) ?? emptyArray<SkillListItemType>(),
    resolvedSearchTerm: disabled ? null : (data?.searchTerm ?? null),
    total: data?.total ?? 0,
    hasMore: data?.hasMore ?? false,
    isFavoritesOnly: data?.isFavoritesOnly ?? false,
    facets: data?.facets,
    isSkillsError: !!error,
    isSkillsLoading: !disabled && (isDebouncing || isLoading),
    mutate,
    mutateRegardlessOfQueryParams,
  };
}

/**
 * @cc [owner:aubin-tchoi,label:react] skill-search-infinite-pages
 * Pages accumulate for one query only. A new query starts at offset zero, and
 * pagination must not advance while disabled, loading, or showing a previous query.
 */
export function useSearchSkillsInfinite({
  owner,
  searchTerm,
  limit,
  selectionMode,
  disabled,
}: {
  owner: LightWorkspaceType;
  searchTerm: string;
  limit: number;
  selectionMode?: SkillSearchSelectionMode;
  disabled?: boolean;
}) {
  const { fetcherWithBody } = useFetcher();
  const query = searchTerm.slice(0, SEARCH_SKILLS_QUERY_MAX_LENGTH);
  const { debouncedValue: debouncedSearchTerm, setValue: setSearchTerm } =
    useDebounce(query, { delay: SEARCH_SKILLS_DEBOUNCE_MS });
  const isDebouncing = query !== debouncedSearchTerm;

  useEffect(() => {
    setSearchTerm(query);
  }, [query, setSearchTerm]);

  const { data, error, size, setSize, isLoading, isValidating } =
    useSWRInfiniteWithDefaults(
      (pageIndex: number, previousPage: SearchSkillsResponseBody | null) => {
        if (previousPage && !previousPage.hasMore) {
          return null;
        }

        return [
          `/api/w/${owner.sId}/skills/search`,
          {
            query: debouncedSearchTerm,
            offset: pageIndex * limit,
            limit,
            selectionMode,
          },
        ] as const;
      },
      async ([url, body]) => {
        const response: SearchSkillsResponseBody = await fetcherWithBody([
          url,
          body,
          "POST",
        ]);
        return { ...response, searchTerm: body.query };
      },
      {
        disabled: disabled || isDebouncing,
        revalidateFirstPage: false,
        // Keep the current list visible while the next query debounces or loads.
        keepPreviousData: true,
      }
    );

  const hasMore = data?.at(-1)?.hasMore ?? false;
  const isSkillsLoading =
    !disabled &&
    (isDebouncing ||
      isLoading ||
      isValidating ||
      (!error && size > (data?.length ?? 0)));
  const loadMore = useCallback(() => {
    if (
      !disabled &&
      !isSkillsLoading &&
      !error &&
      hasMore &&
      data?.[0]?.searchTerm === query
    ) {
      void setSize(size + 1);
    }
  }, [disabled, isSkillsLoading, error, hasMore, data, query, setSize, size]);

  return {
    skills:
      (disabled ? undefined : data?.flatMap((page) => page.skills)) ??
      emptyArray<SkillListItemType>(),
    resolvedSearchTerm: disabled ? null : (data?.[0]?.searchTerm ?? null),
    isFavoritesOnly: data?.[0]?.isFavoritesOnly ?? false,
    isSkillsError: !!error,
    isSkillsLoading,
    hasMore,
    loadMore,
  };
}

/**
 * @cc [owner:aubin-tchoi,label:react] invalidate-workspace-skill-lists
 * Revalidate string-keyed skill lists and array-keyed skill searches for the
 * given workspace, regardless of query parameters or search body, plus its
 * reinforcement settings.
 * Do not revalidate other workspaces or individual skill detail endpoints.
 */
export function useInvalidateSkills({ workspaceId }: { workspaceId: string }) {
  const { mutate } = useSWRConfig();
  const skillsUrl = `/api/w/${workspaceId}/skills`;
  const searchUrl = `${skillsUrl}/search`;

  return useCallback(
    () =>
      mutate((key) =>
        isString(key)
          ? key.split("?")[0] === skillsUrl ||
            key === `${skillsUrl}/reinforcement_settings`
          : Array.isArray(key) && key[0] === searchUrl
      ),
    [mutate, skillsUrl, searchUrl]
  );
}

export function useUpdateSkillsAvailability({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const invalidateSkills = useInvalidateSkills({ workspaceId: owner.sId });

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

      void invalidateSkills();

      const skillCount = skillIds.length;
      sendNotification({
        type: "success",
        title: t`Skills updated`,
        description: t`${plural(skillCount, {
          one: "Successfully updated # skill.",
          other: "Successfully updated # skills.",
        })}`,
      });
      return true;
    } catch (err) {
      sendApiErrorNotification({ title: t`Error updating skills`, error: err });
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
      return new Ok(response.skills);
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const invalidateSkills = useInvalidateSkills({ workspaceId: owner.sId });

  const doArchive = async () => {
    if (!skill.sId) {
      return false;
    }
    const skillName = skill.name;
    try {
      await fetcher(`/api/w/${owner.sId}/skills/${skill.sId}`, {
        method: "DELETE",
      });

      void invalidateSkills();

      sendNotification({
        type: "success",
        title: t`Successfully archived ${skillName}`,
        description: t`${skillName} was successfully archived.`,
      });
      return true;
    } catch (err) {
      sendApiErrorNotification({
        title: t`Error archiving ${skillName}`,
        error: err,
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const invalidateSkills = useInvalidateSkills({ workspaceId: owner.sId });

  const doArchive = async () => {
    if (skillIds.length === 0) {
      return false;
    }
    const skillCount = skillIds.length;

    try {
      await fetcher(`/api/w/${owner.sId}/skills/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillIds }),
      });

      void invalidateSkills();

      sendNotification({
        type: "success",
        title: t`Successfully archived skills`,
        description: t`${plural(skillCount, {
          one: "# skill was successfully archived.",
          other: "# skills were successfully archived.",
        })}`,
      });
      return true;
    } catch (err) {
      sendApiErrorNotification({
        title: t`Error archiving skills`,
        error: err,
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const invalidateSkills = useInvalidateSkills({ workspaceId: owner.sId });
  const router = useAppRouter();

  const updateSkillFavorite = useCallback(
    async (
      skill: Pick<SkillWithoutInstructionsAndToolsType, "sId" | "name">,
      isFavorite: boolean
    ) => {
      try {
        await fetcher(`/api/w/${owner.sId}/skills/${skill.sId}/favorite`, {
          method: isFavorite ? "POST" : "DELETE",
        });

        void invalidateSkills();

        if (isFavorite) {
          sendNotification({
            type: "success",
            title: t`Added to favorites`,
            description: skill.name,
            action: {
              label: t`View`,
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
        const skillName = skill.name;
        sendApiErrorNotification({
          title: isFavorite
            ? t`Failed to add ${skillName} to favorites`
            : t`Failed to remove ${skillName} from favorites`,
          error: err,
        });
        return false;
      }
    },
    [
      fetcher,
      invalidateSkills,
      owner.sId,
      router,
      sendNotification,
      sendApiErrorNotification,
      t,
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

/**
 * @cc [owner:aubin-tchoi,label:react] reinforcement-settings-invalidation
 * Successful reinforcement updates revalidate only the workspace's settings
 * list. Search results do not contain reinforcement settings.
 */
export function useUpdateSkillReinforcement({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { fetcher } = useFetcher();
  const { mutate } = useSWRConfig();

  const updateSkillReinforcement = useCallback(
    async (skillId: string, update: SkillReinforcementUpdate) => {
      try {
        await fetcher(`/api/w/${owner.sId}/skills/${skillId}/reinforcement`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        void mutate(`/api/w/${owner.sId}/skills/reinforcement_settings`);
        return true;
      } catch (err) {
        sendApiErrorNotification({
          title: t`Failed to update reinforcement settings`,
          error: err,
        });
        return false;
      }
    },
    [owner.sId, fetcher, mutate, sendApiErrorNotification, t]
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const invalidateSkills = useInvalidateSkills({ workspaceId: owner.sId });

  const doRestore = async () => {
    if (!skill.sId) {
      return false;
    }
    const skillName = skill.name;
    try {
      await fetcher(`/api/w/${owner.sId}/skills/${skill.sId}/restore`, {
        method: "POST",
      });

      void invalidateSkills();

      sendNotification({
        type: "success",
        title: t`Successfully restored ${skillName}`,
        description: t`${skillName} was successfully restored.`,
      });
      return true;
    } catch (err) {
      sendApiErrorNotification({
        title: t`Error restoring ${skillName}`,
        error: err,
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

export function useDetectSkillsFromRepo({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const formatErrorDescription = useFormatErrorDescription();
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
          const repositoryNotFound =
            isAPIErrorResponse(err) &&
            err.error.type === "skill_github_repository_not_found";
          setRepositoryNotFound(repositoryNotFound);
          // Detect errors are errors we want to expose to consumers: repository not found is singled out above.
          setDetectError(
            repositoryNotFound ? null : formatErrorDescription(err)
          );
        } finally {
          if (!signal.aborted) {
            setIsDetecting(false);
          }
        }
      },
      [owner.sId, fetcher, formatErrorDescription]
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
  sendNotification: ReturnType<typeof useSendNotification>,
  t: (descriptor: MessageDescriptor) => string
): {
  successCount: number;
  skipped: string[];
} {
  const importedCount = data.imported.length;
  const updatedCount = data.updated.length;
  const successCount = importedCount + updatedCount;
  const skipped = data.skipped.map((e) => e.message);

  if (successCount > 0) {
    const skippedCount = skipped.length;
    const sentences: string[] = [];
    if (importedCount > 0) {
      sentences.push(
        t(
          msg`${plural(importedCount, {
            one: "# skill imported.",
            other: "# skills imported.",
          })}`
        )
      );
    }
    if (updatedCount > 0) {
      sentences.push(
        t(
          msg`${plural(updatedCount, {
            one: "# skill updated.",
            other: "# skills updated.",
          })}`
        )
      );
    }
    if (skippedCount > 0) {
      sentences.push(
        t(
          msg`${plural(skippedCount, {
            one: "# skill skipped.",
            other: "# skills skipped.",
          })}`
        )
      );
    }
    sendNotification({
      type: "success",
      title: t(msg`Import successful`),
      description: sentences.join(" "),
    });
  } else {
    sendNotification({
      type: "error",
      title: t(msg`Import failed`),
      description: t(msg`Failed to import skills.`),
      details: skipped.length > 0 ? skipped.join("\n") : undefined,
    });
  }

  return { successCount, skipped };
}

export function useImportSkills({ owner }: { owner: LightWorkspaceType }) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const invalidateSkills = useInvalidateSkills({ workspaceId: owner.sId });

  const [isImporting, setIsImporting] = useState(false);

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

        void invalidateSkills();

        return notifyImportResult(data, sendNotification, t);
      } catch (err) {
        sendApiErrorNotification({ title: t`Import failed`, error: err });
        return { successCount: 0, skipped: [] };
      } finally {
        setIsImporting(false);
      }
    },
    [
      owner.sId,
      sendNotification,
      fetcher,
      invalidateSkills,
      sendApiErrorNotification,
      t,
    ]
  );

  return { importSkills, isImporting };
}

export function useDetectSkillsFromFiles({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const formatErrorDescription = useFormatErrorDescription();
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
        setDetectError(formatErrorDescription(err));
      } finally {
        setIsUploading(false);
      }
    },
    [owner.sId, fetcher, formatErrorDescription]
  );

  return {
    detectedSkills,
    isUploading,
    detectError,
    triggerDetect,
  };
}
