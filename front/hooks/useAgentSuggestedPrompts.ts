import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { AgentSuggestedPromptsResponseBody } from "@app/types/api/assistant/configuration/suggested_prompts";
import type { Fetcher } from "swr";

interface UseAgentSuggestedPromptsOptions {
  agentId: string | null;
  disabled?: boolean;
  keepPreviousData?: boolean;
  workspaceId: string;
}

export function useAgentSuggestedPrompts({
  agentId,
  disabled,
  keepPreviousData,
  workspaceId,
}: UseAgentSuggestedPromptsOptions) {
  const { fetcher } = useFetcher();
  const suggestedPromptsFetcher: Fetcher<AgentSuggestedPromptsResponseBody> =
    fetcher;

  const { data, error, isLoading, mutate } = useSWRWithDefaults(
    agentId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentId}/suggested_prompts`
      : null,
    suggestedPromptsFetcher,
    { disabled, keepPreviousData }
  );

  return {
    suggestedPrompts: data?.suggestedPrompts ?? emptyArray<string>(),
    isSuggestedPromptsError: !!error,
    isSuggestedPromptsLoading: isLoading && !disabled,
    mutateSuggestedPrompts: mutate,
  };
}
