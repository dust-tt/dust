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
import type { PatchTriggerStatusRequestBody } from "@app/types/api/assistant/configuration/triggers";
import type { PokeGetWebhookRequestsResponseBody } from "@app/types/api/poke/triggers";
import type { WebhookRequestTriggerStatus } from "@app/types/assistant/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

interface UpdatePokeTriggerStatusArgs {
  triggerId: string;
  status: PatchTriggerStatusRequestBody["status"];
}

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

  const { data, error, isValidating } = useConsumptionQuery<
    PokeTriggersSearchBody,
    GetAutomationTriggersResponse
  >({ url, body, disabled });

  const updateTriggerStatus = useCallback(
    async ({
      triggerId,
      status,
    }: UpdatePokeTriggerStatusArgs): Promise<boolean> => {
      try {
        const response = await clientFetch(
          `/api/poke/workspaces/${owner.sId}/triggers/${triggerId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }
        );

        if (!response.ok) {
          const errorData = await getErrorFromResponse(response);
          sendNotification({
            type: "error",
            title: "Failed to update trigger",
            description: `Error: ${errorData.message}`,
          });
          return false;
        }

        sendNotification({
          type: "success",
          title: status === "enabled" ? "Trigger enabled" : "Trigger disabled",
          description:
            status === "enabled"
              ? "The trigger is now running."
              : "The trigger is no longer running.",
        });
        return true;
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to update trigger",
          description: "An unexpected error occurred. Please try again.",
        });
        return false;
      }
    },
    [owner.sId, sendNotification]
  );

  return {
    triggers: data?.triggers ?? emptyArray<AutomationTriggerRow>(),
    totalCount: data?.totalCount ?? 0,
    isTriggersLoading: !disabled && !error && !data,
    isTriggersValidating: !disabled && !error && isValidating,
    isTriggersError: error,
    updateTriggerStatus,
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
