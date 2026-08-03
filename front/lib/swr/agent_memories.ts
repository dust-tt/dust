import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentMemoriesResponseBody } from "@app/types/api/assistant/configuration/memories";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
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
      const res = await clientFetch(
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
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
