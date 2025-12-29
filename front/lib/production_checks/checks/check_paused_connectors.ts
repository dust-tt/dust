import { QueryTypes } from "sequelize";

import { isUpgraded } from "@app/lib/plans/plan_codes";
import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { ActionLink, CheckFunction } from "@app/types";

interface PausedConnector {
  id: number;
  workspaceId: string;
  pausedAt: Date | null;
}

export const checkPausedConnectors: CheckFunction = async (
  _checkName,
  logger,
  reportSuccess,
  reportFailure
) => {
  const connectorsDb = getConnectorsPrimaryDbConnection();
  const connectorsToReport: PausedConnector[] = [];

  // Get all paused connectors that have been paused for more than 15 days.
  const pausedConnectors: PausedConnector[] = await connectorsDb.query(
    `SELECT id, "workspaceId", "pausedAt" FROM connectors WHERE "pausedAt" IS NOT NULL AND "pausedAt" < NOW() - INTERVAL '15 day' and "errorType" IS NULL`,
    {
      type: QueryTypes.SELECT,
    }
  );

  const workspaceIds = [...new Set(pausedConnectors.map((c) => c.workspaceId))];
  const workspaceResources = await WorkspaceResource.fetchByIds(workspaceIds);
  const workspaces = workspaceResources
    .map((w) => renderLightWorkspaceType({ workspace: w }))
    .filter((w) => !w.metadata?.maintenance); // Exclude workspaces in maintenance mode (relocation or relocation done).

  const subscriptionByWorkspaceSId =
    await SubscriptionResource.fetchActiveByWorkspaces(workspaces);

  // If the connector is paused and the workspace has a valid subscription, add it to the report.
  for (const connector of pausedConnectors) {
    logger.info(
      { connector },
      "Connector is paused. Checking if workspace has a valid subscription."
    );

    const subscription = subscriptionByWorkspaceSId[connector.workspaceId];

    if (subscription && isUpgraded(subscription.getPlan())) {
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
    const actionLinks: ActionLink[] = connectorsToReport.map((c) => ({
      label: `Workspace: ${c.workspaceId}`,
      url: `/poke/${c.workspaceId}`,
    }));
    reportFailure(
      { connectorsToReport, actionLinks },
      "Paused connectors for a workspace with a subscription for more than 15 days."
    );
  } else {
    reportSuccess({ actionLinks: [] });
  }
};
