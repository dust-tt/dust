import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  useAgentConfiguration,
  useAgentConfigurations,
} from "@app/lib/swr/assistants";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  AgentEditorsLightResponseBody,
  AgentEditorsResponseBody,
  PatchAgentEditorsRequestBody,
} from "@app/types/api/assistant/configuration/editors";
import type { LightWorkspaceType } from "@app/types/user";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useEditors({
  owner,
  agentConfigurationId,
  disabled,
}: {
  owner: LightWorkspaceType;
  agentConfigurationId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const editorsFetcher: Fetcher<
    AgentEditorsResponseBody | AgentEditorsLightResponseBody
  > = fetcher;

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    agentConfigurationId
      ? `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/editors`
      : null,

    editorsFetcher,
    {
      disabled,
    }
  );

  return {
    editors: data?.editors ?? emptyArray(),
    isEditorsLoading: !error && !data && !disabled,
    isEditorsError: !!error,
    isEditorsValidating: isValidating,
    mutateEditors: mutate,
  };
}

export function useUpdateEditors({
  owner,
  agentConfigurationId,
}: {
  owner: LightWorkspaceType;
  agentConfigurationId: string | null;
}) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const { mutateEditors } = useEditors({
    owner,
    agentConfigurationId,
    disabled: true,
  });
  // Editors change what the caller may see of the agent (`canRead`/`canEdit`, and the private
  // fields redacted for admins), so the agent itself is refetched too.
  const { mutateAgentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId,
    disabled: true, // We only use the hook to mutate the cache
  });
  const { mutateRegardlessOfQueryParams: mutateAgentConfigurations } =
    useAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: "list", // Anything would work
      disabled: true, // We only use the hook to mutate the cache
    });

  const updateAgentEditors = useCallback(
    async (body: PatchAgentEditorsRequestBody) => {
      if (!agentConfigurationId) {
        return false;
      }

      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/editors`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        await mutateEditors();
        void mutateAgentConfiguration();
        void mutateAgentConfigurations();

        let title = "";
        let description: string | undefined = undefined;
        if (
          body.addEditorIds != null &&
          body.addEditorIds.length > 0 &&
          body.removeEditorIds != null &&
          body.removeEditorIds.length > 0
        ) {
          title = t`Successfully updated editors`;
          description = t`Successfully added and removed editors`;
        } else if (
          (body.addEditorIds == null || body.addEditorIds.length <= 0) &&
          body.removeEditorIds != null &&
          body.removeEditorIds.length > 0
        ) {
          const removedCount = body.removeEditorIds.length;
          title = t`${plural(removedCount, {
            one: "Successfully removed editor",
            other: "Successfully removed editors",
          })}`;
        } else {
          const addedCount = body.addEditorIds?.length ?? 0;
          title = t`${plural(addedCount, {
            one: "Successfully added editor",
            other: "Successfully added editors",
          })}`;
        }

        sendNotification({
          type: "success",
          title,
          description,
        });
        return true;
      }

      sendNotification({
        type: "error",
        title: t`Failed to update editors`,
      });
      return false;
    },
    [
      owner,
      agentConfigurationId,
      mutateEditors,
      mutateAgentConfiguration,
      mutateAgentConfigurations,
      sendNotification,
      t,
    ]
  );

  return updateAgentEditors;
}
