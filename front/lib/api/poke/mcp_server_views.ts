import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { PokeMCPServerViewType } from "@app/types/poke";
import type { SpaceType } from "@app/types/space";

export type PokeMCPServerViewListItemType = MCPServerViewType & {
  space: Pick<SpaceType, "sId" | "name" | "kind">;
};

export type PokeListMCPServerViews = {
  serverViews: PokeMCPServerViewListItemType[];
};

export type PokeMCPServerViewSpaceAvailabilityType = {
  sId: string;
  spaceId: string;
  space: Pick<SpaceType, "sId" | "name" | "kind">;
  createdAt: number;
  editedBy: string | null;
  editedAt: number | null;
};

export type PokeGetMCPServerViewDetails = {
  mcpServerView: PokeMCPServerViewType;
  spaceViews: PokeMCPServerViewSpaceAvailabilityType[];
};
