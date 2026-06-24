import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";

export type PokeWorkspaceType = LightWorkspaceType & {
  createdAt: string;
  subscription: SubscriptionType;
  membersCount: number;
};

export type GetPokeWorkspacesResponseBody = {
  workspaces: PokeWorkspaceType[];
};
