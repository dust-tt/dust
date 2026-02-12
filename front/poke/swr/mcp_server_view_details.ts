import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetMCPServerViewDetails } from "@app/pages/api/poke/workspaces/[wId]/mcp_server_views/[svId]/details";
import type { LightWorkspaceType } from "@app/types/user";

interface UsePokeMCPServerViewDetailsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  mcpServerViewId: string;
}

export function usePokeMCPServerViewDetails({
  disabled,
  owner,
  mcpServerViewId,
}: UsePokeMCPServerViewDetailsProps) {
  const detailsFetcher: Fetcher<PokeGetMCPServerViewDetails> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/mcp_server_views/${mcpServerViewId}/details`,
    detailsFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
