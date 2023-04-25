import { RoleType } from "@app/lib/auth";

/**
 *  Expresses limits for usage of the product Any positive number enforces the limit, -1 means no
 *  limit. If the limit is undefined we revert to the default limit.
 * */
export type LimitsType = {
  dataSources: {
    count: number;
    documents: { count: number; sizeMb: number };
    managed: boolean;
  };
};

export type PlanType = {
  limits: LimitsType;
};

export type WorkspaceType = {
  id: number;
  uId: string;
  sId: string;
  name: string;
  allowedDomain: string | null;
  type: "personal" | "team";
  role: RoleType;
  plan: PlanType;
};

export type UserType = {
  id: number;
  provider: "github" | "google";
  providerId: string;
  username: string;
  email: string;
  name: string;
  image: string | null;
  workspaces: WorkspaceType[];
};
