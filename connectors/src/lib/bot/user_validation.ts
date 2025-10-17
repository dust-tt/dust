import { DustAPI } from "@dust-tt/client";

import { apiConfig } from "@connectors/lib/api/config";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types";
import { cacheWithRedis } from "@connectors/types";

function getDustAPI(dataSourceConfig: DataSourceConfig) {
  return new DustAPI(
    {
      url: apiConfig.getDustFrontAPIUrl(),
    },
    {
      apiKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
    },
    logger
  );
}

async function getActiveMemberEmails(
  connector: ConnectorResource
): Promise<string[]> {
  const ds = dataSourceConfigFromConnector(connector);

  // List the emails of all active members in the workspace.
  const dustAPI = getDustAPI(ds);

  const activeMemberEmailsRes =
    await dustAPI.getActiveMemberEmailsInWorkspace();
  if (activeMemberEmailsRes.isErr()) {
    logger.error("Error getting all members in workspace.", {
      error: activeMemberEmailsRes.error,
    });

    throw new Error("Error getting all members in workspace.");
  }

  return activeMemberEmailsRes.value;
}

export const getActiveMemberEmailsMemoized = cacheWithRedis(
  getActiveMemberEmails,
  (connector: ConnectorResource) => {
    return `active-member-emails-connector-${connector.id}`;
  },
  // Caches data for 2 minutes to limit frequent API calls.
  // Note: Updates (e.g., new members added by an admin) may take up to 2 minutes to be reflected.
  {
    ttlMs: 2 * 10 * 1000,
  }
);

export async function isActiveMemberOfWorkspace(
  connector: ConnectorResource,
  userEmail: string | undefined
): Promise<boolean> {
  if (!userEmail) {
    return false;
  }

  const workspaceActiveMemberEmails =
    await getActiveMemberEmailsMemoized(connector);

  // Case-insensitive email comparison
  return workspaceActiveMemberEmails.some(
    (memberEmail) => memberEmail.toLowerCase() === userEmail.toLowerCase()
  );
}
