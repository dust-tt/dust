import { frontSequelize } from "@app/lib/resources/storage";
import {
  AGENT_FACING_DESCRIPTION_MAX_LENGTH,
  USER_FACING_DESCRIPTION_MAX_LENGTH,
} from "@app/lib/skills/labels";
import { makeScript } from "@app/scripts/helpers";
import { QueryTypes } from "sequelize";

// Run before narrowing the SQL columns.
makeScript({}, async ({ execute }, logger) => {
  const replacements = {
    agentMaxLength: AGENT_FACING_DESCRIPTION_MAX_LENGTH,
    userMaxLength: USER_FACING_DESCRIPTION_MAX_LENGTH,
  };
  const oversized = `LENGTH("agentFacingDescription") > :agentMaxLength
                     OR LENGTH("userFacingDescription") > :userMaxLength`;

  // This one-off backfill intentionally covers both tables across all workspaces.
  for (const table of ["skill_configurations", "skill_versions"]) {
    if (!execute) {
      const [{ count }] = await frontSequelize.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM "${table}"
         WHERE ${oversized}`,
        { replacements, type: QueryTypes.SELECT }
      );
      logger.info({ table, count }, "Descriptions to truncate");
      continue;
    }

    const [, updated] = await frontSequelize.query(
      `UPDATE "${table}"
       SET "agentFacingDescription" = LEFT("agentFacingDescription", :agentMaxLength),
           "userFacingDescription" = LEFT("userFacingDescription", :userMaxLength)
       WHERE ${oversized}`,
      { replacements, type: QueryTypes.UPDATE }
    );
    logger.info({ table, updated }, "Truncated skill descriptions");
  }
});
