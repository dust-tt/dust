import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types";
import { WHITELISTABLE_FEATURES } from "@app/types";

async function enableFeatureFlag(
  workspace: WorkspaceResource,
  featureFlag: WhitelistableFeature,
  execute: boolean
) {
  const { id: workspaceId, name } = workspace;

  const existingFlag = await FeatureFlagModel.findOne({
    where: {
      workspaceId,
      name: featureFlag,
    },
  });
  if (existingFlag) {
    console.log(
      `Workspace ${name}(${workspaceId}) already has ${featureFlag} enabled -- Skipping.`
    );
    return;
  }

  if (execute) {
    await FeatureFlagModel.create({
      workspaceId,
      name: featureFlag satisfies WhitelistableFeature,
    });
  }

  console.log(
    `${
      execute ? "" : "[DRYRUN]:"
    } Feature flag ${featureFlag} enabled for workspace: ${name}(${workspaceId}).`
  );
}

async function disableFeatureFlag(
  workspace: WorkspaceResource,
  featureFlag: WhitelistableFeature,
  execute: boolean
) {
  const { id: workspaceId, name } = workspace;

  if (execute) {
    const existingFlag = await FeatureFlagModel.findOne({
      where: {
        workspaceId,
        name: featureFlag,
      },
    });
    if (!existingFlag) {
      console.log(
        `Workspace ${name}(${workspaceId}) does not have ${featureFlag} enabled -- Skipping.`
      );
      return;
    }

    await existingFlag.destroy();
  }

  console.log(
    `${
      execute ? "" : "[DRYRUN]:"
    } Feature flag ${featureFlag} disabled for workspace: ${name}(${workspaceId}).`
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
