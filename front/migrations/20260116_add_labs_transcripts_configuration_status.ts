import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

/**
 * Migration to add `status` column to `labs_transcripts_configuration` table
 * and migrate data from `isActive` boolean to status enum.
 *
 * This migration:
 * 1. Adds a `status` column with values: 'active', 'disabled', 'relocating'
 * 2. Migrates existing isActive=true to status='active'
 * 3. Migrates existing isActive=false to status='disabled'
 *
 * Note: The `isActive` column is removed in a separate migration
 * (20260116_remove_labs_transcripts_configuration_isActive.ts)
 */
makeScript({}, async ({ execute }, logger) => {
  // Check if status column already exists
  const [statusColumnExists] = await frontSequelize.query<{ count: number }>(
    `
    SELECT COUNT(*) as count
    FROM information_schema.columns
    WHERE table_name = 'labs_transcripts_configuration'
      AND column_name = 'status'
    `,
    { type: QueryTypes.SELECT }
  );

  if (statusColumnExists.count > 0) {
    logger.info("Status column already exists, migration already completed");
    return;
  }

  // Check if isActive column exists (source for migration)
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
    logger.error(
      "isActive column does not exist - cannot migrate. This is unexpected."
    );
    return;
  }

  // Count records to migrate
  const [countResult] = await frontSequelize.query<{ count: number }>(
    `SELECT COUNT(*) as count FROM "labs_transcripts_configuration"`,
    { type: QueryTypes.SELECT }
  );
  logger.info(`Found ${countResult.count} records to migrate`);

  // Count by isActive status
  const statusCounts = await frontSequelize.query<{
    isActive: boolean;
    count: number;
  }>(
    `SELECT "isActive", COUNT(*) as count
     FROM "labs_transcripts_configuration"
     GROUP BY "isActive"`,
    { type: QueryTypes.SELECT }
  );

  for (const row of statusCounts) {
    logger.info(`isActive=${row.isActive}: ${row.count} records`);
  }

  if (!execute) {
    logger.info("[DRY RUN] Would perform the following operations:");
    logger.info("1. Add status column with default 'disabled'");
    logger.info("2. Update status='active' where isActive=true");
    return;
  }

  // Step 1: Add status column
  logger.info("Adding status column...");
  await frontSequelize.query(`
    ALTER TABLE "labs_transcripts_configuration"
    ADD COLUMN "status" VARCHAR(255) NOT NULL DEFAULT 'disabled'
  `);
  logger.info("Status column added");

  // Step 2: Migrate isActive=true to status='active'
  logger.info("Migrating isActive=true to status='active'...");
  const [, activeUpdateResult] = await frontSequelize.query(`
    UPDATE "labs_transcripts_configuration"
    SET "status" = 'active'
    WHERE "isActive" = true
  `);
  logger.info(
    `Updated ${(activeUpdateResult as { rowCount?: number }).rowCount ?? 0} records to status='active'`
  );

  logger.info("Migration completed successfully");
});
