import type { ModelId, OAuthAPIError, Result } from "@dust-tt/types";
import { OAuthAPI, Ok } from "@dust-tt/types";
import { promises as fs } from "fs";
import { makeScript } from "scripts/helpers";

import { apiConfig } from "@connectors/lib/api/config";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const PROVIDER = "github";
const USE_CASE = "connection";

async function appendRollbackCommand(
  connectorId: ModelId,
  oldConnectionId: string
) {
  const sql = `UPDATE connectors SET connectionId = '${oldConnectionId}' WHERE id = '${connectorId}';\n`;
  await fs.appendFile(`${PROVIDER}_rollback_commands.sql`, sql);
}

function getRedirectUri(): string {
  return `${apiConfig.getDustAPIConfig().url}/oauth/${PROVIDER}/finalize`;
}

async function migrateGithubConnectionId(
  api: OAuthAPI,
  connector: ConnectorResource,
  logger: Logger,
  execute: boolean
): Promise<Result<void, OAuthAPIError>> {
  logger.info(
    `Migrating connection id for connector ${connector.id}, current connectionId ${connector.connectionId}.`
  );
  if (!execute) {
    return new Ok(undefined);
  }

  // Save the old connectionId for rollback.
  const oldConnectionId = connector.connectionId;

  // First, we create the connection.
  const cRes = await api.createConnection({
    provider: PROVIDER,
    metadata: {
      use_case: USE_CASE,
      workspace_id: connector.workspaceId,
      origin: "migrated",
    },
  });

  if (cRes.isErr()) {
    return cRes;
  }

  const newConnectionId = cRes.value.connection.connection_id;

  // Then we finalize the connection.
  const fRes = await api.finalizeConnection({
    provider: PROVIDER,
    connectionId: newConnectionId,
    code: connector.connectionId,
    redirectUri: getRedirectUri(),
  });

  if (fRes.isErr()) {
    return fRes;
  }

  // Append rollback command after successful update.
  await appendRollbackCommand(connector.id, oldConnectionId);

  await connector.update({
    connectionId: newConnectionId,
  });

  logger.info(
    `Successfully migrated connection id for connector ${connector.id}, new connectionId ${newConnectionId}.`
  );

  return new Ok(undefined);
}

async function migrateAllGithubConnections(
  connectorId: ModelId | undefined,
  logger: Logger,
  execute: boolean
) {
  const api = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);

  const connectors = connectorId
    ? await ConnectorResource.fetchByIds(PROVIDER, [connectorId])
    : await ConnectorResource.listByType(PROVIDER, {});

  logger.info(`Found ${connectors.length} GitHub connectors to migrate.`);

  for (const connector of connectors) {
    const localLogger = logger.child({
      connectorId: connector.id,
      workspaceId: connector.workspaceId,
    });

    const migrationRes = await migrateGithubConnectionId(
      api,
      connector,
      localLogger,
      execute
    );
    if (migrationRes.isErr()) {
      localLogger.error(
        {
          error: migrationRes.error,
        },
        "Failed to migrate connector. Exiting."
      );
    }
  }

  logger.info(`Done migrating GitHub connectors.`);
}

makeScript(
  {
    connectorId: {
      alias: "c",
      describe: "Connector ID",
      type: "number",
    },
  },
  async ({ connectorId, execute }, logger) => {
    await migrateAllGithubConnections(connectorId, logger, execute);
  }
);
