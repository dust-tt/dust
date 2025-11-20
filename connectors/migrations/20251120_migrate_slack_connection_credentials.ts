import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { makeScript } from "scripts/helpers";

import { apiConfig } from "@connectors/lib/api/config";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId, OAuthAPIError } from "@connectors/types";
import { OAuthAPI } from "@connectors/types";

const PROVIDER = "slack";

async function migrateSlackConnectionCredential(
  api: OAuthAPI,
  connector: ConnectorResource,
  slackClientId: string,
  slackClientSecret: string,
  slackSigningSecret: string,
  logger: Logger,
  execute: boolean
): Promise<Result<void, OAuthAPIError>> {
  logger.info(
    `Migrating connection credential for connector ${connector.id}, connectionId ${connector.connectionId}.`
  );

  if (!execute) {
    logger.info(
      `[DRY RUN] Would create credential and update connection ${connector.connectionId}.`
    );
    return new Ok(undefined);
  }

  // Get connection metadata to extract user_id
  const metadataRes = await api.getConnectionMetadata({
    connectionId: connector.connectionId,
  });

  if (metadataRes.isErr()) {
    logger.error(
      { error: metadataRes.error },
      "Failed to fetch connection metadata."
    );
    return metadataRes;
  }

  const userId = metadataRes.value.connection.metadata.user_id;

  if (typeof userId !== "string" || userId.length === 0) {
    return new Err({
      code: "missing_user_id",
      message: `Connection ${connector.connectionId} has no user_id in metadata.`,
    });
  }

  logger.info({ userId }, "Using user_id from connection metadata.");

  // Create a credential record for this connection
  const credRes = await api.postCredentials({
    provider: PROVIDER,
    userId,
    workspaceId: connector.workspaceId,
    credentials: {
      client_id: slackClientId,
      client_secret: slackClientSecret,
      signing_secret: slackSigningSecret,
    },
  });

  if (credRes.isErr()) {
    return credRes;
  }

  const credentialId = credRes.value.credential.credential_id;
  logger.info(
    { credentialId },
    `Created credential for connector ${connector.id}.`
  );

  // Update the connection to reference this credential
  const updateRes = await api.updateConnectionCredential({
    connectionId: connector.connectionId,
    relatedCredentialId: credentialId,
  });

  if (updateRes.isErr()) {
    return updateRes;
  }

  logger.info(
    `Successfully updated connection ${connector.connectionId} to use credential ${credentialId}.`
  );

  return new Ok(undefined);
}

async function migrateAllSlackConnections(
  connectorId: ModelId | undefined,
  slackClientId: string,
  slackClientSecret: string,
  slackSigningSecret: string,
  logger: Logger,
  execute: boolean
) {
  const api = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);

  // Validate credentials upfront
  if (
    execute &&
    (!slackClientId || !slackClientSecret || !slackSigningSecret)
  ) {
    logger.error(
      "Missing Slack credentials. Please provide --slackClientId, --slackClientSecret, and --slackSigningSecret."
    );
    return;
  }

  // Fetch all Slack connectors
  const connectors = connectorId
    ? await ConnectorResource.fetchByIds(PROVIDER, [connectorId])
    : await ConnectorResource.listByType(PROVIDER, {});

  logger.info(`Found ${connectors.length} Slack connectors to migrate.`);

  // Migrate each connector (creates one credential per connection)
  let successCount = 0;
  let errorCount = 0;

  for (const connector of connectors) {
    const localLogger = logger.child({
      connectorId: connector.id,
      workspaceId: connector.workspaceId,
      connectionId: connector.connectionId,
    });

    const migrationRes = await migrateSlackConnectionCredential(
      api,
      connector,
      slackClientId,
      slackClientSecret,
      slackSigningSecret,
      localLogger,
      execute
    );

    if (migrationRes.isErr()) {
      errorCount++;
      localLogger.error(
        {
          error: migrationRes.error,
        },
        "Failed to migrate connector."
      );
    } else {
      successCount++;
    }
  }

  logger.info(
    {
      total: connectors.length,
      success: successCount,
      errors: errorCount,
    },
    "Done migrating Slack connectors."
  );
}

makeScript(
  {
    connectorId: {
      alias: "c",
      describe: "Connector ID (optional, for testing single connector)",
      type: "number",
    },
    slackClientId: {
      describe: "Slack app client ID",
      type: "string",
      demandOption: true,
    },
    slackClientSecret: {
      describe: "Slack app client secret",
      type: "string",
      demandOption: true,
    },
    slackSigningSecret: {
      describe: "Slack app signing secret",
      type: "string",
      demandOption: true,
    },
  },
  async (
    {
      connectorId,
      slackClientId,
      slackClientSecret,
      slackSigningSecret,
      execute,
    },
    logger
  ) => {
    await migrateAllSlackConnections(
      connectorId,
      slackClientId,
      slackClientSecret,
      slackSigningSecret,
      logger,
      execute
    );
  }
);
