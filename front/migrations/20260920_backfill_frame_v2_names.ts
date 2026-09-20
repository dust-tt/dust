import { getFrameV2NameFromMountFilePath } from "@app/lib/api/frames/frame_name";
import { FileModel } from "@app/lib/resources/storage/models/files";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { frameV2ContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import { Op } from "sequelize";

/**
 * A Frames v2 package is named by the folder holding its manifest. Before this backfill the
 * stored name came from `manifest.name`, refreshed on publish; from now on it is a projection of
 * the source folder. Bring every registered Frame onto the projection.
 */
async function backfillFrameV2Names({
  workspace,
  execute,
  logger,
}: {
  workspace: LightWorkspaceType;
  execute: boolean;
  logger: Logger;
}): Promise<void> {
  const frames = await FileModel.findAll({
    where: {
      workspaceId: workspace.id,
      contentType: frameV2ContentType,
      mountFilePath: { [Op.ne]: null },
    },
  });

  for (const frame of frames) {
    if (!frame.mountFilePath) {
      continue;
    }

    const frameName = getFrameV2NameFromMountFilePath(frame.mountFilePath);
    if (!frameName || frame.useCaseMetadata?.frameName === frameName) {
      continue;
    }

    if (!execute) {
      logger.info(
        {
          workspaceId: workspace.sId,
          fileId: frame.id,
          from: frame.useCaseMetadata?.frameName ?? null,
          to: frameName,
        },
        "Dry-run: would name the Frame after its source folder"
      );
      continue;
    }

    await frame.update({
      useCaseMetadata: { ...frame.useCaseMetadata, frameName },
    });
    logger.info(
      { workspaceId: workspace.sId, fileId: frame.id, frameName },
      "Named the Frame after its source folder"
    );
  }
}

makeScript(
  {
    wId: {
      type: "string",
      description: "Workspace ID (omit for all workspaces).",
    },
    fromWorkspaceModelId: {
      type: "number",
      description: "Resume from this workspace model ID.",
    },
  },
  async ({ wId, fromWorkspaceModelId, execute }, logger) => {
    await runOnAllWorkspaces(
      (workspace) => backfillFrameV2Names({ workspace, execute, logger }),
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );
  }
);
