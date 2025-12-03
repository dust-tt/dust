import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { makeScript } from "scripts/helpers";

import { connectorsConfig } from "@connectors/connectors/shared/config";
import { apiConfig } from "@connectors/lib/api/config";
import { SlackConfigurationModel } from "@connectors/lib/models/slack";
import { WebhookRouterConfigService } from "@connectors/lib/webhook_router_config";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { SlackConfigurationResource } from "@connectors/resources/slack_configuration_resource";
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
  const teamId = metadataRes.value.connection.metadata.team_id;

  if (typeof userId !== "string" || userId.length === 0) {
    return new Err({
      code: "missing_user_id",
      message: `Connection ${connector.connectionId} has no user_id in metadata.`,
    });
  }

  if (typeof teamId !== "string" || teamId.length === 0) {
    return new Err({
      code: "missing_team_id",
      message: `Connection ${connector.connectionId} has no team_id in metadata.`,
    });
  }

  logger.info(
    { userId, teamId },
    "Using user_id and team_id from connection metadata."
  );

  // Create a credential record for this connection
  const credRes = await api.postCredentials({
    provider: PROVIDER,
    userId,
    workspaceId: connector.workspaceId,
    credentials: {
      client_id: slackClientId,
      client_secret: slackClientSecret,
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

  // Update the connection to reference this credential and set client_id in metadata
  const updateRes = await api.updateConnectionCredential({
    connectionId: connector.connectionId,
    relatedCredentialId: credentialId,
    metadata: { client_id: slackClientId },
  });

  if (updateRes.isErr()) {
    return updateRes;
  }

  logger.info(
    { credentialId },
    `Successfully updated connection ${connector.connectionId} to use credential and set client_id in metadata.`
  );

  // Store credential reference in SlackConfiguration
  const slackConfig = await SlackConfigurationResource.fetchByConnectorId(
    connector.id
  );

  if (!slackConfig) {
    return new Err({
      code: "missing_slack_config",
      message: `No Slack configuration found for connector ${connector.id}`,
    });
  }

  await SlackConfigurationModel.update(
    { privateIntegrationCredentialId: credentialId },
    { where: { id: slackConfig.id } }
  );

  logger.info(
    { credentialId },
    `Updated SlackConfiguration for connector ${connector.id} with credential reference.`
  );

  // Configure webhook router
  const webhookService = new WebhookRouterConfigService();
  const currentRegion = connectorsConfig.getCurrentRegion();

  // Get all connectors for this team to build the connector IDs list
  const allTeamSlackConfigs = await SlackConfigurationResource.listForTeamId(
    teamId,
    PROVIDER
  );
  const connectorIds = allTeamSlackConfigs.map((config) => config.connectorId);

  await webhookService.syncEntry(
    PROVIDER,
    teamId,
    slackSigningSecret,
    currentRegion,
    connectorIds
  );

  logger.info(
    { teamId, region: currentRegion, connectorIds },
    `Updated webhook router configuration for team ${teamId} with ${connectorIds.length} connector(s).`
  );

  return new Ok(undefined);
}

async function migrateAllSlackConnections(
  connectorId: ModelId | undefined,
  logger: Logger,
  execute: boolean
) {
  const api = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);

  // Get credentials from environment variables
  const slackClientId = process.env.SLACK_CLIENT_ID;
  const slackClientSecret = process.env.SLACK_CLIENT_SECRET;
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;

  // Validate credentials upfront
  if (!slackClientId || !slackClientSecret || !slackSigningSecret) {
    logger.error(
      "Missing Slack credentials. Please set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, and SLACK_SIGNING_SECRET environment variables."
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
  },
  async ({ connectorId, execute }, logger) => {
    await migrateAllSlackConnections(connectorId, logger, execute);
  }
);
