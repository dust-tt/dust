import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetMCPServerResourcesResponseBody } from "@app/pages/api/w/[wId]/mcp/[serverId]/resources";
import type { LightWorkspaceType } from "@app/types";

export function useInternalMcpServerResources({
  owner,
  serverId,
}: {
  owner: LightWorkspaceType;
  serverId: string | null;
}) {
  const configFetcher: Fetcher<GetMCPServerResourcesResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    serverId ? `/api/w/${owner.sId}/mcp/${serverId}/resources` : null,
    configFetcher
  );

  const resources = useMemo(() => (data ? data.resources : null), [data]);

  return {
    resources,
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
