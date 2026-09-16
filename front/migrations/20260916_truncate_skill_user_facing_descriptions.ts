import { frontSequelize } from "@app/lib/resources/storage";
import { USER_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import { makeScript } from "@app/scripts/helpers";
import { QueryTypes } from "sequelize";

// Run after deploying backend truncation and before narrowing the SQL columns.
makeScript({}, async ({ execute }, logger) => {
  const replacements = { maxLength: USER_FACING_DESCRIPTION_MAX_LENGTH };

  // This one-off backfill intentionally covers both tables across all workspaces.
  for (const table of ["skill_configurations", "skill_versions"]) {
    if (!execute) {
      const [{ count }] = await frontSequelize.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM "${table}"
         WHERE LENGTH("userFacingDescription") > :maxLength`,
        { replacements, type: QueryTypes.SELECT }
      );
      logger.info({ table, count }, "Descriptions to truncate");
      continue;
    }

    const [, updated] = await frontSequelize.query(
      `UPDATE "${table}"
       SET "userFacingDescription" = LEFT("userFacingDescription", :maxLength)
       WHERE LENGTH("userFacingDescription") > :maxLength`,
      { replacements, type: QueryTypes.UPDATE }
    );
    logger.info({ table, updated }, "Truncated skill descriptions");
  }
});
