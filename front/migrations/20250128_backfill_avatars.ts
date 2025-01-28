import type { LightWorkspaceType } from "@dust-tt/types";
import { isSupportedFileContentType } from "@dust-tt/types";
import { Op } from "sequelize";

import { getPublicUploadBucket } from "@app/lib/file_storage";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { FileResource } from "@app/lib/resources/file_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

async function backfillAvatars(
  workspace: LightWorkspaceType,
  {
    execute,
    logger,
    bucket,
  }: { execute: boolean; logger: Logger; bucket: string }
) {
  logger.info(
    { workspaceId: workspace.sId, execute },
    "Starting avatar backfill"
  );

  // Get all agent with legacy avatars
  const agentConfigurations = await AgentConfiguration.findAll({
    where: {
      workspaceId: workspace.id,
      pictureUrl: {
        [Op.and]: [
          {
            [Op.like]: `https://storage.googleapis.com/${bucket}/%`,
          },
          {
            [Op.notLike]: `https://storage.googleapis.com/${bucket}/files/%`,
          },
        ],
      },
    },
  });

  for (const agentConfiguration of agentConfigurations) {
    const { pictureUrl } = agentConfiguration;
    const oldPath = pictureUrl.replace(
      `https://storage.googleapis.com/${bucket}/`,
      ""
    );

    const [metadata] = await getPublicUploadBucket()
      .file(oldPath)
      .getMetadata();

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

    const file = execute
      ? await FileResource.makeNew(fileBlob)
      : { ...fileBlob, sId: "fil_xxxxxxxxx" };
    const newPath = `files/w/${workspace.sId}/${file.sId}/public`;

    logger.info(
      {
        workspaceId: workspace.sId,
        agentId: agentConfiguration.sId,
        oldPath,
        newPath,
      },
      "Processing agent avatar"
    );

    logger.info({ oldPath, newPath }, "moving gcs resource");
    if (execute) {
      await getPublicUploadBucket()
        .file(oldPath)
        .copy(getPublicUploadBucket().file(newPath));
    }

    const newPictureUrl = `https://storage.googleapis.com/${bucket}/${newPath}`;
    logger.info({ newPictureUrl }, "updating agent");

    if (execute) {
      await agentConfiguration.update({
        pictureUrl: newPictureUrl,
      });
    }
  }
}

makeScript(
  {
    bucket: {
      type: "string",
      describe: "The bucket to use for the avatar backfill",
      default: "dust-public-uploads",
    },
  },
  async ({ execute, bucket }, logger) => {
    return runOnAllWorkspaces(
      async (workspace) =>
        backfillAvatars(workspace, { execute, logger, bucket }),
      { concurrency: 10 }
    );
  }
);
