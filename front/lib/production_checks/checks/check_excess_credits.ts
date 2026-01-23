import { QueryTypes } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { getFrontReplicaDbConnection } from "@app/lib/production_checks/utils";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { ActionLink, CheckFunction } from "@app/types";

const EXCESS_ABSOLUTE_THRESHOLD_MICRO_USD = 10_000_000;
const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;
const EXCESS_PERCENTAGE_THRESHOLD = 2;

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

  // Query for workspaces with excess credits above the absolute threshold in the last 30 days.
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
          threshold: EXCESS_ABSOLUTE_THRESHOLD_MICRO_USD,
        },
      }
    );

  if (workspacesWithExcessCredits.length === 0) {
    reportSuccess();
    return;
  }

  // Fetch active credits for workspaces that exceeded the absolute threshold.
  const activeCreditsByWorkspaceSId = new Map<string, number>();
  await concurrentExecutor(
    workspacesWithExcessCredits,
    async (workspace) => {
      const auth = await Authenticator.internalAdminForWorkspace(
        workspace.workspaceSId
      );
      const activeCredits = await CreditResource.listActive(auth);
      const totalActiveCreditsMicroUsd = activeCredits.reduce(
        (sum, c) => sum + c.initialAmountMicroUsd,
        0
      );
      activeCreditsByWorkspaceSId.set(
        workspace.workspaceSId,
        totalActiveCreditsMicroUsd
      );
    },
    { concurrency: 10 }
  );

  // Filter to only include workspaces where excess exceeds the percentage threshold of active credits.
  const significantExcessWorkspaces = workspacesWithExcessCredits.filter(
    (w) => {
      const totalActiveCreditsMicroUsd =
        activeCreditsByWorkspaceSId.get(w.workspaceSId) ?? 0;
      if (totalActiveCreditsMicroUsd === 0) {
        return true;
      }
      const excessPercentage =
        (Number(w.totalExcessMicroUsd) / totalActiveCreditsMicroUsd) * 100;
      return excessPercentage > EXCESS_PERCENTAGE_THRESHOLD;
    }
  );

  if (significantExcessWorkspaces.length > 0) {
    const formattedWorkspaces = significantExcessWorkspaces.map((w) => ({
      workspaceSId: w.workspaceSId,
      workspaceName: w.workspaceName,
      totalExcessUsd: (Number(w.totalExcessMicroUsd) / 1_000_000).toFixed(2),
    }));

    const actionLinks: ActionLink[] = significantExcessWorkspaces.map((w) => ({
      label: `${w.workspaceName} ($${(Number(w.totalExcessMicroUsd) / 1_000_000).toFixed(2)})`,
      url: `/poke/${w.workspaceSId}`,
    }));

    const thresholdDollars = EXCESS_ABSOLUTE_THRESHOLD_MICRO_USD / 1_000_000;
    const message =
      `${significantExcessWorkspaces.length} workspace(s) have excess credits > $${thresholdDollars} ` +
      `(and > ${EXCESS_PERCENTAGE_THRESHOLD}% of active credits) in the last 30 days`;

    logger.warn({ workspaces: formattedWorkspaces }, message);

    reportFailure({ workspaces: formattedWorkspaces, actionLinks }, message);
  } else {
    reportSuccess();
  }
};
