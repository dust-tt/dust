import type { Logger } from "pino";
import { Op } from "sequelize";

import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

/**
 * This migration creates project_metadata records for existing project spaces
 * that were created before the project metadata feature was implemented.
 */

async function backfillProjectMetadata(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  // Find all project spaces for this workspace
  const projectSpaces = await SpaceModel.findAll({
    where: {
      workspaceId: workspace.id,
      kind: "project",
      deletedAt: null,
    },
  });

  if (projectSpaces.length === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "No project spaces found, skipping"
    );
    return;
  }

  // Find which project spaces already have metadata
  const existingMetadata = await ProjectMetadataModel.findAll({
    where: {
      spaceId: { [Op.in]: projectSpaces.map((s) => s.id) },
    },
    attributes: ["spaceId"],
  });

  const existingSpaceIds = new Set(existingMetadata.map((m) => m.spaceId));

  // Filter to spaces that don't have metadata yet
  const spacesNeedingMetadata = projectSpaces.filter(
    (space) => !existingSpaceIds.has(space.id)
  );

  if (spacesNeedingMetadata.length === 0) {
    logger.info(
      { workspaceId: workspace.sId },
      "All project spaces already have metadata, skipping"
    );
    return;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      spaceCount: spacesNeedingMetadata.length,
    },
    `Found ${spacesNeedingMetadata.length} project spaces needing metadata`
  );

  await concurrentExecutor(
    spacesNeedingMetadata,
    async (space) => {
      logger.info(
        {
          workspaceId: workspace.sId,
          spaceId: space.id,
          spaceName: space.name,
        },
        "Creating project metadata for space"
      );

      if (execute) {
        await ProjectMetadataModel.create({
          workspaceId: workspace.id,
          spaceId: space.id,
          description: null,
        });
      }
    },
    { concurrency: 4 }
  );

  logger.info(
    { workspaceId: workspace.sId },
    `Project metadata backfill completed for workspace`
  );
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting project metadata backfill");

    if (wId) {
      const ws = await WorkspaceResource.fetchById(wId);
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await backfillProjectMetadata(
        execute,
        logger,
        renderLightWorkspaceType({ workspace: ws })
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillProjectMetadata(execute, logger, workspace);
        },
        { concurrency: 4 }
      );
    }

    logger.info("Project metadata backfill completed");
  }
);
