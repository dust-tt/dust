import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types";
import { WHITELISTABLE_FEATURES } from "@app/types";

async function enableFeatureFlag(
  workspace: WorkspaceResource,
  featureFlag: WhitelistableFeature,
  execute: boolean
) {
  const isEnabled = await FeatureFlagResource.isEnabledForWorkspace(
    workspace,
    featureFlag
  );
  if (isEnabled) {
    console.log(
      `Workspace ${workspace.sId} already has ${featureFlag} enabled -- Skipping.`
    );
    return;
  }

  if (execute) {
    await FeatureFlagResource.enable(workspace, featureFlag);
  }

  console.log(
    `${
      execute ? "" : "[DRYRUN]:"
    } Feature flag ${featureFlag} enabled for workspace: ${workspace.sId}.`
  );
}

async function disableFeatureFlag(
  workspace: WorkspaceResource,
  featureFlag: WhitelistableFeature,
  execute: boolean
) {
  if (execute) {
    const isEnabled = await FeatureFlagResource.isEnabledForWorkspace(
      workspace,
      featureFlag
    );
    if (!isEnabled) {
      console.log(
        `Workspace ${workspace.sId} does not have ${featureFlag} enabled -- Skipping.`
      );
      return;
    }

    await FeatureFlagResource.disable(workspace, featureFlag);
  }

  console.log(
    `${
      execute ? "" : "[DRYRUN]:"
    } Feature flag ${featureFlag} disabled for workspace: ${workspace.sId}.`
  );
}

makeScript(
  {
    enable: {
      type: "boolean",
      default: false,
    },
    featureFlag: {
      type: "string",
      choices: WHITELISTABLE_FEATURES,
      demandOption: true,
    },
    workspaceIds: {
      type: "array",
      demandOption: true,
      description:
        "List of workspace identifiers, separated by a space, for which the feature flag should be toggled.",
    },
  },
  async ({ enable, featureFlag, workspaceIds, execute }) => {
    for (const wId of workspaceIds) {
      const workspace = await WorkspaceResource.fetchById(wId);
      if (!workspace) {
        console.log(`Workspace ${wId} not found -- Skipping.`);
        continue;
      }

      if (enable) {
        await enableFeatureFlag(
          workspace,
          featureFlag as WhitelistableFeature,
          execute
        );
      } else {
        await disableFeatureFlag(
          workspace,
          featureFlag as WhitelistableFeature,
          execute
        );
      }
    }
  }
);
