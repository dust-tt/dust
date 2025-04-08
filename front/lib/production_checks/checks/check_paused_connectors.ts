import { QueryTypes } from "sequelize";

import type { CheckFunction } from "@app/lib/production_checks/types";
import {
  getConnectorsPrimaryDbConnection,
  getFrontPrimaryDbConnection,
} from "@app/lib/production_checks/utils";

interface PausedConnector {
  id: number;
  workspaceId: string;
  pausedAt: Date | null;
}

interface WorkspaceSubscription {
  workspaceId: string;
  planCode: string;
}

export const checkPausedConnectors: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure
) => {
  const connectorsDb = getConnectorsPrimaryDbConnection();
  const frontDb = getFrontPrimaryDbConnection();
  const connectorsToReport: PausedConnector[] = [];

  // Get all paused connectors that have been paused for more than 15 days.
  const pausedConnectors: PausedConnector[] = await connectorsDb.query(
    `SELECT id, "workspaceId", "pausedAt" FROM connectors WHERE "pausedAt" IS NOT NULL AND "pausedAt" < NOW() - INTERVAL '15 day' and "errorType" IS NULL`,
    {
      type: QueryTypes.SELECT,
    }
  );

  // Get all workspace subscriptions for the paused connectors workspaces.
  const workspaceSubscriptions: WorkspaceSubscription[] = await frontDb.query(
    `SELECT "workspaces"."sId" AS "workspaceId", "plans"."code" AS "planCode"
      FROM "workspaces"
      LEFT JOIN "subscriptions" ON "workspaces"."id" = "subscriptions"."workspaceId"
      LEFT JOIN "plans" ON "subscriptions"."planId" = "plans"."id"
      WHERE "workspaces"."sId" IN (:workspaceIds)
      AND "subscriptions"."status" = 'active'; `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        workspaceIds: pausedConnectors.map((c) => c.workspaceId),
      },
    }
  );

  // If the connector is paused and the workspace has a valid subscription, add it to the report.
  for (const connector of pausedConnectors) {
    logger.info(
      { connector },
      "Connector is paused. Checking if worskpace has a valid subscription."
    );

    const workspaceSubscription = workspaceSubscriptions.find(
      (s) => s.workspaceId === connector.workspaceId
    );

    if (workspaceSubscription && workspaceSubscription.planCode.length) {
      connectorsToReport.push(connector);
    } else {
      logger.info(
        { connector },
        "Connector is paused but workspace has no valid subscription. Skipping."
      );
    }
  }

  // If there are any connectors to report, report a failure.
  if (connectorsToReport.length > 0) {
    reportFailure(
      { connectorsToReport },
      "Paused connectors for a workspace with a subscription for more than 15 days."
    );
  } else {
    reportSuccess({});
  }
};
