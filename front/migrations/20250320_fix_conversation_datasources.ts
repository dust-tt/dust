import { QueryTypes } from "sequelize";

import { hardDeleteDataSource } from "@app/lib/api/data_sources";
import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import { Authenticator } from "@app/lib/auth";
import { Conversation } from "@app/lib/models/assistant/conversation";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { FileModel } from "@app/lib/resources/storage/models/files";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

interface DuplicateConversation {
  conversationId: number;
  workspaceId: number;
  datasource_ids: string[];
}

const worker = async ({ execute }: { execute: boolean }) => {
  // Find all conversations with multiple datasources
  const duplicateConversations =
    await frontSequelize.query<DuplicateConversation>(
      `
SELECT 
    "conversationId",
    "workspaceId",
    array_agg("id") as datasource_ids
FROM 
    data_sources
WHERE 
    "deletedAt" IS NULL AND "conversationId" is not null
GROUP BY 
    "workspaceId",
    "conversationId"
HAVING 
    COUNT(*) > 1
  `,
      { type: QueryTypes.SELECT }
    );

  console.log(duplicateConversations);

  if (duplicateConversations.length === 0) {
    logger.info("No conversations with duplicate datasources found");
    return;
  }

  logger.info(
    { duplicateCount: duplicateConversations.length },
    "Found conversations with duplicate datasources"
  );

  for (const conv of duplicateConversations) {
    const conversationId = conv.conversationId;
    const workspaceId = conv.workspaceId;
    const datasourceIds = conv.datasource_ids.sort();
    const firstDatasourceId = parseInt(datasourceIds[0], 10);

    logger.info(
      {
        conversationId,
        datasourceCount: datasourceIds.length,
        firstDatasourceId,
        dryRun: !execute,
      },
      execute ? "Processing conversation" : "Would process conversation"
    );

    const workspace = await Workspace.findByPk(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Could not find workspace");
      continue;
    }

    // Get conversation
    const conversation = await Conversation.findByPk(conversationId);

    if (!conversation) {
      logger.error({ conversationId }, "Could not find conversation");
      continue;
    }

    if (!execute) {
      // Dry run - show what would happen
      const files = await FileModel.findAll({
        where: {
          workspaceId: workspace.id,
          useCase: "conversation",
          useCaseMetadata: {
            conversationId: conversation.sId,
          },
        },
      });

      logger.info(
        {
          conversationId,
          workspaceId,
          fileCount: files.length,
          datasourcesToDelete: datasourceIds.slice(1),
          dryRun: true,
        },
        `Process ${files.length} files to datasource ${firstDatasourceId}. Delete ${datasourceIds.length - 1} duplicate datasources: ${datasourceIds.slice(1).join(", ")}`
      );
      continue;
    }

    // First create a temporary auth to fetch the first datasource
    const tempAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    // Get workspace from first datasource to create auth
    const firstDataSource = await DataSourceResource.fetchByModelIdWithAuth(
      tempAuth,
      firstDatasourceId
    );
    if (!firstDataSource) {
      logger.error(
        { conversationId, firstDatasourceId },
        "Could not find first datasource"
      );
      continue;
    }

    // Find all files for this conversation
    const files = await FileModel.findAll({
      where: {
        workspaceId: workspace.id,
        useCaseMetadata: {
          conversationId: conversation.sId,
        },
      },
    });

    logger.info(
      { conversationId, fileCount: files.length },
      "Found files for conversation"
    );

    // Process each file to the first datasource
    for (const file of files) {
      try {
        const fileResource = new FileResource(FileResource.model, file.get());
        const res = await processAndUpsertToDataSource(
          tempAuth,
          firstDataSource,
          {
            file: fileResource,
          }
        );

        if (res.isErr()) {
          logger.error(
            {
              conversationId,
              fileId: file.id,
              error: res.error,
            },
            "Failed to process file"
          );
          continue;
        }

        logger.info(
          { conversationId, fileId: file.id },
          "Successfully processed file"
        );
      } catch (error) {
        logger.error(
          { conversationId, fileId: file.id, error },
          "Error processing file"
        );
      }
    }

    // Delete all other datasources
    for (const dsId of datasourceIds.slice(1)) {
      try {
        const ds = await DataSourceResource.fetchByModelIdWithAuth(
          tempAuth,
          parseInt(dsId, 10)
        );
        if (!ds) {
          logger.warn({ dsId }, "Could not find datasource to delete");
          continue;
        }

        await hardDeleteDataSource(tempAuth, ds);
        logger.info({ dsId }, "Successfully deleted duplicate datasource");
      } catch (error) {
        logger.error({ dsId, error }, "Error deleting duplicate datasource");
      }
    }
  }
};

makeScript({}, worker);

export const up = worker;

export const down = async () => {
  // This migration cannot be reversed as it deletes data
  logger.info("This migration cannot be reversed");
};
