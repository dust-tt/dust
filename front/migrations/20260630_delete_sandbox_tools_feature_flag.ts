import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";

const FEATURE_FLAG_NAME = "sandbox_tools";

type LegacyWorkspaceFeatureFlagRow = {
  id: number;
  workspaceId: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type LegacyGlobalFeatureFlagRow = {
  id: number;
  name: string;
  rolloutPercentage: number;
  createdAt: Date;
  updatedAt: Date;
};

makeScript({}, async ({ execute }, logger) => {
  const workspaceRows =
    await frontSequelize.query<LegacyWorkspaceFeatureFlagRow>(
      `
        SELECT id, "workspaceId", name, "createdAt", "updatedAt"
        FROM feature_flags
        WHERE name = :featureFlag
        ORDER BY id
      `,
      {
        replacements: { featureFlag: FEATURE_FLAG_NAME },
        type: QueryTypes.SELECT,
      }
    );

  const globalRows = await frontSequelize.query<LegacyGlobalFeatureFlagRow>(
    `
      SELECT id, name, "rolloutPercentage", "createdAt", "updatedAt"
      FROM global_feature_flags
      WHERE name = :featureFlag
      ORDER BY id
    `,
    {
      replacements: { featureFlag: FEATURE_FLAG_NAME },
      type: QueryTypes.SELECT,
    }
  );

  const workspaceCount = workspaceRows.length;
  const globalCount = globalRows.length;

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
        globalRows,
        workspaceCount,
        workspaceRows,
      },
      "Would delete legacy sandbox_tools feature flags. Save these rows for rollback before running with --execute."
    );
    return;
  }

  await frontSequelize.transaction(async (transaction) => {
    await frontSequelize.query(
      `
        DELETE FROM feature_flags
        WHERE name = :featureFlag
      `,
      {
        replacements: { featureFlag: FEATURE_FLAG_NAME },
        transaction,
      }
    );

    await frontSequelize.query(
      `
        DELETE FROM global_feature_flags
        WHERE name = :featureFlag
      `,
      {
        replacements: { featureFlag: FEATURE_FLAG_NAME },
        transaction,
      }
    );
  });

  const [{ remainingWorkspaceCount }] = await frontSequelize.query<{
    remainingWorkspaceCount: number;
  }>(
    `
      SELECT COUNT(*)::int AS "remainingWorkspaceCount"
      FROM feature_flags
      WHERE name = :featureFlag
    `,
    {
      replacements: { featureFlag: FEATURE_FLAG_NAME },
      type: QueryTypes.SELECT,
    }
  );

  const [{ remainingGlobalCount }] = await frontSequelize.query<{
    remainingGlobalCount: number;
  }>(
    `
      SELECT COUNT(*)::int AS "remainingGlobalCount"
      FROM global_feature_flags
      WHERE name = :featureFlag
    `,
    {
      replacements: { featureFlag: FEATURE_FLAG_NAME },
      type: QueryTypes.SELECT,
    }
  );

  if (remainingWorkspaceCount > 0 || remainingGlobalCount > 0) {
    throw new Error(
      `Failed to delete all legacy ${FEATURE_FLAG_NAME} rows: ` +
        `${remainingWorkspaceCount} workspace rows and ` +
        `${remainingGlobalCount} global rows remain.`
    );
  }

  logger.info(
    {
      featureFlag: FEATURE_FLAG_NAME,
      globalCount,
      remainingGlobalCount,
      remainingWorkspaceCount,
      workspaceCount,
    },
    "Deleted legacy sandbox_tools feature flags."
  );
});
