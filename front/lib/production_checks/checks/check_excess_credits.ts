import { QueryTypes } from "sequelize";

import type { CheckFunction } from "@app/lib/production_checks/types";
import { getFrontReplicaDbConnection } from "@app/lib/production_checks/utils";

const FIFTY_DOLLARS_MICRO_USD = 50_000_000;
const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;

interface WorkspaceExcessCredits {
  workspaceId: number;
  workspaceSId: string;
  workspaceName: string;
  totalExcessMicroUsd: number;
}

export const checkExcessCredits: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure
) => {
  const frontDb = getFrontReplicaDbConnection();
  const thirtyDaysAgo = new Date(Date.now() - DAYS_30_MS);

  // Query for workspaces with excess credits > $50 in the last 30 days.
  const workspacesWithExcessCredits: WorkspaceExcessCredits[] =
    // eslint-disable-next-line dust/no-raw-sql -- Production check using read replica
    await frontDb.query(
      `
      SELECT
        c."workspaceId" as "workspaceId",
        w."sId" as "workspaceSId",
        w."name" as "workspaceName",
        SUM(c."consumedAmountMicroUsd") as "totalExcessMicroUsd"
      FROM credits c
      JOIN workspaces w ON c."workspaceId" = w.id
      WHERE c."type" = 'excess'
        AND c."startDate" >= :thirtyDaysAgo
      GROUP BY c."workspaceId", w."sId", w."name"
      HAVING SUM(c."consumedAmountMicroUsd") > :threshold
      ORDER BY SUM(c."consumedAmountMicroUsd") DESC
      `,
      {
        type: QueryTypes.SELECT,
        replacements: {
          thirtyDaysAgo: thirtyDaysAgo.toISOString(),
          threshold: FIFTY_DOLLARS_MICRO_USD,
        },
      }
    );

  if (workspacesWithExcessCredits.length > 0) {
    const formattedWorkspaces = workspacesWithExcessCredits.map((w) => ({
      workspaceSId: w.workspaceSId,
      workspaceName: w.workspaceName,
      totalExcessUsd: (Number(w.totalExcessMicroUsd) / 1_000_000).toFixed(2),
    }));

    logger.warn(
      { workspaces: formattedWorkspaces },
      `Found ${workspacesWithExcessCredits.length} workspace(s) with excess credits > $50 in the last 30 days`
    );

    reportFailure(
      { workspaces: formattedWorkspaces },
      `${workspacesWithExcessCredits.length} workspace(s) have excess credits > $50 in the last 30 days`
    );
  } else {
    reportSuccess({});
  }
};
