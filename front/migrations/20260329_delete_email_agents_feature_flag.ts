import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

const FEATURE_FLAG_NAME = "email_agents";

makeScript({}, async ({ execute }, logger) => {
  const [{ count }] = await frontSequelize.query<{ count: number }>(
    `
      SELECT COUNT(*)::int AS count
      FROM feature_flags
      WHERE name = :featureFlag
    `,
    {
      replacements: { featureFlag: FEATURE_FLAG_NAME },
      type: QueryTypes.SELECT,
    }
  );

  logger.info(
    {
      execute,
      featureFlag: FEATURE_FLAG_NAME,
      workspaceCount: count,
    },
    "Found legacy email_agents feature flags."
  );

  if (count === 0) {
    return;
  }

  if (!execute) {
    logger.info(
      {
        featureFlag: FEATURE_FLAG_NAME,
        workspaceCount: count,
      },
      "Would delete legacy email_agents feature flags."
    );
    return;
  }

  await frontSequelize.query(
    `
      DELETE FROM feature_flags
      WHERE name = :featureFlag
    `,
    {
      replacements: { featureFlag: FEATURE_FLAG_NAME },
    }
  );

  logger.info(
    {
      featureFlag: FEATURE_FLAG_NAME,
      workspaceCount: count,
    },
    "Deleted legacy email_agents feature flags."
  );
});
