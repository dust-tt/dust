import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import type { BulkTriggerSelection } from "@app/lib/api/triggers/bulk_selection";
import { clientFetch } from "@app/lib/egress/client";
import { getLocalTimeZone } from "@app/lib/i18n/format";
import { parseMatcherExpression } from "@app/lib/matcher";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetTriggersResponseBody,
  PatchTriggerExecutionModeRequestBody,
  PatchTriggerStatusRequestBody,
  PatchTriggersRequestBody,
  PostTextAsCronRuleRequestBody,
  PostTextAsCronRuleResponseBody,
  PostTriggersRequestBody,
} from "@app/types/api/assistant/configuration/triggers";
import type {
  PostWebhookFilterGeneratorRequestBody,
  PostWebhookFilterGeneratorResponseBody,
} from "@app/types/api/assistant/configuration/triggers/webhook_filter_generator";
import type { GetTriggerEstimationResponseBody } from "@app/types/api/webhook_source";
import type {
  BulkTriggerUpdateOutcome,
  ScheduleConfig,
  TriggerExecutionMode,
} from "@app/types/assistant/triggers";
import { Err, Ok } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useAgentTriggers({
  workspaceId,
  agentConfigurationId,
  disabled,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const triggersFetcher: Fetcher<GetTriggersResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    agentConfigurationId
      ? `/api/w/${workspaceId}/triggers?aId=${agentConfigurationId}`
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

export function useDeleteTrigger({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { mutateTriggers } = useAgentTriggers({
    workspaceId,
    agentConfigurationId,
    disabled: true,
  });

  const deleteTrigger = useCallback(
    async (triggerId: string): Promise<boolean> => {
      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/triggers?aId=${agentConfigurationId}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ triggerIds: [triggerId] }),
          }
        );

        if (response.ok) {
          void mutateTriggers();
          return true;
        } else {
          return false;
        }
      } catch {
        return false;
      }
    },
    [workspaceId, agentConfigurationId, mutateTriggers]
  );

  return deleteTrigger;
}

export function useCreateTrigger({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutateTriggers } = useAgentTriggers({
    workspaceId,
    agentConfigurationId,
    disabled: true,
  });

  const createTrigger = useCallback(
    async (
      triggerData: PostTriggersRequestBody["triggers"][number]
    ): Promise<boolean> => {
      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/triggers?aId=${agentConfigurationId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ triggers: [triggerData] }),
          }
        );

        if (response.ok) {
          const triggerName = triggerData.name;
          sendNotification({
            type: "success",
            title: t`Trigger created`,
            description: t`The trigger "${triggerName}" has been created.`,
          });
          void mutateTriggers();
          return true;
        } else {
          const errorData = await getErrorFromResponse(response);
          sendApiErrorNotification({
            title: t`Failed to create trigger`,
            error: errorData,
          });
          return false;
        }
      } catch {
        sendNotification({
          type: "error",
          title: t`Failed to create trigger`,
          description: t`An unexpected error occurred. Please try again.`,
        });
        return false;
      }
    },
    [
      workspaceId,
      agentConfigurationId,
      sendNotification,
      mutateTriggers,
      sendApiErrorNotification,
      t,
    ]
  );

  return createTrigger;
}

export function useUpdateTrigger({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutateTriggers } = useAgentTriggers({
    workspaceId,
    agentConfigurationId,
    disabled: true,
  });

  const updateTrigger = useCallback(
    async (
      triggerData: PatchTriggersRequestBody["triggers"][number]
    ): Promise<boolean> => {
      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/triggers?aId=${agentConfigurationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ triggers: [triggerData] }),
          }
        );

        if (response.ok) {
          const triggerName = triggerData.name;
          sendNotification({
            type: "success",
            title: t`Trigger updated`,
            description: t`The trigger "${triggerName}" has been updated.`,
          });
          void mutateTriggers();
          return true;
        } else {
          const errorData = await getErrorFromResponse(response);
          sendApiErrorNotification({
            title: t`Failed to update trigger`,
            error: errorData,
          });
          return false;
        }
      } catch {
        sendNotification({
          type: "error",
          title: t`Failed to update trigger`,
          description: t`An unexpected error occurred. Please try again.`,
        });
        return false;
      }
    },
    [
      workspaceId,
      agentConfigurationId,
      sendNotification,
      mutateTriggers,
      sendApiErrorNotification,
      t,
    ]
  );

  return updateTrigger;
}

export function useUpdateTriggerStatus({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const updateTriggerStatus = useCallback(
    async ({
      agentConfigurationId,
      triggerId,
      status,
    }: {
      agentConfigurationId: string;
      triggerId: string;
      status: PatchTriggerStatusRequestBody["status"];
    }): Promise<boolean> => {
      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/triggers/${triggerId}/status`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }
        );

        if (response.ok) {
          sendNotification({
            type: "success",
            title:
              status === "enabled" ? t`Trigger enabled` : t`Trigger disabled`,
            description:
              status === "enabled"
                ? t`The trigger is now running.`
                : t`The trigger is no longer running.`,
          });
          return true;
        } else {
          const errorData = await getErrorFromResponse(response);
          sendApiErrorNotification({
            title: t`Failed to update trigger`,
            error: errorData,
          });
          return false;
        }
      } catch {
        sendNotification({
          type: "error",
          title: t`Failed to update trigger`,
          description: t`An unexpected error occurred. Please try again.`,
        });
        return false;
      }
    },
    [workspaceId, sendNotification, sendApiErrorNotification, t]
  );

  return updateTriggerStatus;
}

export function useUpdateTriggerExecutionMode({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const updateTriggerExecutionMode = useCallback(
    async ({
      agentConfigurationId,
      triggerId,
      executionMode,
    }: {
      agentConfigurationId: string;
      triggerId: string;
      executionMode: TriggerExecutionMode;
    }): Promise<boolean> => {
      const response = await clientFetch(
        `/api/w/${workspaceId}/triggers/${triggerId}/execution_mode`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            executionMode,
          } satisfies PatchTriggerExecutionModeRequestBody),
        }
      );

      if (!response.ok) {
        const errorData = await getErrorFromResponse(response);
        sendApiErrorNotification({
          title: t`Failed to update the trigger pool`,
          error: errorData,
        });
        return false;
      }

      sendNotification({
        type: "success",
        title: t`Trigger pool updated`,
        description:
          executionMode === "workspace_pool"
            ? t`This trigger now runs on the workspace's credits.`
            : t`This trigger now runs on its editor's credits.`,
      });
      return true;
    },
    [workspaceId, sendNotification, sendApiErrorNotification, t]
  );

  return updateTriggerExecutionMode;
}

function responseToScheduleConfig(
  r: PostTextAsCronRuleResponseBody
): ScheduleConfig {
  if (r.type === "interval") {
    return {
      type: "interval",
      intervalDays: r.intervalDays,
      dayOfWeek: r.dayOfWeek,
      hour: r.hour,
      minute: r.minute,
      timezone: r.timezone,
    };
  }
  return { type: "cron", cron: r.cronRule, timezone: r.timezone };
}

export function useTextAsCronRule({
  workspace,
}: {
  workspace: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const textAsCronRule = useCallback(
    async (naturalDescription: string, signal?: AbortSignal) => {
      let r: PostTextAsCronRuleResponseBody;
      try {
        r = await fetcher(
          `/api/w/${workspace.sId}/assistant/agent_configurations/text_as_cron_rule`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              naturalDescription,
              defaultTimezone: getLocalTimeZone(),
            } satisfies PostTextAsCronRuleRequestBody),
            signal,
          }
        );
      } catch (e: unknown) {
        return new Err(normalizeError(e));
      }

      return new Ok(responseToScheduleConfig(r));
    },
    [workspace, fetcher]
  );

  return textAsCronRule;
}

export function useWebhookFilterGenerator({
  workspace,
}: {
  workspace: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
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
          headers: {
            "Content-Type": "application/json",
          },
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
          // oxlint-disable-next-line dust/noRawErrorMessageInUi -- generated filter parse error; callers show it through `formatError`.
          `Error generating filter: ${parseResult.error.message}`
        );
      }

      return { filter: r.filter };
    },
    [workspace, fetcher]
  );

  return generateFilter;
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
  const { fetcher } = useFetcher();
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
    estimation: data ?? null,
    isEstimationLoading: !!webhookSourceId && !error && !data,
    isEstimationError: error,
    isEstimationValidating: isValidating,
    mutateEstimation: mutate,
  };
}

export function useBulkUpdateTriggerExecutionMode({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const doBulkUpdateTriggerExecutionMode = useCallback(
    async ({
      selection,
      executionMode,
    }: {
      selection: BulkTriggerSelection;
      executionMode: TriggerExecutionMode;
    }): Promise<BulkTriggerUpdateOutcome | null> => {
      const response = await clientFetch(
        `/api/w/${workspaceId}/triggers/bulk-execution-mode`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selection, executionMode }),
        }
      );
      if (!response.ok) {
        const errorData = await getErrorFromResponse(response);
        sendApiErrorNotification({
          title: t`Failed to update the trigger pool`,
          error: errorData,
        });
        return null;
      }

      const outcome: BulkTriggerUpdateOutcome = await response.json();
      const { updatedCount, skippedCount } = outcome;
      const parts: string[] = [];
      switch (executionMode) {
        case "workspace_pool":
          parts.push(
            t`${plural(updatedCount, {
              one: "# automation now runs on the workspace's credits.",
              other: "# automations now run on the workspace's credits.",
            })}`
          );
          break;
        case "user_pool":
          parts.push(
            t`${plural(updatedCount, {
              one: "# automation now runs on its editor's credits.",
              other: "# automations now run on their editor's credits.",
            })}`
          );
          break;
        default:
          assertNeverAndIgnore(executionMode);
      }
      if (skippedCount > 0) {
        parts.push(
          t`${plural(skippedCount, {
            one: "# could not be changed.",
            other: "# could not be changed.",
          })}`
        );
      }

      sendNotification({
        type: outcome.updatedCount > 0 ? "success" : "info",
        title: t`Trigger pool updated`,
        description: parts.join(" "),
      });
      return outcome;
    },
    [workspaceId, sendNotification, sendApiErrorNotification, t]
  );

  return doBulkUpdateTriggerExecutionMode;
}
