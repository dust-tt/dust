import { useSendNotification } from "@dust-tt/sparkle";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";
import type { TagType } from "@app/types/tag";
import { GetAgentEditorsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/editors";

export function useEditors({
  owner,
  agentConfiguration,
  disabled,
}: {
  owner: LightWorkspaceType;
  agentConfiguration: LightAgentConfigurationType;
  disabled?: boolean;
}) {
  const editorsFetcher: Fetcher<GetAgentEditorsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}/editors`,
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
