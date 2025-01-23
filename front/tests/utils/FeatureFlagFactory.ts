import type { WhitelistableFeature } from "@dust-tt/types";
import type { InferCreationAttributes } from "sequelize";

import { FeatureFlag } from "@app/lib/models/feature_flag";
import type { Workspace } from "@app/lib/models/workspace";

import { Factory } from "./factories";

class FeatureFlagFactory extends Factory<FeatureFlag> {
  async make(params: InferCreationAttributes<FeatureFlag>) {
    return FeatureFlag.create(params);
  }

  basic(featureName: WhitelistableFeature, workspace: Workspace) {
    return this.params({
      name: featureName,
      workspaceId: workspace.id,
    });
  }
}

export const featureFlagFactory = () => {
  return new FeatureFlagFactory();
};
