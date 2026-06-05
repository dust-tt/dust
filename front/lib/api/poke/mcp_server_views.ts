import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { PokeMCPServerViewType } from "@app/types/poke";

export type PokeListMCPServerViews = {
  serverViews: MCPServerViewType[];
};

export type PokeGetMCPServerViewDetails = {
  mcpServerView: PokeMCPServerViewType;
};
