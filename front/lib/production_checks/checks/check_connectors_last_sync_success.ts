import config from "@app/lib/api/config";
import {
  isBotTypeProvider,
  isWebhookBasedProvider,
} from "@app/lib/connector_providers";
import { getConnectorsPrimaryDbConnection } from "@app/lib/production_checks/utils";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { ConnectorProvider } from "@app/types/data_source";
import type { ActionLink, CheckFunction } from "@app/types/production_checks";
import { QueryTypes } from "sequelize";

// Connectors in the h1-pentest workspace, which is a test we don't want to alert on.
const IGNORED_CONNECTOR_IDS = [55901, 55902];

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface ConnectorBlob {
  id: number;
  type: ConnectorProvider;
  createdAt: Date;
  dataSourceId: string;
  workspaceId: string;
  pausedAt: Date | null;
  lastSyncSuccessfulTime: Date | null;
  lastSyncStartTime: Date | null;
}

export type ConnectorSyncFreshnessInput = Pick<
  ConnectorBlob,
  "lastSyncSuccessfulTime" | "lastSyncStartTime" | "createdAt"
>;

/**
 * Whether a connector should be treated as freshly syncing for the production
 * check. Includes a grace window after the workspace's current subscription
 * started, so workspaces that just regained a plan after a long pause do not
 * false-positive before the first post-restore sync lands.
 */
export function isConnectorSyncFresh({
  connector,
  subscriptionStartDate,
  now = Date.now(),
}: {
  connector: ConnectorSyncFreshnessInput;
  subscriptionStartDate?: Date | null;
  now?: number;
}): boolean {
  // If we have a lastSyncSuccessfulTime and it's less than a week old then we're good.
  if (
    connector.lastSyncSuccessfulTime &&
    now - connector.lastSyncSuccessfulTime.getTime() < ONE_WEEK_MS
  ) {
    return true;
  }

  // If the last sync started less than a week ago, we're good.
  if (
    connector.lastSyncStartTime &&
    now - connector.lastSyncStartTime.getTime() < ONE_WEEK_MS
  ) {
    return true;
  }

  // If the connector was created less than a week ago, we're good.
  if (now - connector.createdAt.getTime() < ONE_WEEK_MS) {
    return true;
  }

  // Newly (re)subscribed workspaces need time to resume sync after scrub pause.
  if (
    subscriptionStartDate &&
    now - subscriptionStartDate.getTime() < ONE_WEEK_MS
  ) {
    return true;
  }

  return false;
}

async function listAllConnectors() {
  const connectors: ConnectorBlob[] =
    // biome-ignore lint/plugin/noRawSql: production check uses read replica
    await getConnectorsPrimaryDbConnection().query(
      `SELECT id, "dataSourceId", "workspaceId", "pausedAt", "lastSyncSuccessfulTime", "lastSyncStartTime", "createdAt", "type" FROM connectors WHERE "errorType" IS NULL AND "pausedAt" IS NULL AND "type" <> 'webcrawler'`,
      {
        type: QueryTypes.SELECT,
      }
    );
  return connectors;
}

export const checkConnectorsLastSyncSuccess: CheckFunction = async (
  _checkName,
  _logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  const stalledLastSyncConnectors: any[] = [];
  const connectors = (await listAllConnectors()).filter(
    (connector) =>
      // Ignore webhook-based connectors, webcrawlers, and bot-type connectors
      !isWebhookBasedProvider(connector.type) &&
      !isBotTypeProvider(connector.type) &&
      connector.type !== "webcrawler" &&
      // Ignore test connectors
      !IGNORED_CONNECTOR_IDS.includes(connector.id)
  );
  heartbeat();

  // Only load subscriptions for connectors that already look stale on sync
  // timestamps / createdAt — avoids a full workspace join on the happy path.
  const potentiallyStale = connectors.filter(
    (connector) => !isConnectorSyncFresh({ connector })
  );

  const workspaceIds = [...new Set(potentiallyStale.map((c) => c.workspaceId))];
  const workspaceResources = await WorkspaceResource.fetchByIds(workspaceIds);
  const workspaces = workspaceResources.map((w) =>
    renderLightWorkspaceType({ workspace: w })
  );
  const subscriptionsByWorkspaceId =
    await SubscriptionResource.fetchActiveByWorkspaces(workspaces);

  for (const connector of potentiallyStale) {
    const subscription = subscriptionsByWorkspaceId[connector.workspaceId];
    const isFresh = isConnectorSyncFresh({
      connector,
      subscriptionStartDate: subscription?.startDate ?? null,
    });
    if (!isFresh) {
      stalledLastSyncConnectors.push({
        provider: connector.type,
        connectorId: connector.id,
        workspaceId: connector.workspaceId,
        dataSourceId: connector.dataSourceId,
        createdAt: connector.createdAt,
        lastSyncSuccessfulTime: connector.lastSyncSuccessfulTime,
        subscriptionStartDate: subscription?.startDate ?? null,
      });
    }
  }

  if (stalledLastSyncConnectors.length > 0) {
    const actionLinks: ActionLink[] = stalledLastSyncConnectors.map((c) => ({
      label: `${c.provider}: ${c.dataSourceId}`,
      url: `${config.getPokeAppUrl()}/${c.workspaceId}/data_sources/${c.dataSourceId}`,
    }));
    reportFailure(
      { stalledLastSyncConnectors, actionLinks },
      `Connectors have not synced in the last week.`
    );
  } else {
    reportSuccess();
  }
};
