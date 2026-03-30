import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { makeScript } from "@app/scripts/helpers";
import { isWhitelistableFeature } from "@app/types/shared/feature_flags";

// Deletes all rows for a given feature flag name from the feature_flags table.
// Use this to clean up feature flags that have been removed from the codebase
// (for flags still in WHITELISTABLE_FEATURES, use disable_feature_flag_all_workspaces.ts instead).
makeScript(
  {
    featureFlag: {
      type: "string" as const,
      demandOption: true,
      description:
        "Name of the legacy feature flag to delete (must no longer exist in WHITELISTABLE_FEATURES).",
    },
  },
  async ({ featureFlag, execute }, logger) => {
    if (isWhitelistableFeature(featureFlag)) {
      throw new Error(
        `"${featureFlag}" is still in WHITELISTABLE_FEATURES. Use disable_feature_flag_all_workspaces.ts instead.`
      );
    }

    const count = await FeatureFlagResource.countLegacyByName(featureFlag);

    logger.info(
      { featureFlag, workspaceCount: count },
      "Found legacy feature flag rows."
    );

    if (count === 0) {
      return;
    }

    if (!execute) {
      logger.info(
        { featureFlag, workspaceCount: count },
        "Would delete legacy feature flag rows."
      );
      return;
    }

    await FeatureFlagResource.deleteLegacyByName(featureFlag);

    logger.info(
      { featureFlag, workspaceCount: count },
      "Deleted legacy feature flag rows."
    );
  }
);
