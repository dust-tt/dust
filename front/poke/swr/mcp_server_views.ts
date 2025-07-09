import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListMCPServerViews } from "@app/pages/api/poke/workspaces/[wId]/mcp/views";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

/*
 * MCP server views for poke.
 */
export function usePokeMCPServerViews({
  disabled,
  owner,
}: PokeConditionalFetchProps) {
  const mcpServerViewsFetcher: Fetcher<PokeListMCPServerViews> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/mcp/views`,
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
