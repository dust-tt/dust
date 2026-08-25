import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import { useSendNotification } from "@app/hooks/useNotification";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type {
  AutomationTriggerRow,
  GetAutomationTriggersResponse,
} from "@app/lib/api/analytics/automations/triggers";
import type { PokeTriggersSearchBody } from "@app/lib/api/poke/triggers";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { PokeGetWebhookRequestsResponseBody } from "@app/types/api/poke/triggers";
import type { WebhookRequestTriggerStatus } from "@app/types/assistant/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function usePokeTriggers({
  owner,
  period,
  limit,
  offset = 0,
  search,
  filter,
  sortOrder,
  disabled,
}: {
  owner: LightWorkspaceType;
  period: ConsumptionPeriodSelection;
  limit: number;
  offset?: number;
  search?: string;
  filter?: PokeTriggersSearchBody["filter"];
  sortOrder: PokeTriggersSearchBody["sortOrder"];
  disabled?: boolean;
}) {
  const sendNotification = useSendNotification();
  const url = `/api/poke/workspaces/${owner.sId}/triggers/search`;
  const body: PokeTriggersSearchBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    limit,
    offset,
    search: search?.trim(),
    filter,
    sortOrder,
  };

  const { data, error, mutate, isValidating } = useConsumptionQuery<
    PokeTriggersSearchBody,
    GetAutomationTriggersResponse
  >({ url, body, disabled });

  const disableTrigger = useCallback(
    async (triggerId: string): Promise<void> => {
      try {
        const response = await clientFetch(
          `/api/poke/workspaces/${owner.sId}/triggers?tId=${encodeURIComponent(triggerId)}`,
          { method: "DELETE" }
        );

        if (!response.ok) {
          const errorData = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to disable trigger",
            description: errorData.message,
          });
          return;
        }

        await mutate();
        sendNotification({
          type: "success",
          title: "Trigger disabled",
          description: "The trigger is no longer running.",
        });
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to disable trigger",
          description: "An unexpected error occurred. Please try again.",
        });
      }
    },
    [mutate, owner.sId, sendNotification]
  );

  return {
    triggers: data?.triggers ?? emptyArray<AutomationTriggerRow>(),
    totalCount: data?.totalCount ?? 0,
    isTriggersLoading: !disabled && !error && !data,
    isTriggersValidating: !disabled && !error && isValidating,
    isTriggersError: error,
    disableTrigger,
  };
}

export function usePokeWebhookRequests({
  owner,
  triggerId,
  limit,
  status,
  disabled,
}: {
  owner: LightWorkspaceType;
  triggerId: string;
  limit?: number;
  status?: WebhookRequestTriggerStatus;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const requestsFetcher: Fetcher<PokeGetWebhookRequestsResponseBody> = fetcher;
  const params = new URLSearchParams();
  if (limit !== undefined) {
    params.set("limit", limit.toString());
  }
  if (status) {
    params.set("status", status);
  }
  const query = params.toString();
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/triggers/${triggerId}/webhook_requests${query ? `?${query}` : ""}`,
    requestsFetcher,
    { disabled }
  );

  return {
    webhookRequests: data?.requests ?? [],
    isWebhookRequestsLoading: !error && !data,
    isWebhookRequestsError: error,
    mutateWebhookRequests: mutate,
  };
}
