import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListMCPServerViews } from "@app/pages/api/poke/workspaces/[wId]/mcp/views";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

interface UsePokeMCPServerViewsProps extends PokeConditionalFetchProps {
  globalSpaceOnly?: boolean;
}

/*
 * MCP server views for poke.
 */
export function usePokeMCPServerViews({
  disabled,
  owner,
  globalSpaceOnly,
}: UsePokeMCPServerViewsProps) {
  const mcpServerViewsFetcher: Fetcher<PokeListMCPServerViews> = fetcher;

  const params = new URLSearchParams();
  if (globalSpaceOnly) {
    params.set("globalSpaceOnly", "true");
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
