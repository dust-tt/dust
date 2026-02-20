import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentMessageSkillsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages/[mId]/skills";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useAgentMessageSkills({
  owner,
  conversation,
  messageId,
  options,
}: {
  owner: LightWorkspaceType;
  conversation: ConversationWithoutContentType | null;
  messageId: string | null;
  options?: {
    disabled: boolean;
  };
}) {
  const { fetcher } = useFetcher();
  const skillsFetcher: Fetcher<GetAgentMessageSkillsResponseBody> = fetcher;

  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    conversation && messageId
      ? `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}/messages/${messageId}/skills`
      : null,
    skillsFetcher,
    options
  );

  return {
    skills: data?.skills ?? emptyArray(),
    isSkillsLoading: !options?.disabled && isLoading,
    isSkillsError: !!error,
    mutateSkills: mutate,
  };
}
