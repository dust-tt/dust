import type { LightWorkspaceType } from "@dust-tt/client";
import { useCallback } from "react";
import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetTriggersResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/triggers";
import type {
  PostTextAsCronRuleRequestBody,
  PostTextAsCronRuleResponseBody,
} from "@app/pages/api/w/[wId]/assistant/agent_configurations/text_as_cron_rule";

export function useAgentTriggers({
  workspaceId,
  agentConfigurationId,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  disabled?: boolean;
}) {
  const triggersFetcher: Fetcher<GetTriggersResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    agentConfigurationId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/triggers`
      : null,
    triggersFetcher,
    { disabled }
  );

  return {
    triggers: data?.triggers ?? emptyArray(),
    isTriggersLoading: !!agentConfigurationId && !error && !data && !disabled,
    isTriggersError: error,
    isTriggersValidating: isValidating,
    mutateTriggers: mutate,
  };
}

export function useTextAsCronRule({
  workspace,
}: {
  workspace: LightWorkspaceType;
}) {
  const textAsCronRule = useCallback(
    async (naturalDescription: string) => {
      const r: PostTextAsCronRuleResponseBody = await fetcher(
        `/api/w/${workspace.sId}/assistant/agent_configurations/text_as_cron_rule`,
        {
          method: "POST",
          body: JSON.stringify({
            naturalDescription,
          } as PostTextAsCronRuleRequestBody),
        }
      );

      return r.cronRule;
    },
    [workspace]
  );

  return textAsCronRule;
}
