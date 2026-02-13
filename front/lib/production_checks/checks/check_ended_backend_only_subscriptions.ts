import { getFrontReplicaDbConnection } from "@app/lib/production_checks/utils";
import type { ActionLink, CheckFunction } from "@app/types/production_checks";
import { QueryTypes } from "sequelize";

interface StaleEndedBackendOnlySubscription {
  sId: string;
  workspaceId: string;
  workspaceName: string;
  updatedAt: string;
}

export const checkEndedBackendOnlySubscriptions: CheckFunction = async (
  _checkName,
  _logger,
  reportSuccess,
  reportFailure
) => {
  const frontDb = getFrontReplicaDbConnection();

  const staleSubscriptions: StaleEndedBackendOnlySubscription[] =
    // eslint-disable-next-line dust/no-raw-sql -- Production check using read replica
    await frontDb.query(
      `
      SELECT
        s."sId" as "sId",
        w."sId" as "workspaceId",
        w."name" as "workspaceName",
        s."updatedAt" as "updatedAt"
      FROM subscriptions s
      JOIN workspaces w ON s."workspaceId" = w.id
      WHERE s."status" = 'ended_backend_only'
        AND s."updatedAt" < NOW() - INTERVAL '1 hour'
      ORDER BY s."updatedAt" ASC
      `,
      {
        type: QueryTypes.SELECT,
      }
    );

  if (staleSubscriptions.length > 0) {
    const actionLinks: ActionLink[] = staleSubscriptions.map((s) => ({
      label: `${s.workspaceName} (sub: ${s.sId})`,
      url: `/poke/${s.workspaceId}`,
    }));

    const message =
      `${staleSubscriptions.length} subscription(s) stuck in "ended_backend_only" status for more than 1 hour. ` +
      `Stripe webhook may have failed to process.`;

    reportFailure({ staleSubscriptions, actionLinks }, message);
  } else {
    reportSuccess();
  }
};
