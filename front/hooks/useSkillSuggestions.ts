import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetSkillSuggestionsQuery,
  GetSkillSuggestionsResponseBody,
  PatchSkillSuggestionRequestBody,
  PatchSkillSuggestionResponseBody,
} from "@app/pages/api/w/[wId]/assistant/skills/[sId]/suggestions";
import { useCallback } from "react";
import type { Fetcher } from "swr";

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
    isSuggestionsLoading: !error && !data && !disabled,
    isSuggestionsError: !!error,
    isSuggestionsValidating: isValidating,
    mutateSuggestions: mutate,
  };
}

interface UsePatchSkillSuggestionsParams {
  skillId: string | null;
  workspaceId: string;
}

export function usePatchSkillSuggestions({
  skillId,
  workspaceId,
}: UsePatchSkillSuggestionsParams) {
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
          sendNotification({
            type: "error",
            title: "Failed to update skill suggestion",
            description: errorData.message,
          });
          return null;
        }

        const data = await res.json();
        return data;
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to update skill suggestion",
        });
        return null;
      }
    },
    [skillId, sendNotification, workspaceId]
  );

  return { patchSuggestions };
}
