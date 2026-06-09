import type { SubscriptionType } from "@app/types/plan";
import type { ProvidersHealth } from "@app/types/provider_credential";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType, UserType } from "@app/types/user";

export type GetNoWorkspaceAuthContextResponseType = {
  user: UserType;
  defaultWorkspaceId: string | null;
};

export type GetWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: boolean;
  isBuilder: boolean;
  featureFlags: WhitelistableFeature[];
  isEligibleForTrial?: boolean;
  vizUrl: string;
  providersHealth: ProvidersHealth | null;
};
