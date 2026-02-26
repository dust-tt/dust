import { useSendNotification } from "@app/hooks/useNotification";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeSkillsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/skills";
import type { PostSkillSuggestionBodyType } from "@app/pages/api/poke/workspaces/[wId]/skills/suggestions";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function usePokeSkills({ disabled, owner }: PokeConditionalFetchProps) {
  const { fetcher } = useFetcher();
  const skillsFetcher: Fetcher<GetPokeSkillsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/skills`,
    skillsFetcher,
    { disabled }
  );

  return {
    data: data?.skills ?? emptyArray(),
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}

export function useCreatePokeSkillSuggestion({
  owner,
  onSuccess,
}: {
  owner: LightWorkspaceType;
  onSuccess?: () => void;
}) {
  const sendNotification = useSendNotification();
  const { mutate } = usePokeSkills({ owner, disabled: true });

  const { fetcherWithBody } = useFetcher();

  const createSkillSuggestion = async (
    body: PostSkillSuggestionBodyType
  ): Promise<boolean> => {
    try {
      await fetcherWithBody([
        `/api/poke/workspaces/${owner.sId}/skills/suggestions`,
        body,
        "POST",
      ]);

      sendNotification({
        type: "success",
        title: "Skill suggestion created",
        description: `"${body.name}" has been created.`,
      });
      void mutate();
      onSuccess?.();
      return true;
    } catch (e) {
      if (isAPIErrorResponse(e)) {
        sendNotification({
          type: "error",
          title: "Failed to create skill suggestion",
          description: e.error.message,
        });
      } else {
        sendNotification({
          type: "error",
          title: "Failed to create skill suggestion",
          description: "An unexpected error occurred.",
        });
      }
      return false;
    }
  };

  return { createSkillSuggestion };
}
