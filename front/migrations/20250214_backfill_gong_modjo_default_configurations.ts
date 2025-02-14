import type { LightWorkspaceType } from "@dust-tt/types";
import { Op } from "sequelize";

import { LabsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/labs_transcripts";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

async function backfillDefaultTranscriptsConfigurations(
  workspace: LightWorkspaceType,
  {
    execute,
    logger,
  }: {
    execute: boolean;
    logger: Logger;
  }
) {
  logger.info(
    { workspaceId: workspace.sId, execute },
    "Starting labs transcripts configurations backfill"
  );
  // Get all agent with legacy avatars
  const labsTranscriptsConfigurations =
    await LabsTranscriptsConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        provider: {
          [Op.or]: ["gong", "modjo"],
        },
      },
      order: [["id", "ASC"]],
    });

  for (const transcriptsConfiguration of labsTranscriptsConfigurations) {
    logger.info(
      {
        transcriptsConfiguration,
      },
      "Processing transcripts configuration"
    );

    if (
      transcriptsConfiguration.connectionId ||
      transcriptsConfiguration.credentialId
    ) {
      await transcriptsConfiguration.update({
        isDefaultWorkspaceConfiguration: true,
      });
      logger.info(
        {
          transcriptsConfiguration,
          workspaceId: workspace.sId,
        },
        "Updated transcripts default configuration for workspace"
      );
      return;
    }
  }
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(
    async (workspace) =>
      backfillDefaultTranscriptsConfigurations(workspace, {
        execute,
        logger,
      }),
    { concurrency: 10 }
  );
});
