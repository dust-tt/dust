import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { useIsSelfImprovementAvailable } from "@app/lib/client/self_improvement";
import { getBrowserMarkdownPipeline } from "@app/lib/editor/browser_markdown_pipeline";
import { previewSkillSuggestions } from "@app/lib/editor/preview_skill_suggestions";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type {
  GetSkillSuggestionsQuery,
  GetSkillSuggestionsResponseBody,
  PatchSkillSuggestionRequestBody,
  PatchSkillSuggestionResponseBody,
} from "@app/types/api/assistant/skills/suggestions";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

export function useAreSkillSuggestionsEnabled(): boolean {
  const isSelfImprovementAvailable = useIsSelfImprovementAvailable();
  const isMobile = useIsMobile();

  return isSelfImprovementAvailable && !isMobile;
}

interface UseSkillSuggestionsParams {
  skillId: string | null;
  disabled?: boolean;
  kind?: GetSkillSuggestionsQuery["kind"];
  states?: GetSkillSuggestionsQuery["states"];
  limit?: number;
  workspaceId: string;
}

export function useSkillSuggestions({
  skillId,
  disabled,
  kind,
  states,
  limit,
  workspaceId,
}: UseSkillSuggestionsParams) {
  const { fetcher } = useFetcher();
  const suggestionsFetcher: Fetcher<GetSkillSuggestionsResponseBody> = fetcher;

  const urlParams = new URLSearchParams();
  if (states) {
    states.forEach((s) => urlParams.append("states", s));
  }
  if (kind) {
    urlParams.append("kind", kind);
  }
  if (limit !== undefined) {
    urlParams.append("limit", limit.toString());
  }

  const queryString = urlParams.toString();

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    skillId
      ? `/api/w/${workspaceId}/assistant/skills/${skillId}/suggestions?${queryString}`
      : null,
    suggestionsFetcher,
    { disabled }
  );

  return {
    suggestions: data?.suggestions ?? emptyArray(),
    referencedSkills: data?.referencedSkills ?? emptyArray(),
    isSuggestionsLoading: !error && !data && !disabled,
    isSuggestionsError: !!error,
    isSuggestionsValidating: isValidating,
    mutateSuggestions: mutate,
  };
}

interface UseSkillSuggestionsPreviewParams {
  skill: SkillType | null;
  suggestions: SkillSuggestionType[];
}

export function useSkillSuggestionsPreview({
  skill,
  suggestions,
}: UseSkillSuggestionsPreviewParams) {
  const preview = useMemo(() => {
    if (!skill || suggestions.length === 0) {
      return null;
    }

    const previewRes = previewSkillSuggestions({
      skill,
      suggestions,
      pipeline: getBrowserMarkdownPipeline(),
    });

    return previewRes.isOk() ? previewRes.value : null;
  }, [skill, suggestions]);

  return { preview };
}

interface UsePatchSkillSuggestionsParams {
  skillId: string | null;
  workspaceId: string;
}

export function usePatchSkillSuggestions({
  skillId,
  workspaceId,
}: UsePatchSkillSuggestionsParams) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const patchSuggestions = useCallback(
    async (
      suggestionIds: string[],
      state: PatchSkillSuggestionRequestBody["state"]
    ): Promise<PatchSkillSuggestionResponseBody | null> => {
      if (!skillId || suggestionIds.length === 0) {
        return null;
      }

      try {
        const res = await clientFetch(
          `/api/w/${workspaceId}/assistant/skills/${skillId}/suggestions`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              suggestionIds,
              state,
            } satisfies PatchSkillSuggestionRequestBody),
          }
        );

        if (!res.ok) {
          const errorData = await getErrorFromResponse(res);
          sendApiErrorNotification({
            title: t`Failed to update skill suggestion`,
            error: errorData,
          });
          return null;
        }

        const data = await res.json();
        return data;
      } catch {
        sendNotification({
          type: "error",
          title: t`Failed to update skill suggestion`,
        });
        return null;
      }
    },
    [skillId, sendApiErrorNotification, sendNotification, t, workspaceId]
  );

  return { patchSuggestions };
}
