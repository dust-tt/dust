import type {
  LabsTranscriptsProviderType,
  MigratedCredentialsType,
  ModelId,
  OAuthAPIError,
  OAuthProvider,
  Result,
} from "@dust-tt/types";
import {
  Err,
  isOAuthProvider,
  OAuthAPI,
  Ok,
  removeNulls,
} from "@dust-tt/types";
import { Nango } from "@nangohq/node";
import { promises as fs } from "fs";

import config from "@app/lib/api/config";
import { isDualUseOAuthConnectionId } from "@app/lib/labs/transcripts/utils/helpers";
import { Workspace } from "@app/lib/models/workspace";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const USE_CASE = "labs_transcripts";
const {
  NANGO_GOOGLE_DRIVE_CONNECTOR_ID = "",
  NANGO_GONG_CONNECTOR_ID = "",
  NANGO_SECRET_KEY = "",
} = process.env;

const nango = new Nango({ secretKey: NANGO_SECRET_KEY });

const NANGO_CONNECTOR_IDS: Record<string, string> = {
  google_drive: NANGO_GOOGLE_DRIVE_CONNECTOR_ID,
  gong: NANGO_GONG_CONNECTOR_ID,
};

const CONNECTORS_WITH_REFRESH_TOKENS = ["google_drive"];

async function appendRollbackCommand(
  provider: LabsTranscriptsProviderType,
  labsTranscriptConfigurationId: ModelId,
  oldConnectionId: string
) {
  const sql = `UPDATE labs_transcripts_configurations SET "connectionId" = '${oldConnectionId}' WHERE id = ${labsTranscriptConfigurationId};\n`;
  await fs.appendFile(`${provider}_rollback_commands.sql`, sql);
}

function getRedirectUri(provider: LabsTranscriptsProviderType): string {
  return `${config.getDustAPIConfig().url}/oauth/${provider}/finalize`;
}

async function migrateConfigurationId(
  api: OAuthAPI,
  provider: LabsTranscriptsProviderType,
  configuration: LabsTranscriptsConfigurationResource,
  logger: Logger,
  execute: boolean
): Promise<Result<void, Error | OAuthAPIError>> {
  logger.info(
    `Migrating configuration id ${configuration.id}, current connectionId ${configuration.connectionId}.`
  );

  const user = await configuration.getUser();
  const workspace = await Workspace.findOne({
    where: { id: configuration.workspaceId },
  });

  if (!user || !workspace) {
    return new Err(new Error("User or workspace not found"));
  }

  const integrationId = NANGO_CONNECTOR_IDS[provider];
  if (!integrationId) {
    return new Err(new Error("Nango integration ID not found for provider"));
  }

  // Retrieve connection from nango.
  let connection: any | null = null;
  try {
    connection = await nango.getConnection(
      integrationId,
      configuration.connectionId,
      true, // forceRefresh
      true // returnRefreshToksn
    );
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

  // If provider supports refresh tokens, migrate them.
  if (CONNECTORS_WITH_REFRESH_TOKENS.includes(provider)) {
    const thirtyMinutesFromNow = new Date(new Date().getTime() + 30 * 60000);

    if (
      !connection.credentials.expires_at ||
      new Date(connection.credentials.expires_at).getTime() <
        thirtyMinutesFromNow.getTime()
    ) {
      return new Err(
        new Error(
          "Expires at is not set or is less than 30 minutes from now. Skipping migration."
        )
      );
    }

    if (connection.credentials.expires_at) {
      migratedCredentials.access_token_expiry = Date.parse(
        connection.credentials.expires_at
      );
    }
    if (connection.credentials.refresh_token) {
      migratedCredentials.refresh_token = connection.credentials.refresh_token;
    }
  }

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
  const oldConnectionId = configuration.connectionId;

  // Create the connection with migratedCredentials.
  const cRes = await api.createConnection({
    // TOOD(alban): remove the as once gong is an OAuthProvider.
    provider: provider as OAuthProvider,
    metadata: {
      use_case: USE_CASE,
      workspace_id: workspace.sId,
      user_id: user.sId,
      origin: "migrated",
    },
    migratedCredentials,
  });

  if (cRes.isErr()) {
    return cRes;
  }

  const newConnectionId = cRes.value.connection.connection_id;

  // Append rollback command after successful update.
  await appendRollbackCommand(provider, configuration.id, oldConnectionId);

  await configuration.updateConnectionId(newConnectionId);

  logger.info(
    `Successfully migrated connection id for connector ${configuration.id}, new connectionId ${newConnectionId}.`
  );

  return new Ok(undefined);
}

async function migrateAllConfigurations(
  provider: LabsTranscriptsProviderType,
  configurationId: ModelId | undefined,
  logger: Logger,
  execute: boolean
) {
  const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const configurations = configurationId
    ? removeNulls([
        await LabsTranscriptsConfigurationResource.fetchByModelId(
          configurationId
        ),
      ])
    : await LabsTranscriptsConfigurationResource.listByProvider({
        provider,
      });

  logger.info(
    `Found ${configurations.length} ${provider} configurations to migrate.`
  );

  for (const configuration of configurations) {
    const localLogger = logger.child({
      configurationId: configuration.id,
      workspaceId: configuration.workspaceId,
    });

    if (isDualUseOAuthConnectionId(configuration.connectionId)) {
      localLogger.info("Skipping alreaydy migrated configuration");
      continue;
    }

    const migrationRes = await migrateConfigurationId(
      api,
      provider,
      configuration,
      localLogger,
      execute
    );
    if (migrationRes.isErr()) {
      localLogger.error(
        {
          error: migrationRes.error,
        },
        "Failed to migrate configuration. Exiting."
      );
    }
  }

  logger.info(`Done migrating configurations.`);
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
      await migrateAllConfigurations(
        provider as LabsTranscriptsProviderType,
        connectorId,
        logger,
        execute
      );
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
