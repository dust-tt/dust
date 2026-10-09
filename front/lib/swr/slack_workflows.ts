import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
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
import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";
import type { Fetcher } from "swr";

export function useSlackWorkflows({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const workflowsFetcher: Fetcher<GetSlackWorkflowsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/slack-workflows`,
    workflowsFetcher,
    { disabled }
  );

  return {
    isSlackBotConnected: data?.isSlackBotConnected ?? false,
    workflows: data?.workflows ?? emptyArray<SlackWorkflowType>(),
    isWorkflowsLoading: !error && !data && !disabled,
    isWorkflowsError: !!error,
    mutateWorkflows: mutate,
  };
}

export function useAllowSlackWorkflow({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isAllowing, setIsAllowing] = useState(false);
  const { mutateWorkflows } = useSlackWorkflows({ owner, disabled: true });

  const doAllowSlackWorkflow = useCallback(
    async ({
      botName,
      spaceIds,
    }: {
      botName: string;
      spaceIds: string[];
    }): Promise<boolean> => {
      setIsAllowing(true);
      const res = await clientFetch(`/api/w/${owner.sId}/slack-workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botName, spaceIds }),
      });

      if (!res.ok) {
        const error = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to allow Slack workflow`,
          error,
        });
        setIsAllowing(false);

        return false;
      }

      sendNotification({
        type: "success",
        title: t`Slack workflow allowed`,
        description: t`"${botName}" can now summon agents in Slack.`,
      });
      await mutateWorkflows();
      setIsAllowing(false);

      return true;
    },
    [owner.sId, mutateWorkflows, sendNotification, sendApiErrorNotification, t]
  );

  return { doAllowSlackWorkflow, isAllowing };
}

export function useRevokeSlackWorkflow({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isRevoking, setIsRevoking] = useState(false);
  const { mutateWorkflows } = useSlackWorkflows({ owner, disabled: true });

  const doRevokeSlackWorkflow = useCallback(
    async ({ botName }: { botName: string }): Promise<boolean> => {
      setIsRevoking(true);
      const res = await clientFetch(`/api/w/${owner.sId}/slack-workflows`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botName }),
      });

      if (!res.ok) {
        const error = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to revoke Slack workflow`,
          error,
        });
        setIsRevoking(false);

        return false;
      }

      sendNotification({
        type: "success",
        title: t`Slack workflow revoked`,
        description: t`"${botName}" can no longer summon agents in Slack.`,
      });
      await mutateWorkflows();
      setIsRevoking(false);

      return true;
    },
    [owner.sId, mutateWorkflows, sendNotification, sendApiErrorNotification, t]
  );

  return { doRevokeSlackWorkflow, isRevoking };
}
