import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAgentEditorsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/editors";
import type { UserType } from "@app/types";
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
    editorsMap: useMemo(
      () =>
        data
          ? data.editors.reduce(
              (acc, val) => acc.set(val.sId, val),
              new Map<string, UserType>()
            )
          : undefined,
      [data]
    ),
    isEditorsLoading: !error && !data && !disabled,
    isEditorsError: !!error,
    mutateEditors: mutate,
  };
}
