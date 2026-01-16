import { Op } from "sequelize";

import { UserMetadataModel } from "@app/lib/resources/storage/models/user";
import { makeScript } from "@app/scripts/helpers";

/**
 * Migration script to delete old UserMetadataModel entries with keys starting with "toolsValidations:".
 * These entries have been migrated to UserToolApprovalModel by 20260114_migrate_low_stake_tool_approvals.ts.
 */
makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting deletion of old toolsValidations metadata entries");

  if (execute) {
    const deletedCount = await UserMetadataModel.destroy({
      where: {
        key: {
          [Op.like]: "toolsValidations:%",
        },
      },
    });
    logger.info({ deletedCount }, "Deleted old metadata entries");
  } else {
    const count = await UserMetadataModel.count({
      where: {
        key: {
          [Op.like]: "toolsValidations:%",
        },
      },
    });
    logger.info(
      { count },
      "Dry run - would delete this many old metadata entries"
    );
  }

  logger.info("Completed deletion of old toolsValidations metadata entries");
});
