import { Op } from "sequelize";

import { getIdsFromSId } from "@app/lib/resources/string_ids";
import {
  UserMetadataModel,
  UserToolApprovalModel,
} from "@app/lib/resources/storage/models/user";

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
async function main() {
  console.log("Migrating low-stake tool approvals from UserMetadataModel...\n");

  const toolValidationMetadata = await UserMetadataModel.findAll({
    where: {
      key: {
        [Op.like]: "toolsValidations:%",
      },
    },
  });

  console.log(
    `Found ${toolValidationMetadata.length} tool validation metadata entries to migrate.\n`
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
      console.log(
        `Skipping empty metadata entry for user ${metadata.userId}, mcpServerId ${mcpServerId}`
      );
      skippedCount++;
      continue;
    }

    // Extract workspace ID from the mcpServerId (e.g., ims_xxxx encodes workspace ID).
    const idsResult = getIdsFromSId(mcpServerId);
    if (idsResult.isErr()) {
      console.log(
        `Skipping invalid mcpServerId ${mcpServerId} for user ${metadata.userId}: ${idsResult.error.message}`
      );
      skippedCount++;
      continue;
    }

    const { workspaceModelId } = idsResult.value;

    console.log(
      `Migrating ${toolNames.length} tool approvals for user ${metadata.userId}, mcpServerId ${mcpServerId}, workspace ${workspaceModelId}`
    );

    for (const toolName of toolNames) {
      try {
        await UserToolApprovalModel.upsert({
          workspaceId: workspaceModelId,
          userId: metadata.userId,
          mcpServerId,
          toolName,
          agentId: "",
          argsAndValues: null,
          argsAndValuesMd5: "",
        });
        migratedCount++;
      } catch (error) {
        console.error(
          `Error migrating tool approval for user ${metadata.userId}, workspace ${workspaceModelId}, mcpServerId ${mcpServerId}, toolName ${toolName}:`,
          error
        );
        errorCount++;
      }
    }
  }

  console.log(`\nMigration results:`);
  console.log(`  - Migrated: ${migratedCount} tool approval entries`);
  console.log(`  - Skipped: ${skippedCount} metadata entries`);
  console.log(`  - Errors: ${errorCount}`);

  // Delete the old metadata entries.
  console.log("\nDeleting old metadata entries...");

  const deletedCount = await UserMetadataModel.destroy({
    where: {
      key: {
        [Op.like]: "toolsValidations:%",
      },
    },
  });

  console.log(`Deleted ${deletedCount} old metadata entries.`);
}

main()
  .then(() => {
    console.log("\nDone.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
