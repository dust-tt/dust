import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  // Check if the column already exists.
  const [columns] = await frontSequelize.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'workspace_has_domains' AND column_name = 'useCases'`,
    { type: QueryTypes.SELECT }
  );

  if (columns) {
    logger.info("Column 'useCases' already exists, skipping migration");
    return;
  }

  if (execute) {
    // Add the useCases column with default value ['sso'] for existing domains.
    await frontSequelize.query(`
      ALTER TABLE workspace_has_domains
      ADD COLUMN "useCases" VARCHAR(255)[] NOT NULL DEFAULT ARRAY['sso']::VARCHAR[]
    `);

    logger.info("Added 'useCases' column to workspace_has_domains table");

    // Verify the migration.
    const [count] = await frontSequelize.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM workspace_has_domains WHERE "useCases" IS NULL`,
      { type: QueryTypes.SELECT }
    );

    if (count && parseInt(count.count, 10) > 0) {
      throw new Error(
        `Migration failed: ${count.count} rows have NULL useCases`
      );
    }

    logger.info("Migration completed successfully");
  } else {
    logger.info(
      "Would add 'useCases' column to workspace_has_domains table with default ['sso']"
    );
  }
});
