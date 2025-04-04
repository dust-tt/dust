import { FeatureFlag } from "@app/lib/models/feature_flag";
import { Workspace } from "@app/lib/models/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types";
import { WHITELISTABLE_FEATURES } from "@app/types";

async function enableFeatureFlag(
  workspace: Workspace,
  featureFlag: WhitelistableFeature,
  execute: boolean
) {
  const { id: workspaceId, name } = workspace;

  const existingFlag = await FeatureFlag.findOne({
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
    await FeatureFlag.create({
      workspaceId,
      name: featureFlag as WhitelistableFeature,
    });
  }

  console.log(
    `${
      execute ? "" : "[DRYRUN]:"
    } Feature flag ${featureFlag} enabled for workspace: ${name}(${workspaceId}).`
  );
}

async function disableFeatureFlag(
  workspace: Workspace,
  featureFlag: WhitelistableFeature,
  execute: boolean
) {
  const { id: workspaceId, name } = workspace;

  if (execute) {
    const existingFlag = await FeatureFlag.findOne({
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
      const workspace = await Workspace.findOne({
        where: {
          sId: wId,
        },
      });
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
