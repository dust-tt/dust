import { useSendNotification } from "@app/hooks/useNotification";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetAgentEditorsResponseBody,
  PatchAgentEditorsRequestBody,
} from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/editors";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
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
  const editorsFetcher: Fetcher<GetAgentEditorsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
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
    mutateEditors: mutate,
  };
}

export function useUpdateEditors({
  owner,
  agentConfigurationId,
}: {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateEditors } = useEditors({
    owner,
    agentConfigurationId,
    disabled: true,
  });

  const { fetcherWithBody } = useFetcher();

  const updateAgentEditors = useCallback(
    async (body: PatchAgentEditorsRequestBody) => {
      await fetcherWithBody([
        `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/editors`,
        body,
        "PATCH",
      ]);

      void mutateEditors();

      let title = "";
      let description: string | undefined = undefined;
      if (
        body.addEditorIds != null &&
        body.addEditorIds.length > 0 &&
        body.removeEditorIds != null &&
        body.removeEditorIds.length > 0
      ) {
        title = "Successfully update editors";
        description = "Successfully added and removed editors";
      } else if (
        (body.addEditorIds == null || body.addEditorIds.length <= 0) &&
        body.removeEditorIds != null &&
        body.removeEditorIds.length > 0
      ) {
        title = `Successfully removed editor${pluralize(body.removeEditorIds.length)}`;
      } else {
        title = `Successfully added editor${pluralize(body.addEditorIds?.length ?? 0)}`;
      }

      sendNotification({
        type: "success",
        title,
        description,
      });
    },
    [
      owner,
      agentConfigurationId,
      mutateEditors,
      sendNotification,
      fetcherWithBody,
    ]
  );

  return updateAgentEditors;
}
