import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import {
  createDataSourceWithoutProvider,
  registerSlackWebhookRouterEntry,
} from "@app/lib/api/data_sources";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import {
  getLlmCredentials,
  MISSING_EMBEDDING_API_KEY_ERROR_MESSAGE,
} from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags, getOrCreateSystemApiKey } from "@app/lib/auth";
import {
  getDefaultDataSourceDescription,
  getDefaultDataSourceName,
  isConnectionIdRequiredForProvider,
  isConnectorProviderAllowedForPlan,
  isConnectorProviderAssistantDefaultSelected,
  isValidConnectorSuffix,
} from "@app/lib/connector_providers";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { isDisposableEmailDomain } from "@app/lib/utils/disposable_email_domains";
import logger from "@app/logger/logger";
import { DEFAULT_EMBEDDING_PROVIDER_ID } from "@app/types/assistant/models/embedding";
import {
  ConnectorConfigurationTypeSchema,
  ConnectorsAPI,
} from "@app/types/connectors/connectors_api";
import { WebCrawlerConfigurationTypeSchema } from "@app/types/connectors/webcrawler";
import { CoreAPI, EMBEDDING_CONFIGS } from "@app/types/core/core_api";
import { DEFAULT_QDRANT_CLUSTER } from "@app/types/core/data_source";
import type { DataSourceType } from "@app/types/data_source";
import { CONNECTOR_PROVIDERS } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { PlanType } from "@app/types/plan";
import type { LLMCredentialsType } from "@app/types/provider_credential";
import { sendUserOperationMessage } from "@app/types/shared/user_operation";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkspaceType } from "@app/types/user";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import type { Context } from "hono";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import dsId from "./[dsId]";

export const PostDataSourceWithProviderRequestBodySchema = z.object({
  provider: z.enum(CONNECTOR_PROVIDERS),
  name: z.string().optional(),
  configuration: ConnectorConfigurationTypeSchema,
  connectionId: z.string().optional(),
  relatedCredentialId: z.string().optional(),
  extraConfig: z.record(z.string(), z.string()).optional(),
});

const PostDataSourceWithoutProviderRequestBodySchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
});

const PostDataSourceRequestBodySchema = z.union([
  PostDataSourceWithoutProviderRequestBodySchema,
  PostDataSourceWithProviderRequestBodySchema,
]);

export type PostDataSourceRequestBody = z.infer<
  typeof PostDataSourceRequestBodySchema
>;

export type PostSpaceDataSourceResponseBody = {
  dataSource: DataSourceType;
  dataSourceView: DataSourceViewType;
};

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources.
const app = workspaceApp();

app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PostDataSourceRequestBodySchema),
  async (ctx): HandlerResult<PostSpaceDataSourceResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const owner = auth.getNonNullableWorkspace();
    const plan = auth.getNonNullablePlan();

    if (space.isSystem()) {
      if (!space.canAdministrate(auth)) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `admins` for the current workspace can update a data source.",
          },
        });
      }
    } else {
      if (space.isGlobal() && !auth.isBuilder()) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can update a data source.",
          },
        });
      }

      if (!space.canWrite(auth)) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that have `write` permission for the current space can update a data source.",
          },
        });
      }
    }

    const body = ctx.req.valid("json");

    if ("provider" in body) {
      return handleDataSourceWithProvider({
        ctx,
        auth,
        plan,
        owner,
        space,
        body,
      });
    }

    const r = await createDataSourceWithoutProvider(auth, {
      plan,
      owner,
      space,
      name: body.name,
      description: body.description,
    });

    if (r.isErr()) {
      const status =
        r.error.code === "internal_server_error"
          ? 500
          : r.error.code === "plan_limit_error"
            ? 401
            : 400;
      return apiError(ctx, {
        status_code: status,
        api_error: {
          type: r.error.code,
          message: r.error.message,
          data_source_error: r.error.dataSourceError,
        },
      });
    }

    const dataSourceView = r.value;

    void emitAuditLogEvent({
      auth,
      action: "datasource.created",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("data_source", dataSourceView.dataSource),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        data_source_name: dataSourceView.dataSource.name,
        provider: "folder",
        space_id: space.sId,
      },
    });

    return ctx.json(
      {
        dataSource: dataSourceView.dataSource.toJSON(),
        dataSourceView: dataSourceView.toJSON(),
      },
      201
    );
  }
);

app.route("/:dsId", dsId);

export default app;

// Data sources with provider = all connectors except folders.
async function handleDataSourceWithProvider({
  ctx,
  auth,
  plan,
  owner,
  space,
  body,
}: {
  ctx: Context;
  auth: Authenticator;
  plan: PlanType;
  owner: WorkspaceType;
  space: SpaceResource;
  body: z.infer<typeof PostDataSourceWithProviderRequestBodySchema>;
}): HandlerResult<PostSpaceDataSourceResponseBody> {
  const { provider, name, connectionId, relatedCredentialId, extraConfig } =
    body;

  const isConnectionIdRequired = isConnectionIdRequiredForProvider(provider);
  if (isConnectionIdRequired && !connectionId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Connection ID is required for this provider.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(auth);

  const isDataSourceAllowedInPlan = isConnectorProviderAllowedForPlan(
    plan,
    provider,
    featureFlags
  );
  if (!isDataSourceAllowedInPlan) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "plan_limit_error",
        message: "Your plan does not allow you to create managed data sources.",
      },
    });
  }

  // System spaces only for managed data sources; webcrawler is regular-only.
  if (space.isSystem() && provider === "webcrawler") {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Cannot post a datasource for provider: ${provider} in system space.`,
      },
    });
  }
  if (!space.isSystem() && provider !== "webcrawler") {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Cannot post a datasource for provider: ${provider} in regular space.`,
      },
    });
  }

  // The suffix is optional and used manually to allow multiple data sources
  // of the same provider. Search for "setupWithSuffixConnector" in the
  // codebase.
  const suffix = ctx.req.query("suffix") ?? null;
  if (suffix && !isValidConnectorSuffix(suffix)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid suffix.",
      },
    });
  }
  const dataSourceName = name ?? getDefaultDataSourceName(provider, suffix);
  let dataSourceDescription = getDefaultDataSourceDescription(provider, suffix);

  let { configuration } = body;
  if (provider === "slack") {
    configuration = {
      botEnabled: false,
      whitelistedDomains: undefined,
      autoReadChannelPatterns: [],
      restrictedSpaceAgentsEnabled: true,
      privateIntegrationCredentialId: relatedCredentialId,
    };
  }

  if (provider === "slack_bot") {
    configuration = {
      botEnabled: true,
      whitelistedDomains: undefined,
      autoReadChannelPatterns: [],
      restrictedSpaceAgentsEnabled: true,
    };
  }

  if (provider === "discord_bot") {
    configuration = {
      botEnabled: true,
    };
  }

  if (provider === "webcrawler") {
    const configurationRes =
      WebCrawlerConfigurationTypeSchema.safeParse(configuration);
    if (!configurationRes.success) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Invalid configuration: " +
            fromError(configurationRes.error).toString(),
        },
      });
    }
    dataSourceDescription = configurationRes.data.url;
  }

  const systemAPIKeyRes = await getOrCreateSystemApiKey(owner);
  if (systemAPIKeyRes.isErr()) {
    logger.error(
      { error: systemAPIKeyRes.error },
      "Could not create the system API key"
    );
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message:
          "Could not create a system API key for the managed data source.",
      },
    });
  }

  const dataSourceEmbedder =
    owner.defaultEmbeddingProvider ?? DEFAULT_EMBEDDING_PROVIDER_ID;
  const embedderConfig = EMBEDDING_CONFIGS[dataSourceEmbedder];
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const dustProject = await coreAPI.createProject();
  if (dustProject.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to create internal project for the data source.",
        data_source_error: dustProject.error,
      },
    });
  }

  let credentials: LLMCredentialsType;
  try {
    credentials = await getLlmCredentials(auth);
  } catch (err) {
    logger.error(
      { error: normalizeError(err) },
      "Failed to get LLM credentials to create data source"
    );
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: MISSING_EMBEDDING_API_KEY_ERROR_MESSAGE,
      },
    });
  }

  const dustDataSource = await coreAPI.createDataSource({
    projectId: dustProject.value.project.project_id.toString(),
    config: {
      embedder_config: {
        embedder: {
          max_chunk_size: embedderConfig.max_chunk_size,
          model_id: embedderConfig.model_id,
          provider_id: embedderConfig.provider_id,
          splitter_id: embedderConfig.splitter_id,
        },
      },
      qdrant_config: {
        cluster: DEFAULT_QDRANT_CLUSTER,
        shadow_write_cluster: null,
      },
    },
    credentials,
    name: dataSourceName,
  });

  if (dustDataSource.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to create the data source.",
        data_source_error: dustDataSource.error,
      },
    });
  }

  const dustProjectId = dustProject.value.project.project_id.toString();
  const dustDataSourceId = dustDataSource.value.data_source.data_source_id;

  const rollbackCoreDataSource = async () => {
    const deleteRes = await coreAPI.deleteDataSource({
      projectId: dustProjectId,
      dataSourceId: dustDataSourceId,
    });
    if (deleteRes.isErr()) {
      logger.error(
        { error: deleteRes.error },
        "Failed to delete the data source"
      );
    }
  };

  // Check if there's already a data source with the same name.
  const existingDataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dataSourceName
  );
  if (existingDataSource) {
    await rollbackCoreDataSource();
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "A data source with the same name already exists.",
      },
    });
  }

  // Create the front data source + view. If this throws, rollback the core
  // data source we just created to avoid leaking a broken entry.
  let dataSourceView: DataSourceViewResource;
  try {
    dataSourceView =
      await DataSourceViewResource.createDataSourceAndDefaultView(
        {
          assistantDefaultSelected:
            isConnectorProviderAssistantDefaultSelected(provider),
          connectorProvider: provider,
          description: dataSourceDescription,
          dustAPIProjectId: dustProjectId,
          dustAPIDataSourceId: dustDataSourceId,
          name: dataSourceName,
          workspaceId: owner.id,
        },
        space,
        auth.user()
      );
  } catch (e) {
    await rollbackCoreDataSource();
    throw e;
  }

  const { dataSource } = dataSourceView;

  const rollbackManagedDataSource = async () => {
    // Best-effort rollback: avoid persisting a broken managed data source if
    // connector creation fails or we can't verify connection ownership
    // (OAuth issues, invalid connectionId, etc.).
    await dataSource.delete(auth, { hardDelete: true });
    await rollbackCoreDataSource();
  };

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  if (connectionId) {
    const checkConnectionOwnershipRes = await checkConnectionOwnership(
      auth,
      connectionId
    );
    if (checkConnectionOwnershipRes.isErr()) {
      await rollbackManagedDataSource();
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Failed to get the access token for the connector.",
        },
      });
    }
  }

  const connectorsRes = await connectorsAPI.createConnector({
    provider,
    workspaceId: owner.sId,
    workspaceAPIKey: systemAPIKeyRes.value.secret,
    dataSourceId: dataSource.sId,
    connectionId: connectionId ?? "none",
    configuration,
  });

  if (connectorsRes.isErr()) {
    logger.error(
      { error: connectorsRes.error },
      "Failed to create the connector"
    );

    await rollbackManagedDataSource();

    switch (connectorsRes.error.type) {
      case "authorization_error":
      case "invalid_request_error":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to create the connector.",
            connectors_error: connectorsRes.error,
          },
        });
      default:
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create the connector.",
            connectors_error: connectorsRes.error,
          },
        });
    }
  }

  await dataSource.setConnectorId(connectorsRes.value.id);

  // For Slack apps, register the signing secret in the webhook router.
  if (provider === "slack" && connectionId) {
    const webhookRes = await registerSlackWebhookRouterEntry({
      connectionId,
      extraConfig,
    });

    if (webhookRes.isErr()) {
      // Rollback: delete connector and data source.
      await dataSource.delete(auth, { hardDelete: true });
      const deleteConnectorRes = await connectorsAPI.deleteConnector(
        connectorsRes.value.id
      );
      if (deleteConnectorRes.isErr()) {
        logger.error(
          { error: deleteConnectorRes.error },
          "Failed to delete the connector during rollback"
        );
      }

      const deleteRes = await coreAPI.deleteDataSource({
        projectId: dustProjectId,
        dataSourceId: dustDataSourceId,
      });
      if (deleteRes.isErr()) {
        logger.error(
          { error: deleteRes.error },
          "Failed to delete the data source during rollback"
        );
      }

      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message:
            "Failed to register webhook router entry for Slack app. The connector has been rolled back.",
        },
      });
    }
  }

  void emitAuditLogEvent({
    auth,
    action: "datasource.created",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("data_source", dataSource),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      data_source_name: dataSource.name,
      provider: provider,
      space_id: space.sId,
    },
  });

  // Build the response before scheduling fire-and-forget tracking work.
  const response = ctx.json(
    {
      dataSource: dataSource.toJSON(),
      dataSourceView: dataSourceView.toJSON(),
    },
    201
  );

  try {
    void ServerSideTracking.trackDataSourceCreated({
      dataSource: dataSource.toJSON(),
      user: auth.getNonNullableUser(),
      workspace: owner,
    });

    const email = auth.user()?.email;
    if (email && !isDisposableEmailDomain(email)) {
      void sendUserOperationMessage({
        logger,
        message: `${email} \`${dataSource.name}\`  for workspace \`${
          owner.name
        }\` sId: \`${owner.sId}\` connectorId: \`${
          connectorsRes.value.id
        }\` provider: \`${provider}\` trialing: \`${
          auth.subscription()?.trialing ? "true" : "false"
        }\``,
      });
    }
  } catch (error) {
    logger.error({ error }, "Failed to track data source creation");
  }

  return response;
}
