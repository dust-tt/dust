import { useSendNotification } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import {
  isTemplateAgentConfiguration,
  UserType,
  type LightAgentConfigurationType,
  type LightWorkspaceType,
  type TemplateAgentConfigurationType,
} from "@app/types";
import { GetAgentEditorsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/editors";

export function useEditors({
  owner,
  agentConfiguration,
  disabled,
}: {
  owner: LightWorkspaceType;
  agentConfiguration:
    | LightAgentConfigurationType
    | TemplateAgentConfigurationType
    | null;
  disabled?: boolean;
}) {
  const editorsFetcher: Fetcher<GetAgentEditorsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    !agentConfiguration || isTemplateAgentConfiguration(agentConfiguration)
      ? null
      : `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/editors`,
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
