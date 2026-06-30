import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

const FEATURE_FLAG_NAME = "sandbox_tools";

makeScript({}, async ({ execute }, logger) => {
  const [{ workspaceCount }] = await frontSequelize.query<{
    workspaceCount: number;
  }>(
    `
      SELECT COUNT(*)::int AS "workspaceCount"
      FROM feature_flags
      WHERE name = :featureFlag
    `,
    {
      replacements: { featureFlag: FEATURE_FLAG_NAME },
      type: QueryTypes.SELECT,
    }
  );

  const [{ globalCount }] = await frontSequelize.query<{
    globalCount: number;
  }>(
    `
      SELECT COUNT(*)::int AS "globalCount"
      FROM global_feature_flags
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
      globalCount,
      workspaceCount,
    },
    "Found legacy sandbox_tools feature flags."
  );

  if (workspaceCount === 0 && globalCount === 0) {
    return;
  }

  if (!execute) {
    logger.info(
      {
        featureFlag: FEATURE_FLAG_NAME,
        globalCount,
        workspaceCount,
      },
      "Would delete legacy sandbox_tools feature flags."
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

  await frontSequelize.query(
    `
      DELETE FROM global_feature_flags
      WHERE name = :featureFlag
    `,
    {
      replacements: { featureFlag: FEATURE_FLAG_NAME },
    }
  );

  logger.info(
    {
      featureFlag: FEATURE_FLAG_NAME,
      globalCount,
      workspaceCount,
    },
    "Deleted legacy sandbox_tools feature flags."
  );
});
