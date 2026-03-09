import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { WHITELISTABLE_FEATURES } from "@app/types/shared/feature_flags";

makeScript(
  {
    featureFlag: {
      type: "string",
      choices: WHITELISTABLE_FEATURES,
      demandOption: true,
      description: "The feature flag to disable for all workspaces.",
    },
  },
  async ({ featureFlag, execute }) => {
    const flag = featureFlag as WhitelistableFeature;

    const count = await FeatureFlagModel.count({
      where: { name: flag },
    });

    console.log(
      `Found ${count} workspace(s) with feature flag "${flag}" enabled.`
    );

    if (count === 0) {
      console.log("Nothing to do.");
      return;
    }

    if (execute) {
      const deleted = await FeatureFlagModel.destroy({
        where: { name: flag },
      });
      console.log(
        `Feature flag "${flag}" disabled for ${deleted} workspace(s).`
      );
    } else {
      console.log(
        `[DRYRUN]: Would disable feature flag "${flag}" for ${count} workspace(s).`
      );
    }
  }
);
