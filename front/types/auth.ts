import type { PlanType, SubscriptionType } from "./plan";
import type { UserType, WorkspaceType } from "./user";

export type AuthenticatorType = {
  user: UserType;
  owner: WorkspaceType;
  plan: PlanType | null;
  isAdmin: boolean;
  subscription: SubscriptionType;
};
