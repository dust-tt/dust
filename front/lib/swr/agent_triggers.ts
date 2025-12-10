import { useCallback } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { parseMatcherExpression } from "@app/lib/matcher";
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
import type {
  PostWebhookFilterGeneratorRequestBody,
  PostWebhookFilterGeneratorResponseBody,
} from "@app/pages/api/w/[wId]/assistant/agent_configurations/webhook_filter_generator";
import type { GetUserTriggersResponseBody } from "@app/pages/api/w/[wId]/me/triggers";
import type { GetTriggerEstimationResponseBody } from "@app/pages/api/w/[wId]/webhook_sources/[webhookSourceId]/trigger-estimation";
import type { LightWorkspaceType } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";
import type { WebhookProvider } from "@app/types/triggers/webhooks";

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
    async (naturalDescription: string, signal?: AbortSignal) => {
      let r: PostTextAsCronRuleResponseBody;
      try {
        r = await fetcher(
          `/api/w/${workspace.sId}/assistant/agent_configurations/text_as_cron_rule`,
          {
            method: "POST",
            body: JSON.stringify({
              naturalDescription,
              defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            } as PostTextAsCronRuleRequestBody),
            signal,
          }
        );
      } catch (e: unknown) {
        return new Err(normalizeError(e));
      }

      return new Ok({ cron: r.cronRule, timezone: r.timezone });
    },
    [workspace]
  );

  return textAsCronRule;
}

export function useWebhookFilterGenerator({
  workspace,
}: {
  workspace: LightWorkspaceType;
}) {
  const generateFilter = useCallback(
    async ({
      naturalDescription,
      event,
      provider,
      signal,
    }: {
      naturalDescription: string;
      event: string;
      provider: WebhookProvider;
      signal?: AbortSignal;
    }): Promise<{ filter: string }> => {
      const r: PostWebhookFilterGeneratorResponseBody = await fetcher(
        `/api/w/${workspace.sId}/assistant/agent_configurations/webhook_filter_generator`,
        {
          method: "POST",
          body: JSON.stringify({
            naturalDescription,
            event,
            provider,
          } satisfies PostWebhookFilterGeneratorRequestBody),
          signal,
        }
      );

      const parseResult = parseMatcherExpression(r.filter);
      if (parseResult.isErr()) {
        throw new Error(
          `Error generating filter: ${parseResult.error.message}`
        );
      }

      return { filter: r.filter };
    },
    [workspace]
  );

  return generateFilter;
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
        const response = await clientFetch(
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        const response = await clientFetch(
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

export function useTriggerEstimation({
  workspaceId,
  webhookSourceId,
  filter,
  selectedEvent,
}: {
  workspaceId: string;
  webhookSourceId?: string | null;
  filter?: string | null;
  selectedEvent?: string | null;
}) {
  const key = webhookSourceId
    ? `/api/w/${workspaceId}/webhook_sources/${webhookSourceId}/trigger-estimation`
    : null;

  const triggerEstimationFetcher: (
    arg: string
  ) => Promise<GetTriggerEstimationResponseBody> = (baseUrl) => {
    const params = new URLSearchParams();
    if (filter && filter.trim()) {
      params.append("filter", filter);
    }
    if (selectedEvent) {
      params.append("event", selectedEvent);
    }
    const queryString = params.toString();
    const url = `${baseUrl}${queryString ? `?${queryString}` : ""}`;
    return fetcher(url);
  };

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    key,
    triggerEstimationFetcher,
    {
      revalidateOnMount: false,
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  return {
    estimation: (data as GetTriggerEstimationResponseBody | undefined) ?? null,
    isEstimationLoading: !!webhookSourceId && !error && !data,
    isEstimationError: error,
    isEstimationValidating: isValidating,
    mutateEstimation: mutate,
  };
}
