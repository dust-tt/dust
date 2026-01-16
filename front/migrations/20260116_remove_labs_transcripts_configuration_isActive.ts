import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

/**
 * Migration to remove the deprecated `isActive` column from
 * `labs_transcripts_configuration` table.
 *
 * This migration should only be run after:
 * 1. The `status` column has been added (20260116_add_labs_transcripts_configuration_status.ts)
 * 2. All code has been updated to use `status` instead of `isActive`
 * 3. The deployment with the new code is stable
 */
makeScript({}, async ({ execute }, logger) => {
  // Check if isActive column exists
  const [isActiveColumnExists] = await frontSequelize.query<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM information_schema.columns
    WHERE table_name = 'labs_transcripts_configuration'
      AND column_name = 'isActive'
    `,
    { type: QueryTypes.SELECT }
  );

  if (isActiveColumnExists.count === 0) {
    logger.info("isActive column does not exist, migration already completed");
    return;
  }

  // Check if status column exists (prerequisite)
  const [statusColumnExists] = await frontSequelize.query<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM information_schema.columns
    WHERE table_name = 'labs_transcripts_configuration'
      AND column_name = 'status'
    `,
    { type: QueryTypes.SELECT }
  );

  if (statusColumnExists.count === 0) {
    logger.error(
      "status column does not exist - run 20260116_add_labs_transcripts_configuration_status.ts first"
    );
    return;
  }

  // Count records
  const [countResult] = await frontSequelize.query<{ count: number }>(
    `SELECT COUNT(*) as count FROM "labs_transcripts_configuration"`,
    { type: QueryTypes.SELECT }
  );
  logger.info(`Found ${countResult.count} records in table`);

  if (!execute) {
    logger.info("[DRY RUN] Would drop isActive column");
    return;
  }

  // Drop isActive column
  logger.info("Dropping isActive column...");
  await frontSequelize.query(`
    ALTER TABLE "labs_transcripts_configuration"
    DROP COLUMN "isActive"
  `);
  logger.info("isActive column dropped");

  logger.info("Migration completed successfully");
});
