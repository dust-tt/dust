import { Op } from "sequelize";

import { getIdsFromSId } from "@app/lib/resources/string_ids";
import {
  UserMetadataModel,
  UserToolApprovalModel,
} from "@app/lib/resources/storage/models/user";
import { makeScript } from "@app/scripts/helpers";

const COMMA_SEPARATOR = ",";
const COMMA_REPLACEMENT = "DUST_COMMA";

/**
 * Migration script to:
 * 1. Move low-stake tool approvals from UserMetadataModel to UserToolApprovalModel
 * 2. Delete old UserMetadataModel entries
 *
 * The workspace ID is extracted from the mcpServerId (e.g., ims_...) which encodes
 * the workspace ID in the string ID.
 */
makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting low-stake tool approvals migration");

  const toolValidationMetadata = await UserMetadataModel.findAll({
    where: {
      key: {
        [Op.like]: "toolsValidations:%",
      },
    },
  });

  logger.info(
    { count: toolValidationMetadata.length },
    "Found tool validation metadata entries to migrate"
  );

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const metadata of toolValidationMetadata) {
    const mcpServerId = metadata.key.replace("toolsValidations:", "");
    const toolNames = metadata.value
      .split(COMMA_SEPARATOR)
      .map((v) => v.replaceAll(COMMA_REPLACEMENT, ","))
      .filter((name) => name.length > 0);

    if (toolNames.length === 0) {
      logger.info(
        { userId: metadata.userId, mcpServerId },
        "Skipping empty metadata entry"
      );
      skippedCount++;
      continue;
    }

    // Extract workspace ID from the mcpServerId (e.g., ims_xxxx encodes workspace ID).
    const idsResult = getIdsFromSId(mcpServerId);
    if (idsResult.isErr()) {
      logger.info(
        {
          userId: metadata.userId,
          mcpServerId,
          error: idsResult.error.message,
        },
        "Skipping invalid mcpServerId"
      );
      skippedCount++;
      continue;
    }

    const { workspaceModelId } = idsResult.value;

    logger.info(
      {
        userId: metadata.userId,
        mcpServerId,
        workspaceId: workspaceModelId,
        toolCount: toolNames.length,
      },
      "Migrating tool approvals"
    );

    for (const toolName of toolNames) {
      try {
        if (execute) {
          await UserToolApprovalModel.create({
            workspaceId: workspaceModelId,
            userId: metadata.userId,
            mcpServerId,
            toolName,
            agentId: null,
            argsAndValues: null,
            argsAndValuesMd5: null,
          });
        }
        migratedCount++;
      } catch (error) {
        logger.error(
          {
            userId: metadata.userId,
            workspaceId: workspaceModelId,
            mcpServerId,
            toolName,
            error,
          },
          "Error migrating tool approval"
        );
        errorCount++;
      }
    }
  }

  logger.info({ migratedCount, skippedCount, errorCount }, "Migration results");
  logger.info("Low-stake tool approvals migration completed");
});
