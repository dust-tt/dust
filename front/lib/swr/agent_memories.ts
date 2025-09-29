import { useCallback } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentMemoriesResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/memories";
import type { PatchAgentMemoryRequestBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/memories/[mId]";
import type { AgentConfigurationType, LightWorkspaceType } from "@app/types";

export function useAgentMemoriesForUser({
  owner,
  agentConfiguration,
  disabled,
}: {
  owner: LightWorkspaceType;
  agentConfiguration: AgentConfigurationType;
  disabled?: boolean;
}) {
  const memoriesFetcher: Fetcher<GetAgentMemoriesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/memories`,
    memoriesFetcher,
    {
      disabled,
    }
  );

  return {
    memories: data?.memories ?? emptyArray(),
    isMemoriesLoading: !error && !data && !disabled,
    isMemoriesError: !!error,
    mutateMemories: mutate,
  };
}

function useUpdateAgentMemory({
  owner,
  agentConfiguration,
}: {
  owner: LightWorkspaceType;
  agentConfiguration: AgentConfigurationType;
}) {
  const sendNotification = useSendNotification();
  const { mutateMemories } = useAgentMemoriesForUser({
    owner,
    agentConfiguration,
    disabled: true,
  });

  const updateMemory = useCallback(
    async (memoryId: string, body: PatchAgentMemoryRequestBody) => {
      const res = await fetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/memories/${memoryId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const json = await res.json();
        sendNotification({
          type: "error",
          title: "Failed to update memory",
          description: json.error?.message || "Failed to update memory",
        });
        return null;
      }

      sendNotification({
        type: "success",
        title: "Memory updated",
      });

      void mutateMemories();
      const json = await res.json();
      return json.memory;
    },
    [owner.sId, agentConfiguration, sendNotification, mutateMemories]
  );

  return { updateMemory };
}

export function useDeleteAgentMemory({
  owner,
  agentConfiguration,
}: {
  owner: LightWorkspaceType;
  agentConfiguration: AgentConfigurationType;
}) {
  const sendNotification = useSendNotification();
  const { mutateMemories } = useAgentMemoriesForUser({
    owner,
    agentConfiguration,
    disabled: true,
  });

  const deleteMemory = useCallback(
    async (memoryId: string) => {
      const res = await fetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/memories/${memoryId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        const json = await res.json();
        sendNotification({
          type: "error",
          title: "Failed to delete memory",
          description: json.error?.message || "Failed to delete memory",
        });
        return false;
      }

      sendNotification({
        type: "success",
        title: "Memory deleted",
      });

      void mutateMemories();
      return true;
    },
    [owner.sId, agentConfiguration, sendNotification, mutateMemories]
  );

  return { deleteMemory };
}
