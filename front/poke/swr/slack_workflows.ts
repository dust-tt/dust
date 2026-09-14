import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetSlackWorkflowsResponseBody,
  SlackWorkflowType,
} from "@app/types/api/slack/workflows";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function usePokeSlackWorkflows({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const sendNotification = useSendNotification();
  const { fetcher } = useFetcher();
  const workflowsFetcher: Fetcher<GetSlackWorkflowsResponseBody> = fetcher;
  const url = `/api/poke/workspaces/${owner.sId}/slack-workflows`;

  const { data, error, mutate } = useSWRWithDefaults(url, workflowsFetcher, {
    disabled,
  });

  const revokeSlackWorkflow = useCallback(
    async (botName: string): Promise<boolean> => {
      const response = await clientFetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botName }),
      });

      if (!response.ok) {
        const errorData = await getErrorFromResponse(response);
        sendNotification({
          type: "error",
          title: "Failed to revoke Slack workflow",
          description: errorData.message,
        });
        return false;
      }

      sendNotification({
        type: "success",
        title: "Slack workflow revoked",
        description: `"${botName}" can no longer summon agents in Slack.`,
      });
      await mutate();

      return true;
    },
    [url, mutate, sendNotification]
  );

  return {
    isSlackBotConnected: data?.isSlackBotConnected ?? false,
    workflows: data?.workflows ?? emptyArray<SlackWorkflowType>(),
    isSlackWorkflowsLoading: !error && !data && !disabled,
    isSlackWorkflowsError: !!error,
    revokeSlackWorkflow,
  };
}
