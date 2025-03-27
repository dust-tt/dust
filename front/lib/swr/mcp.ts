import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetMCPServerMetadataResponseBody } from "@app/pages/api/w/[wId]/mcp/[serverId]";
import type { LightWorkspaceType } from "@app/types";

export function useInternalMcpServerMetadata({
  owner,
  serverId,
}: {
  owner: LightWorkspaceType;
  serverId: string | null;
}) {
  const configFetcher: Fetcher<GetMCPServerMetadataResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    serverId ? `/api/w/${owner.sId}/mcp/${serverId}` : null,
    configFetcher
  );

  const tools = useMemo(() => (data ? data.metadata : null), [data]);

  return {
    tools,
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
