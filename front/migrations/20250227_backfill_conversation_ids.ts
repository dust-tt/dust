import type { LightWorkspaceType } from "@dust-tt/types";
import { concurrentExecutor } from "@dust-tt/types";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

async function backfillDataSourceViewConversationId(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Get the conversations space
  const conversationsSpace =
    await SpaceResource.fetchWorkspaceConversationsSpace(auth);
  if (!conversationsSpace) {
    logger.info({ workspaceId: workspace.sId }, "No conversations space found");
    return;
  }

  // Find all dataSources in conversations space with a conversationId
  const dataSources: DataSourceModel[] = await DataSourceModel.findAll({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    where: {
      workspaceId: workspace.id,
      vaultId: conversationsSpace.id,
      conversationId: {
        [Op.not]: null,
      },
    },
  });

  logger.info(
    { workspaceId: workspace.sId, count: dataSources.length },
    "Found dataSources in conversation vault"
  );

  await concurrentExecutor(
    dataSources,
    async (dataSource) => {
      if (execute) {
        const [updatedCount] = await DataSourceViewModel.update(
          {
            conversationId: dataSource.conversationId,
          },
          {
            where: {
              workspaceId: workspace.id,
              dataSourceId: dataSource.id,
            },
          }
        );

        logger.info(
          {
            workspaceId: workspace.sId,
            dataSourceId: dataSource.id,
            conversationId: dataSource.conversationId,
            updatedCount,
          },
          "Updated dataSourceViews"
        );
      } else {
        logger.info(
          {
            workspaceId: workspace.sId,
            dataSourceId: dataSource.id,
            conversationId: dataSource.conversationId,
          },
          "Would update dataSourceViews"
        );
      }
    },
    {
      concurrency: 10,
    }
  );

  logger.info(
    { workspaceId: workspace.sId, dataSourceCount: dataSources.length },
    "Done updating dataSourceViews"
  );
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    await backfillDataSourceViewConversationId(workspace, logger, execute);
  });
});
