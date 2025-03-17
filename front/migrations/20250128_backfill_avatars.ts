import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { getPublicUploadBucket } from "@app/lib/file_storage";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { FileResource } from "@app/lib/resources/file_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
import { isSupportedFileContentType } from "@app/types";

async function backfillAvatars(
  workspace: LightWorkspaceType,
  {
    execute,
    deleteOldFile,
    logger,
  }: {
    execute: boolean;
    deleteOldFile: boolean;
    logger: Logger;
  }
) {
  logger.info(
    { workspaceId: workspace.sId, execute },
    "Starting avatar backfill"
  );
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const bucket = getPublicUploadBucket();
  const baseUrl = `https://storage.googleapis.com/${bucket.name}/`;

  // Get all agent with legacy avatars
  const agentConfigurations = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
      pictureUrl: {
        [Op.and]: [
          {
            [Op.like]: `${baseUrl}%`,
          },
          {
            [Op.notLike]: `${baseUrl}files%`,
          },
        ],
      },
    },
  });

  for (const agentConfiguration of agentConfigurations) {
    const { pictureUrl } = agentConfiguration;

    logger.info(
      {
        workspaceId: workspace.sId,
        agentId: agentConfiguration.sId,
        pictureUrl,
      },
      "Processing agent avatar"
    );

    const oldPath = pictureUrl.replace(baseUrl, "");

    if (!(await bucket.file(oldPath).exists())) {
      logger.error({ pictureUrl }, "File not found");
      continue;
    }

    const [metadata] = await bucket.file(oldPath).getMetadata();

    const contentType = metadata.contentType;

    if (!contentType || !isSupportedFileContentType(contentType)) {
      logger.error({ contentType, pictureUrl }, "Invalid node type for file");
      continue;
    }

    const fileBlob = {
      contentType,
      fileName: "avatar.jpeg",
      fileSize: metadata.size ? Number(metadata.size) : 0,
      userId: agentConfiguration.authorId,
      workspaceId: workspace.id,
      useCase: "avatar" as const,
      useCaseMetadata: null,
    };

    if (execute) {
      const file = await FileResource.makeNew(fileBlob);
      const newPath = file.getCloudStoragePath(auth, "public");

      logger.info({ oldPath, newPath }, "moving gcs resource");
      if (execute) {
        await bucket.file(oldPath).copy(bucket.file(newPath));
      }

      if (file) {
        await file.markAsReady();
      }

      const newPictureUrl = file.getPublicUrlForDownload(auth);

      logger.info({ pictureUrl, newPictureUrl }, "updating agent");

      if (execute) {
        await agentConfiguration.update(
          {
            pictureUrl: newPictureUrl,
          },
          {
            hooks: false,
            silent: true,
          }
        );
      }

      if (deleteOldFile) {
        await bucket.file(oldPath).delete();
      }
    }
  }
}

makeScript(
  {
    deleteOldFile: {
      type: "boolean",
      describe: "Whether to delete the old file",
      default: false,
    },
  },
  async ({ execute, deleteOldFile }, logger) => {
    return runOnAllWorkspaces(
      async (workspace) =>
        backfillAvatars(workspace, { execute, logger, deleteOldFile }),
      { concurrency: 10 }
    );
  }
);
