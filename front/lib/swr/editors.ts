import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentEditorsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/editors";
import type { LightWorkspaceType } from "@app/types";

export function useEditors({
  owner,
  agentConfigurationId,
  disabled,
}: {
  owner: LightWorkspaceType;
  agentConfigurationId: string | null;
  disabled?: boolean;
}) {
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
    editors: useMemo(() => (data ? data.editors : []), [data]),
    isEditorsLoading: !error && !data && !disabled,
    isEditorsError: !!error,
    mutateEditors: mutate,
  };
}
