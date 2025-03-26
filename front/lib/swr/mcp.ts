import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetMCPServerToolsResponseBody } from "@app/pages/api/w/[wId]/mcp/[serverId]/tools";
import type { LightWorkspaceType } from "@app/types";

export function useInternalMcpServerTools({
  owner,
  serverId,
}: {
  owner: LightWorkspaceType;
  serverId: string | null;
}) {
  const configFetcher: Fetcher<GetMCPServerToolsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    serverId ? `/api/w/${owner.sId}/mcp/${serverId}/tools` : null,
    configFetcher
  );

  const tools = useMemo(() => (data ? data.tools : null), [data]);

  return {
    tools,
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
