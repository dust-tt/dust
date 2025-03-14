import config from "@app/lib/api/config";
import {
  Authenticator,
  getFeatureFlags,
  getOrCreateSystemApiKey,
} from "@app/lib/auth";
import {
  getDefaultDataSourceDescription,
  getDefaultDataSourceName,
  isConnectorProviderAssistantDefaultSelected,
} from "@app/lib/connector_providers";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ConnectorProvider, DataSourceType } from "@app/types";
import {
  ConnectorsAPI,
  CoreAPI,
  DEFAULT_EMBEDDING_PROVIDER_ID,
  DEFAULT_QDRANT_CLUSTER,
  dustManagedCredentials,
  EMBEDDING_CONFIGS,
} from "@app/types";

const PROVIDER = "gong";
const LABS_STORAGE_FEATURE_FLAG = "labs_transcripts_full_storage";

async function getAuthsForWorkspacesWithGong(): Promise<
  { auth: Authenticator; connectionId: string | null }[]
> {
  // Bypassing the resource to get all Gong configurations at once.
  const transcriptsConfigurations =
    await LabsTranscriptsConfigurationResource.model.findAll({
      where: {
        provider: PROVIDER,
        isActive: true,
      },
      include: [
        {
          model: Workspace,
          as: "workspace",
        },
      ],
    });

  const authsAndConnectionId = [];
  const seenWorkspaceIds = new Set();
  for (const config of transcriptsConfigurations) {
    const auth = await Authenticator.internalAdminForWorkspace(
      config.workspace.sId
    );
    const workspace = auth.getNonNullableWorkspace();

    // We can have multiple configurations for the same workspace (different users), skip the ones we've already seen.
    if (seenWorkspaceIds.has(workspace.id)) {
      continue;
    }
    seenWorkspaceIds.add(workspace.id);

    const flags = await getFeatureFlags(workspace);
    if (flags.includes(LABS_STORAGE_FEATURE_FLAG)) {
      authsAndConnectionId.push({ auth, connectionId: config.connectionId });
    }
  }
  return authsAndConnectionId;
}

async function createDataSourceAndConnector({
  auth,
  systemSpace,
  provider,
  connectionId,
  logger,
}: {
  auth: Authenticator;
  systemSpace: SpaceResource;
  provider: ConnectorProvider;
  connectionId: string;
  logger: typeof Logger;
}): Promise<DataSourceType> {
  const owner = auth.getNonNullableWorkspace();

  const dataSourceName = getDefaultDataSourceName(provider, null);
  const dataSourceDescription = getDefaultDataSourceDescription(provider, null);

  const systemAPIKeyRes = await getOrCreateSystemApiKey(owner);
  if (systemAPIKeyRes.isErr()) {
    throw systemAPIKeyRes.error;
  }

  const dataSourceEmbedder =
    owner.defaultEmbeddingProvider ?? DEFAULT_EMBEDDING_PROVIDER_ID;
  const embedderConfig = EMBEDDING_CONFIGS[dataSourceEmbedder];
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const dustProject = await coreAPI.createProject();
  if (dustProject.isErr()) {
    throw dustProject.error;
  }

  const dustDataSource = await coreAPI.createDataSource({
    projectId: dustProject.value.project.project_id.toString(),
    config: {
      embedder_config: {
        embedder: embedderConfig,
      },
      qdrant_config: {
        cluster: DEFAULT_QDRANT_CLUSTER,
        shadow_write_cluster: null,
      },
    },
    credentials: dustManagedCredentials(),
    name: dataSourceName,
  });

  if (dustDataSource.isErr()) {
    throw dustDataSource.error;
  }

  // Check if there's already a data source with the same name
  const existingDataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dataSourceName
  );
  if (existingDataSource) {
    throw new Error("A data source with the same name already exists.");
  }

  const dataSourceView =
    await DataSourceViewResource.createDataSourceAndDefaultView(
      {
        assistantDefaultSelected:
          isConnectorProviderAssistantDefaultSelected(provider),
        connectorProvider: provider,
        description: dataSourceDescription,
        dustAPIProjectId: dustProject.value.project.project_id.toString(),
        dustAPIDataSourceId: dustDataSource.value.data_source.data_source_id,
        name: dataSourceName,
        workspaceId: owner.id,
      },
      systemSpace,
      auth.user()
    );

  const { dataSource } = dataSourceView;

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  const connectorsRes = await connectorsAPI.createConnector({
    provider,
    workspaceId: owner.sId,
    workspaceAPIKey: systemAPIKeyRes.value.secret,
    dataSourceId: dataSource.sId,
    connectionId: connectionId ?? "none",
    configuration: null,
  });

  if (connectorsRes.isErr()) {
    logger.error(
      {
        error: connectorsRes.error,
      },
      "Failed to create the connector"
    );

    // Rollback the data source creation.
    await dataSource.delete(auth, { hardDelete: true });

    // Delete the dangling system key.
    await systemAPIKeyRes.value.delete();

    const deleteRes = await coreAPI.deleteDataSource({
      projectId: dustProject.value.project.project_id.toString(),
      dataSourceId: dustDataSource.value.data_source.data_source_id,
    });
    if (deleteRes.isErr()) {
      logger.error(
        {
          error: deleteRes.error,
        },
        "Failed to delete the data source"
      );
    }

    throw connectorsRes.error;
  }

  await dataSource.setConnectorId(connectorsRes.value.id);

  return dataSource.toJSON();
}

async function createAllGongConnectors({
  execute,
  logger,
}: {
  execute: boolean;
  logger: typeof Logger;
}) {
  const auths = await getAuthsForWorkspacesWithGong();
  for (const { auth, connectionId } of auths) {
    const owner = auth.getNonNullableWorkspace();
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    logger.info(
      { workspace: owner.sId, space: systemSpace.sId },
      `Found workspace with Gong and ${LABS_STORAGE_FEATURE_FLAG} enabled.`
    );

    if (!connectionId) {
      logger.error(
        { workspace: owner.sId, space: systemSpace.sId },
        `No connectionId found for workspace`
      );
      continue;
    }

    if (execute) {
      const dataSource = await createDataSourceAndConnector({
        auth,
        systemSpace,
        provider: PROVIDER,
        connectionId,
        logger,
      });
      logger.info(
        { dataSourceId: dataSource.sId, connectorId: dataSource.connectorId },
        "Successfully created Gong connector and dataSource."
      );
    }
  }
}

makeScript({}, async ({ execute }, logger) => {
  await createAllGongConnectors({ execute, logger });
});
