import { useSendNotification } from "@app/hooks/useNotification";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentMemoriesResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/memories";
import type { PatchAgentMemoryRequestBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/memories/[mId]";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useAgentMemoriesForUser({
  owner,
  agentConfiguration,
  disabled,
}: {
  owner: LightWorkspaceType;
  agentConfiguration: AgentConfigurationType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
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

export function useUpdateAgentMemory({
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

  const { fetcherWithBody } = useFetcher();

  const updateMemory = useCallback(
    async (memoryId: string, body: PatchAgentMemoryRequestBody) => {
      try {
        const json = await fetcherWithBody([
          `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/memories/${memoryId}`,
          body,
          "PATCH",
        ]);

        sendNotification({
          type: "success",
          title: "Memory updated",
        });

        void mutateMemories();
        return json.memory;
      } catch (e) {
        if (isAPIErrorResponse(e)) {
          sendNotification({
            type: "error",
            title: "Failed to update memory",
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            description: e.error?.message || "Failed to update memory",
          });
        } else {
          sendNotification({
            type: "error",
            title: "Failed to update memory",
            description: "Failed to update memory",
          });
        }
        return null;
      }
    },
    [
      owner.sId,
      agentConfiguration,
      sendNotification,
      mutateMemories,
      fetcherWithBody,
    ]
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

  const { fetcher } = useFetcher();

  const deleteMemory = useCallback(
    async (memoryId: string) => {
      try {
        await fetcher(
          `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/memories/${memoryId}`,
          {
            method: "DELETE",
          }
        );

        sendNotification({
          type: "success",
          title: "Memory deleted",
        });

        void mutateMemories();
        return true;
      } catch (e) {
        if (isAPIErrorResponse(e)) {
          sendNotification({
            type: "error",
            title: "Failed to delete memory",
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            description: e.error?.message || "Failed to delete memory",
          });
        } else {
          sendNotification({
            type: "error",
            title: "Failed to delete memory",
            description: "Failed to delete memory",
          });
        }
        return false;
      }
    },
    [owner.sId, agentConfiguration, sendNotification, mutateMemories, fetcher]
  );

  return { deleteMemory };
}
