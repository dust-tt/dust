import type { LightWorkspaceType } from "@dust-tt/types";
import { concurrentExecutor } from "@dust-tt/types";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { DataSourceViewForConversation } from "@app/lib/resources/storage/models/data_source_view_conversation";
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
      const dataSourceViews = await DataSourceViewModel.findAll({
        where: {
          workspaceId: workspace.id,
          dataSourceId: dataSource.id,
        },
      });

      if (execute) {
        const dsvForConversations = dataSourceViews.map((view) => ({
          conversationId: dataSource.conversationId!,
          dataSourceViewId: view.id,
          workspaceId: workspace.id,
        }));

        await DataSourceViewForConversation.bulkCreate(dsvForConversations);

        logger.info(
          {
            workspaceId: workspace.sId,
            dataSourceId: dataSource.id,
            conversationId: dataSource.conversationId,
            viewCount: dataSourceViews.length,
          },
          `Created ${dsvForConversations.length} join table entries for workspace ${workspace.sId}`
        );
      } else {
        logger.info(
          {
            workspaceId: workspace.sId,
            dataSourceId: dataSource.id,
            conversationId: dataSource.conversationId,
            viewCount: dataSourceViews.length,
          },
          "Would create join table entries"
        );
      }
    },
    {
      concurrency: 10,
    }
  );

  logger.info(
    { workspaceId: workspace.sId, dataSourceCount: dataSources.length },
    "Done creating join table entries"
  );
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    await backfillDataSourceViewConversationId(workspace, logger, execute);
  });
});
