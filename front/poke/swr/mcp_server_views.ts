import type { PokeListMCPServerViews } from "@app/lib/api/poke/mcp_server_views";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

interface UsePokeMCPServerViewsProps extends PokeConditionalFetchProps {
  globalSpaceOnly?: boolean;
  systemSpaceOnly?: boolean;
}

/*
 * MCP server views for poke.
 */
export function usePokeMCPServerViews({
  disabled,
  owner,
  globalSpaceOnly,
  systemSpaceOnly,
}: UsePokeMCPServerViewsProps) {
  const { fetcher } = useFetcher();
  const mcpServerViewsFetcher: Fetcher<PokeListMCPServerViews> = fetcher;

  const params = new URLSearchParams();
  if (globalSpaceOnly) {
    params.set("globalSpaceOnly", "true");
  }
  if (systemSpaceOnly) {
    params.set("systemSpaceOnly", "true");
  }

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/mcp/views?${params.toString()}`,
    mcpServerViewsFetcher,
    { disabled }
  );

  return {
    data: data?.serverViews ?? emptyArray(),
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}

export function usePokeSystemSpaceMCPServerViews(
  props: PokeConditionalFetchProps
) {
  return usePokeMCPServerViews({ ...props, systemSpaceOnly: true });
}
