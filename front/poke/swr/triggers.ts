import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type { AutomationTriggersFilter } from "@app/lib/api/analytics/automations/schema";
import type { AutomationTriggerRow } from "@app/lib/api/analytics/automations/triggers";
import type {
  PokeTriggerSearchBody,
  PokeTriggerSearchResponse,
} from "@app/lib/api/poke/triggers";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  PokeAgentTriggerRow,
  PokeGetWebhookRequestsResponseBody,
} from "@app/types/api/poke/triggers";
import type { WebhookRequestTriggerStatus } from "@app/types/assistant/triggers";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

const pokeTriggersUrl = (workspaceId: string) =>
  `/api/poke/workspaces/${workspaceId}/triggers`;

type UsePokeTriggersProps =
  | {
      scope: "agent";
      owner: LightWorkspaceType;
      agentId: string;
      disabled?: boolean;
    }
  | {
      scope: "workspace";
      owner: LightWorkspaceType;
      period: ConsumptionPeriodSelection;
      limit: number;
      offset?: number;
      search?: string;
      filter?: AutomationTriggersFilter;
      disabled?: boolean;
    };

export function usePokeTriggers(props: UsePokeTriggersProps) {
  const { owner, disabled } = props;
  const url = `${pokeTriggersUrl(owner.sId)}/search`;
  const body: PokeTriggerSearchBody =
    props.scope === "agent"
      ? {
          scope: "agent",
          agentId: props.agentId,
        }
      : {
          scope: "workspace",
          period: props.period.kind,
          days:
            props.period.kind === "days"
              ? props.period.days
              : DEFAULT_CONSUMPTION_PERIOD_DAYS,
          limit: props.limit,
          offset: props.offset ?? 0,
          search: props.search?.trim(),
          filter: props.filter,
        };

  const { data, error, mutate, isValidating } = useConsumptionQuery<
    PokeTriggerSearchBody,
    PokeTriggerSearchResponse
  >({ url, body, disabled });

  if (props.scope === "agent") {
    const response =
      data?.scope === "agent" && data.agentId === props.agentId
        ? data
        : undefined;

    return {
      scope: "agent" as const,
      agentId: props.agentId,
      triggers: response?.triggers ?? emptyArray<PokeAgentTriggerRow>(),
      isTriggersLoading: !disabled && !error && !response,
      isTriggersValidating: !disabled && !error && isValidating,
      isTriggersError: error,
      mutateTriggers: mutate,
    };
  }

  const response = data?.scope === "workspace" ? data : undefined;

  return {
    scope: "workspace" as const,
    triggers: response?.triggers ?? emptyArray<AutomationTriggerRow>(),
    totalCount: response?.totalCount ?? 0,
    isTriggersLoading: !disabled && !error && !response,
    isTriggersValidating: !disabled && !error && isValidating,
    isTriggersError: error,
    mutateTriggers: mutate,
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
