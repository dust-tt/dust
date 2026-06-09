import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { PokeMCPServerViewType } from "@app/types/poke";
import type { SpaceType } from "@app/types/space";

export type PokeMCPServerViewListItemType = MCPServerViewType & {
  space: Pick<SpaceType, "sId" | "name" | "kind">;
};

export type PokeListMCPServerViews = {
  serverViews: PokeMCPServerViewListItemType[];
};

export type PokeGetMCPServerViewDetails = {
  mcpServerView: PokeMCPServerViewType;
};
