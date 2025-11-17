import { Op } from "sequelize";

import { FeatureFlag } from "@app/lib/models/feature_flag";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { makeScript } from "@app/scripts/helpers";
import type { WhitelistableFeature } from "@app/types";

const FEATURE_FLAG_NAME: WhitelistableFeature = "legacy_dust_apps";

type WorkspaceIdRow = {
  workspaceId: number | null;
};

makeScript({}, async ({ execute }, logger) => {
  const appWorkspaceRows = (await AppModel.findAll({
    attributes: ["workspaceId"],
    group: ["workspaceId"],
    raw: true,
    paranoid: true,
  })) as WorkspaceIdRow[];

  const workspaceIds = appWorkspaceRows
    .map((row) => row.workspaceId)
    .filter((workspaceId): workspaceId is number => workspaceId !== null);

  if (workspaceIds.length === 0) {
    logger.info(
      { execute },
      "No workspaces with legacy Dust Apps found; nothing to gate."
    );
    return;
  }

  const existingFlags = await FeatureFlag.findAll({
    attributes: ["workspaceId"],
    where: {
      name: FEATURE_FLAG_NAME,
      workspaceId: {
        [Op.in]: workspaceIds,
      },
    },
    raw: true,
  });
  const flaggedWorkspaceIds = new Set<number>(
    existingFlags
      .map((row: WorkspaceIdRow) => row.workspaceId)
      .filter((workspaceId): workspaceId is number => workspaceId !== null)
  );

  const workspaceIdsToFlag = workspaceIds.filter(
    (workspaceId) => !flaggedWorkspaceIds.has(workspaceId)
  );

  logger.info(
    {
      execute,
      totalWorkspaceCount: workspaceIds.length,
      alreadyFlaggedCount: flaggedWorkspaceIds.size,
      missingFlagCount: workspaceIdsToFlag.length,
    },
    "Computed workspaces requiring the legacy Dust Apps feature flag."
  );

  if (workspaceIdsToFlag.length === 0) {
    logger.info(
      { execute },
      "All workspaces with Dust Apps already gated; nothing to do."
    );
    return;
  }

  const targetWorkspaces = await WorkspaceModel.findAll({
    attributes: ["id", "sId", "name"],
    where: {
      id: {
        [Op.in]: workspaceIdsToFlag,
      },
    },
  });
  const missingWorkspaceIds = workspaceIdsToFlag.filter(
    (workspaceId) =>
      !targetWorkspaces.some((workspace) => workspace.id === workspaceId)
  );

  for (const workspace of targetWorkspaces) {
    if (execute) {
      await FeatureFlag.create({
        workspaceId: workspace.id,
        name: FEATURE_FLAG_NAME,
      });
      logger.info(
        {
          workspaceId: workspace.id,
          workspaceSId: workspace.sId,
          workspaceName: workspace.name,
          featureFlag: FEATURE_FLAG_NAME,
          execute,
        },
        "Enabled legacy Dust Apps feature flag."
      );
    } else {
      logger.info(
        {
          workspaceId: workspace.id,
          workspaceSId: workspace.sId,
          workspaceName: workspace.name,
          featureFlag: FEATURE_FLAG_NAME,
          execute,
        },
        "Would enable legacy Dust Apps feature flag."
      );
    }
  }

  for (const workspaceId of missingWorkspaceIds) {
    logger.warn(
      {
        workspaceId,
        featureFlag: FEATURE_FLAG_NAME,
        execute,
      },
      "Workspace had Dust Apps but could not be fetched; skipping feature flag."
    );
  }
});
