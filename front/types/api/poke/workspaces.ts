import type { CellType } from "@app/types/cell";
import type { SubscriptionType } from "@app/types/plan";
import type { RegionType } from "@app/types/region";
import type { LightWorkspaceType } from "@app/types/user";

export type PokeWorkspaceType = LightWorkspaceType & {
  createdAt: string;
  subscription: SubscriptionType;
  membersCount: number;
  cell: CellType;
  region: RegionType;
};

export type GetPokeWorkspacesResponseBody = {
  workspaces: PokeWorkspaceType[];
  hasMore: boolean;
};
