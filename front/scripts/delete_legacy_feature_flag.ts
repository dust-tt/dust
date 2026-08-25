import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { makeScript } from "@app/scripts/helpers";
import { isWhitelistableFeature } from "@app/types/shared/feature_flags";

// Deletes all rows for legacy feature flag names from the feature_flags table.
// Use this to clean up feature flags that have been removed from the codebase
// (for flags still in WHITELISTABLE_FEATURES, use disable_feature_flag_all_workspaces.ts instead).
//
//   npx tsx scripts/delete_legacy_feature_flag.ts --featureFlag <name>
//   npx tsx scripts/delete_legacy_feature_flag.ts --all
makeScript(
  {
    featureFlag: {
      type: "string" as const,
      demandOption: false,
      description:
        "Name of the legacy feature flag to delete (must no longer exist in WHITELISTABLE_FEATURES).",
    },
    all: {
      type: "boolean" as const,
      default: false,
      description:
        "Delete every legacy feature flag found in the database instead of a single name.",
    },
  },
  async ({ featureFlag, all, execute }, logger) => {
    if (featureFlag && all) {
      throw new Error("Pass either --featureFlag or --all, not both.");
    }
    if (!featureFlag && !all) {
      throw new Error("Pass --featureFlag <name> or --all.");
    }

    const countByName = new Map<string, number>();

    if (featureFlag) {
      if (isWhitelistableFeature(featureFlag)) {
        throw new Error(
          `"${featureFlag}" is still in WHITELISTABLE_FEATURES. Use disable_feature_flag_all_workspaces.ts instead.`
        );
      }

      countByName.set(
        featureFlag,
        await FeatureFlagResource.countLegacyByName(featureFlag)
      );
    } else {
      const countByAllNames =
        await FeatureFlagResource.countByFlagNameForAllWorkspaces();

      for (const [name, count] of countByAllNames) {
        if (!isWhitelistableFeature(name)) {
          countByName.set(name, count);
        }
      }
    }

    const targets = [...countByName].filter(([, count]) => count > 0);

    if (targets.length === 0) {
      logger.info("No legacy feature flag rows found.");
      return;
    }

    logger.info(
      { featureFlags: targets.map(([name]) => name) },
      "Found legacy feature flag rows."
    );

    for (const [name, workspaceCount] of targets) {
      if (!execute) {
        logger.info(
          { featureFlag: name, workspaceCount },
          "Would delete legacy feature flag rows."
        );
        continue;
      }

      await FeatureFlagResource.deleteLegacyByName(name);

      logger.info(
        { featureFlag: name, workspaceCount },
        "Deleted legacy feature flag rows."
      );
    }
  }
);
