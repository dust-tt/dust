import { Op } from "sequelize";

import { UserMetadataModel } from "@app/lib/resources/storage/models/user";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

/**
 * Migrates user_metadata records from the old workspace prefix pattern to the new workspaceId field.
 * Old format: key = "workspace:abc123:favorite_platforms"
 * New format: key = "favorite_platforms", workspaceId = <numeric id of workspace abc123>
 */
async function migrateWorkspacePrefixedMetadata(
  logger: Logger,
  execute: boolean
): Promise<void> {
  logger.info(
    { execute },
    "Starting migration of workspace-prefixed metadata to workspaceId field"
  );

  // Find all metadata records with keys starting with "workspace:"
  const prefixedMetadata = await UserMetadataModel.findAll({
    where: {
      key: {
        [Op.like]: "workspace:%:%",
      },
    },
  });

  logger.info(
    { count: prefixedMetadata.length },
    "Found metadata records to migrate"
  );

  if (prefixedMetadata.length === 0) {
    logger.info("No metadata records to migrate");
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ metadataId: number; key: string; error: string }> = [];

  for (const metadata of prefixedMetadata) {
    try {
      // Parse the key: "workspace:abc123:favorite_platforms"
      const keyParts = metadata.key.split(":");
      if (keyParts.length < 3 || keyParts[0] !== "workspace") {
        logger.warn(
          { metadataId: metadata.id, key: metadata.key },
          "Invalid workspace-prefixed key format, skipping"
        );
        errorCount++;
        errors.push({
          metadataId: metadata.id,
          key: metadata.key,
          error: "Invalid format",
        });
        continue;
      }

      const workspaceSId = keyParts[1];
      const actualKey = keyParts.slice(2).join(":"); // Handle keys that might have colons

      // Find the workspace by sId
      const workspace = await WorkspaceModel.findOne({
        where: { sId: workspaceSId },
        attributes: ["id", "sId"],
      });

      if (!workspace) {
        logger.warn(
          {
            metadataId: metadata.id,
            key: metadata.key,
            workspaceSId,
          },
          "Workspace not found for metadata, skipping"
        );
        errorCount++;
        errors.push({
          metadataId: metadata.id,
          key: metadata.key,
          error: `Workspace ${workspaceSId} not found`,
        });
        continue;
      }

      // Check if a record with the new format already exists
      const existingMetadata = await UserMetadataModel.findOne({
        where: {
          userId: metadata.userId,
          key: actualKey,
          workspaceId: workspace.id,
        },
      });

      if (existingMetadata) {
        logger.warn(
          {
            metadataId: metadata.id,
            existingMetadataId: existingMetadata.id,
            key: metadata.key,
            actualKey,
            workspaceId: workspace.id,
          },
          "Metadata with new format already exists, deleting old format"
        );

        if (execute) {
          // Delete the old prefixed version since the new one already exists
          await metadata.destroy();
        }

        successCount++;
        continue;
      }

      logger.info(
        {
          metadataId: metadata.id,
          userId: metadata.userId,
          oldKey: metadata.key,
          newKey: actualKey,
          workspaceSId,
          workspaceId: workspace.id,
        },
        execute ? "Migrating metadata" : "Would migrate metadata"
      );

      if (execute) {
        // Update the record with the new format
        await metadata.update({
          key: actualKey,
          workspaceId: workspace.id,
        });
      }

      successCount++;
    } catch (error) {
      logger.error(
        {
          metadataId: metadata.id,
          key: metadata.key,
          error,
        },
        "Failed to migrate metadata record"
      );
      errorCount++;
      errors.push({
        metadataId: metadata.id,
        key: metadata.key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info(
    {
      total: prefixedMetadata.length,
      success: successCount,
      errors: errorCount,
    },
    "Migration completed"
  );

  if (errors.length > 0) {
    logger.warn(
      { errors: errors.slice(0, 10) },
      `Migration had ${errors.length} errors (showing first 10)`
    );
  }
}

makeScript({}, async ({ execute }, logger) => {
  await migrateWorkspacePrefixedMetadata(logger, execute);
});
