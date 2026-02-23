import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetPokeSkillsResponseBody } from "@app/pages/api/poke/workspaces/[wId]/skills";
import type { PostSkillSuggestionBodyType } from "@app/pages/api/poke/workspaces/[wId]/skills/suggestions";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
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

  const createSkillSuggestion = async (
    body: PostSkillSuggestionBodyType
  ): Promise<boolean> => {
    const response = await clientFetch(
      `/api/poke/workspaces/${owner.sId}/skills/suggestions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorData = await getErrorFromResponse(response);
      sendNotification({
        type: "error",
        title: "Failed to create skill suggestion",
        description: errorData.message,
      });
      return false;
    }

    sendNotification({
      type: "success",
      title: "Skill suggestion created",
      description: `"${body.name}" has been created.`,
    });
    void mutate();
    onSuccess?.();
    return true;
  };

  return { createSkillSuggestion };
}
