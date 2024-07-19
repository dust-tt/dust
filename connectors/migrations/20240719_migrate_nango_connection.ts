import type {
  MigratedCredentialsType,
  ModelId,
  OAuthAPIError,
  OAuthProvider,
  Result,
} from "@dust-tt/types";
import { Err, isOAuthProvider, OAuthAPI, Ok } from "@dust-tt/types";
import { promises as fs } from "fs";
import { makeScript } from "scripts/helpers";

import { apiConfig } from "@connectors/lib/api/config";
import type { NangoConnectionResponse } from "@connectors/lib/nango_helpers";
import { getConnectionFromNango } from "@connectors/lib/nango_helpers";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const USE_CASE = "connection";
const {
  NANGO_CONFLUENCE_CONNECTOR_ID = "",
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "",
  NANGO_SLACK_CONNECTOR_ID = "",
  NANGO_NOTION_CONNECTOR_ID = "",
  NANGO_INTERCOM_CONNECTOR_ID = "",
  NANGO_GONG_CONNECTOR_ID = "",
} = process.env;

const NANGO_CONNECTOR_IDS: Record<string, string> = {
  confluence: NANGO_CONFLUENCE_CONNECTOR_ID,
  google_drive: NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
  slack: NANGO_SLACK_CONNECTOR_ID,
  notion: NANGO_NOTION_CONNECTOR_ID,
  intercom: NANGO_INTERCOM_CONNECTOR_ID,
  gong: NANGO_GONG_CONNECTOR_ID,
};

async function appendRollbackCommand(
  provider: OAuthProvider,
  connectorId: ModelId,
  oldConnectionId: string
) {
  const sql = `UPDATE connectors SET "connectionId" = '${oldConnectionId}' WHERE id = ${connectorId};\n`;
  await fs.appendFile(`${provider}_rollback_commands.sql`, sql);
}

function getRedirectUri(provider: OAuthProvider): string {
  return `${apiConfig.getDustAPIConfig().url}/oauth/${provider}/finalize`;
}

async function migrateConnectionId(
  api: OAuthAPI,
  provider: OAuthProvider,
  connector: ConnectorResource,
  logger: Logger,
  execute: boolean
): Promise<Result<void, Error | OAuthAPIError>> {
  logger.info(
    `Migrating connection id for connector ${connector.id}, current connectionId ${connector.connectionId}.`
  );

  const integrationId = NANGO_CONNECTOR_IDS[provider];
  if (!integrationId) {
    return new Err(new Error("Nango integration ID not found for provider"));
  }

  // Retrieve connection from nango.
  let connection: NangoConnectionResponse | null = null;
  try {
    connection = await getConnectionFromNango({
      connectionId: connector.connectionId,
      integrationId,
      refreshToken: true,
      useCache: false,
    });
  } catch (e) {
    return new Err(new Error(`Nango error: ${e}`));
  }

  console.log(
    ">>>>>>>>>>>>>>>>>>>>>>>>>>> BEG CONNECTION <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
  );
  console.log(connection);
  console.log(
    ">>>>>>>>>>>>>>>>>>>>>>>>>>> END CONNECTION <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
  );

  if (!connection.credentials.access_token) {
    return new Err(new Error("Could not retrieve `access_token` from Nango"));
  }

  // We don't have authorization codes from Nango
  const migratedCredentials: MigratedCredentialsType = {
    redirect_uri: getRedirectUri(provider),
    access_token: connection.credentials.access_token,
    raw_json: connection.credentials.raw,
  };

  // Below is to be tested with a provider that has refresh tokens

  // if (connection.credentials.expires_at) {
  //   migratedCredentials.access_token_expiry = Date.parse(
  //     connection.credentials.expires_at
  //   );
  // }
  // if (connection.credentials.refresh_token) {
  //   migratedCredentials.refresh_token = connection.credentials.refresh_token;
  // }

  // End has to be tested

  console.log(
    ">>>>>>>>>>>>>>>>>>>>>>>>>>> BEG MIGRATED_CREDENTIALS <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
  );
  console.log(migratedCredentials);
  console.log(
    ">>>>>>>>>>>>>>>>>>>>>>>>>>> END MIGRATED_CREDENTIALS <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
  );

  if (!execute) {
    return new Ok(undefined);
  }

  // Save the old connectionId for rollback.
  const oldConnectionId = connector.connectionId;

  // Create the connection with migratedCredentials.
  const cRes = await api.createConnection({
    provider,
    metadata: {
      use_case: USE_CASE,
      workspace_id: connector.workspaceId,
      origin: "migrated",
    },
    migratedCredentials,
  });

  if (cRes.isErr()) {
    return cRes;
  }

  const newConnectionId = cRes.value.connection.connection_id;

  // Append rollback command after successful update.
  await appendRollbackCommand(provider, connector.id, oldConnectionId);

  await connector.update({
    connectionId: newConnectionId,
  });

  logger.info(
    `Successfully migrated connection id for connector ${connector.id}, new connectionId ${newConnectionId}.`
  );

  return new Ok(undefined);
}

async function migrateAllConnections(
  provider: OAuthProvider,
  connectorId: ModelId | undefined,
  logger: Logger,
  execute: boolean
) {
  const api = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);

  const connectors = connectorId
    ? await ConnectorResource.fetchByIds(provider, [connectorId])
    : await ConnectorResource.listByType(provider, {});

  logger.info(`Found ${connectors.length} ${provider} connectors to migrate.`);

  for (const connector of connectors) {
    const localLogger = logger.child({
      connectorId: connector.id,
      workspaceId: connector.workspaceId,
    });

    const migrationRes = await migrateConnectionId(
      api,
      provider,
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
    provider: {
      alias: "p",
      describe: "OAuth provider to migrate",
      type: "string",
    },
  },
  async ({ provider, connectorId, execute }, logger) => {
    if (isOAuthProvider(provider)) {
      await migrateAllConnections(provider, connectorId, logger, execute);
    } else {
      logger.error(
        {
          provider,
        },
        "Invalid provider provided"
      );
    }
  }
);
