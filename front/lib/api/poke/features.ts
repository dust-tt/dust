// Contract types for the Poke workspace feature-flag endpoints.
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export type GetPokeFeaturesResponseBody = {
  features: {
    name: WhitelistableFeature;
    createdAt: string;
  }[];
};

export type CreateOrDeleteFeatureFlagResponseBody = {
  success: true;
};
