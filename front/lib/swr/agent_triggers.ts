import { useCallback } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import {
  emptyArray,
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetTriggersResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/triggers";
import type { GetSubscribersResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/triggers/[tId]/subscribers";
import type {
  PostTextAsCronRuleRequestBody,
  PostTextAsCronRuleResponseBody,
} from "@app/pages/api/w/[wId]/assistant/agent_configurations/text_as_cron_rule";
import type { GetUserTriggersResponseBody } from "@app/pages/api/w/[wId]/me/triggers";
import type { LightWorkspaceType } from "@app/types";

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

export function useUserTriggers({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const userTriggersFetcher: Fetcher<GetUserTriggersResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/me/triggers`,
    userTriggersFetcher,
    { disabled }
  );

  return {
    triggers: data?.triggers ?? emptyArray(),
    isTriggersLoading: !error && !data && !disabled,
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
            defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          } as PostTextAsCronRuleRequestBody),
        }
      );

      return { cron: r.cronRule, timezone: r.timezone };
    },
    [workspace]
  );

  return textAsCronRule;
}

export function useTriggerSubscribers({
  workspaceId,
  agentConfigurationId,
  triggerId,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  triggerId: string | null;
  disabled?: boolean;
}) {
  const subscribersFetcher: Fetcher<GetSubscribersResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    agentConfigurationId && triggerId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/triggers/${triggerId}/subscribers`
      : null,
    subscribersFetcher,
    { disabled }
  );

  return {
    subscribers: data?.subscribers ?? emptyArray(),
    isSubscribersLoading:
      !!agentConfigurationId && !!triggerId && !error && !data && !disabled,
    isSubscribersError: error,
    isSubscribersValidating: isValidating,
    mutateSubscribers: mutate,
  };
}

export function useAddTriggerSubscriber({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateTriggers } = useAgentTriggers({
    workspaceId,
    agentConfigurationId,
    disabled: true,
  });

  const addSubscriber = useCallback(
    async (triggerId: string): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/triggers/${triggerId}/subscribers`,
          {
            method: "POST",
          }
        );

        if (response.ok) {
          sendNotification({
            type: "success",
            title: "Subscribed to trigger",
            description:
              "You will now receive notifications when this trigger runs.",
          });
          void mutateTriggers();
          return true;
        } else {
          const errorData = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to subscribe",
            description: `Error: ${errorData.message}`,
          });
          return false;
        }
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to subscribe",
          description: "An unexpected error occurred. Please try again.",
        });
        return false;
      }
    },
    [workspaceId, agentConfigurationId, sendNotification, mutateTriggers]
  );

  return addSubscriber;
}

export function useRemoveTriggerSubscriber({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId?: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateTriggers: mutateAgentTriggers } = useAgentTriggers({
    workspaceId,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    agentConfigurationId: agentConfigurationId || null,
    disabled: !agentConfigurationId,
  });
  const { mutateTriggers: mutateUserTriggers } = useUserTriggers({
    workspaceId,
    disabled: !!agentConfigurationId,
  });

  const removeSubscriber = useCallback(
    async (
      triggerId: string,
      triggerAgentConfigurationId?: string
    ): Promise<boolean> => {
      const targetAgentConfigurationId =
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        triggerAgentConfigurationId || agentConfigurationId;

      try {
        const response = await fetch(
          `/api/w/${workspaceId}/assistant/agent_configurations/${targetAgentConfigurationId}/triggers/${triggerId}/subscribers`,
          {
            method: "DELETE",
          }
        );

        if (response.ok) {
          sendNotification({
            type: "success",
            title: "Unsubscribed from trigger",
            description:
              "You will no longer receive notifications when this trigger runs.",
          });

          // Mutate the appropriate triggers list
          if (agentConfigurationId) {
            void mutateAgentTriggers();
          } else {
            void mutateUserTriggers();
          }

          return true;
        } else {
          const errorData = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to unsubscribe",
            description: `Error: ${errorData.message}`,
          });
          return false;
        }
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to unsubscribe",
          description: "An unexpected error occurred. Please try again.",
        });
        return false;
      }
    },
    [
      workspaceId,
      agentConfigurationId,
      sendNotification,
      mutateAgentTriggers,
      mutateUserTriggers,
    ]
  );

  return removeSubscriber;
}
