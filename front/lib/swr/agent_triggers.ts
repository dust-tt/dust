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
import type { GetTriggerResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/triggers/[triggerId]";
import type {
  CreateTriggerType,
  TriggerType,
  UpdateTriggerType,
} from "@app/types/assistant/triggers";

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
    isTriggersLoading: !error && !data && !disabled,
    isTriggersError: error,
    isTriggersValidating: isValidating,
    mutateTriggers: mutate,
  };
}

export function useTrigger({
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
  const triggerFetcher: Fetcher<GetTriggerResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    agentConfigurationId && triggerId
      ? `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/triggers/${triggerId}`
      : null,
    triggerFetcher,
    { disabled }
  );

  return {
    trigger: data?.trigger ?? null,
    isTriggerLoading: !error && !data && !disabled,
    isTriggerError: error,
    isTriggerValidating: isValidating,
    mutateTrigger: mutate,
  };
}

export function useCreateTrigger({
  workspaceId,
  agentConfigurationId,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
}) {
  const sendNotification = useSendNotification();
  const { mutateTriggers } = useAgentTriggers({
    workspaceId,
    agentConfigurationId,
    disabled: true, // We only use the hook to mutate the cache
  });

  const doCreate = useCallback(
    async (triggerData: CreateTriggerType) => {
      if (!agentConfigurationId) {
        return null;
      }

      const res = await fetch(
        `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/triggers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(triggerData),
        }
      );

      if (res.ok) {
        void mutateTriggers();
        const responseData = (await res.json()) as {
          trigger: TriggerType;
        };

        sendNotification({
          type: "success",
          title: `Successfully created ${triggerData.name}`,
          description: `Trigger "${triggerData.name}" was successfully created.`,
        });

        return responseData.trigger;
      } else {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to create trigger",
          description: `Error: ${errorData.message}`,
        });
        return null;
      }
    },
    [workspaceId, agentConfigurationId, mutateTriggers, sendNotification]
  );

  return doCreate;
}

export function useUpdateTrigger({
  workspaceId,
  agentConfigurationId,
  triggerId,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  triggerId: string | null;
}) {
  const sendNotification = useSendNotification();
  const { mutateTriggers } = useAgentTriggers({
    workspaceId,
    agentConfigurationId,
    disabled: true, // We only use the hook to mutate the cache
  });
  const { mutateTrigger } = useTrigger({
    workspaceId,
    agentConfigurationId,
    triggerId,
    disabled: true, // We only use the hook to mutate the cache
  });

  const doUpdate = useCallback(
    async (triggerData: UpdateTriggerType) => {
      if (!agentConfigurationId || !triggerId) {
        return null;
      }

      const res = await fetch(
        `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/triggers/${triggerId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(triggerData),
        }
      );

      if (res.ok) {
        void mutateTrigger();
        void mutateTriggers();
        const responseData = (await res.json()) as {
          trigger: TriggerType;
        };

        sendNotification({
          type: "success",
          title: `Successfully updated ${triggerData.name}`,
          description: `Trigger "${triggerData.name}" was successfully updated.`,
        });

        return responseData.trigger;
      } else {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to update trigger",
          description: `Error: ${errorData.message}`,
        });
        return null;
      }
    },
    [
      workspaceId,
      agentConfigurationId,
      triggerId,
      mutateTrigger,
      mutateTriggers,
      sendNotification,
    ]
  );

  return doUpdate;
}

export function useDeleteTrigger({
  workspaceId,
  agentConfigurationId,
  trigger,
}: {
  workspaceId: string;
  agentConfigurationId: string | null;
  trigger?: TriggerType;
}) {
  const sendNotification = useSendNotification();
  const { mutateTriggers } = useAgentTriggers({
    workspaceId,
    agentConfigurationId,
    disabled: true, // We only use the hook to mutate the cache
  });
  const { mutateTrigger } = useTrigger({
    workspaceId,
    agentConfigurationId,
    triggerId: trigger?.sId ?? null,
    disabled: true, // We only use the hook to mutate the cache
  });

  const doDelete = useCallback(async () => {
    if (!agentConfigurationId || !trigger) {
      return;
    }

    const res = await fetch(
      `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/triggers/${trigger.sId}`,
      {
        method: "DELETE",
      }
    );

    if (res.ok) {
      void mutateTrigger();
      void mutateTriggers();

      sendNotification({
        type: "success",
        title: `Successfully deleted ${trigger.name}`,
        description: `Trigger "${trigger.name}" was successfully deleted.`,
      });
    } else {
      const errorData = await getErrorFromResponse(res);
      sendNotification({
        type: "error",
        title: "Failed to delete trigger",
        description: `Error: ${errorData.message}`,
      });
    }
  }, [
    workspaceId,
    agentConfigurationId,
    trigger,
    mutateTrigger,
    mutateTriggers,
    sendNotification,
  ]);

  return doDelete;
}
