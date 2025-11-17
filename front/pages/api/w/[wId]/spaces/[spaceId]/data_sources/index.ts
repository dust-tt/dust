import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { createDataSourceWithoutProvider } from "@app/lib/api/data_sources";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
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
import { apiError } from "@app/logger/withlogging";
import type {
  DataSourceType,
  DataSourceViewType,
  PlanType,
  WithAPIErrorResponse,
  WorkspaceType,
} from "@app/types";
import {
  CONNECTOR_PROVIDERS,
  ConnectorConfigurationTypeSchema,
  ConnectorsAPI,
  CoreAPI,
  DEFAULT_EMBEDDING_PROVIDER_ID,
  DEFAULT_QDRANT_CLUSTER,
  dustManagedCredentials,
  EMBEDDING_CONFIGS,
  ioTsParsePayload,
  sendUserOperationMessage,
  WebCrawlerConfigurationTypeSchema,
} from "@app/types";

// Sorcery: Create a union type with at least two elements to satisfy t.union
function getConnectorProviderCodec(): t.Mixed {
  const [first, second, ...rest] = CONNECTOR_PROVIDERS;
  return t.union([
    t.literal(first),
    t.literal(second),
    ...rest.map((value) => t.literal(value)),
  ]);
}

export const PostDataSourceWithProviderRequestBodySchema = t.intersection([
  t.type({
    provider: getConnectorProviderCodec(),
    name: t.union([t.string, t.undefined]),
    configuration: ConnectorConfigurationTypeSchema,
  }),
  t.partial({
    connectionId: t.string, // Required for some providers
  }),
]);

const PostDataSourceWithoutProviderRequestBodySchema = t.type({
  name: t.string,
  description: t.union([t.string, t.null]),
});

const PostDataSourceRequestBodySchema = t.union([
  PostDataSourceWithoutProviderRequestBodySchema,
  PostDataSourceWithProviderRequestBodySchema,
]);

export type PostDataSourceRequestBody = t.TypeOf<
  typeof PostDataSourceRequestBodySchema
>;

export type PostSpaceDataSourceResponseBody = {
  dataSource: DataSourceType;
  dataSourceView: DataSourceViewType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostSpaceDataSourceResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();

  if (space.isSystem()) {
    if (!space.canAdministrate(auth)) {
      return apiError(req, res, {
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
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can update a data source.",
        },
      });
    }

    if (!space.canWrite(auth)) {
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that have `write` permission for the current space can update a data source.",
        },
      });
    }
  }

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostDataSourceRequestBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body to post a static data source: ${pathError}`,
          },
        });
      }

      if ("provider" in bodyValidation.right) {
        const body = bodyValidation.right as t.TypeOf<
          typeof PostDataSourceWithProviderRequestBodySchema
        >;
        await handleDataSourceWithProvider({
          auth,
          plan,
          owner,
          space,
          body,
          req,
          res,
        });
      } else {
        const body = bodyValidation.right as t.TypeOf<
          typeof PostDataSourceWithoutProviderRequestBodySchema
        >;
        const r = await createDataSourceWithoutProvider(auth, {
          plan,
          owner,
          space,
          name: body.name,
          description: body.description,
        });

        if (r.isErr()) {
          return apiError(req, res, {
            status_code:
              r.error.code === "internal_server_error"
                ? 500
                : r.error.code === "plan_limit_error"
                  ? 401
                  : 400,
            api_error: {
              type: r.error.code,
              message: r.error.message,
              data_source_error: r.error.dataSourceError,
            },
          });
        }

        const dataSourceView = r.value;

        return res.status(201).json({
          dataSource: dataSourceView.dataSource.toJSON(),
          dataSourceView: dataSourceView.toJSON(),
        });
      }
      break;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

/**
 * Data sources with provider = all connectors except folders
 */
const handleDataSourceWithProvider = async ({
  auth,
  plan,
  owner,
  space,
  body,
  req,
  res,
}: {
  auth: Authenticator;
  plan: PlanType;
  owner: WorkspaceType;
  space: SpaceResource;
  body: t.TypeOf<typeof PostDataSourceWithProviderRequestBodySchema>;
  req: NextApiRequest;
  res: NextApiResponse<WithAPIErrorResponse<PostSpaceDataSourceResponseBody>>;
}) => {
  const { provider, name, connectionId } = body;

  // Checking that we have connectionId if we need id
  const isConnectionIdRequired = isConnectionIdRequiredForProvider(provider);
  if (isConnectionIdRequired && !connectionId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Connection ID is required for this provider.",
      },
    });
  }

  const featureFlags = await getFeatureFlags(owner);

  // Checking that the provider is allowed for the workspace plan
  const isDataSourceAllowedInPlan = isConnectorProviderAllowedForPlan(
    plan,
    provider,
    featureFlags
  );
  if (!isDataSourceAllowedInPlan) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "plan_limit_error",
        message: "Your plan does not allow you to create managed data sources.",
      },
    });
  }

  // System spaces only for managed data sources that are now webcrawler.
  if (space.isSystem() && provider === "webcrawler") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Cannot post a datasource for provider: ${provider} in system space.`,
      },
    });
  } else if (!space.isSystem() && provider !== "webcrawler") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Cannot post a datasource for provider: ${provider} in regular space.`,
      },
    });
  }

  // Computing data source name, description & configuration.
  // The suffix is optionnal and used manually to allow multiple data sources of the same provider.
  // Search for "setupWithSuffixConnector" in the codebase.
  const suffix =
    typeof req.query?.suffix === "string" ? req.query.suffix : null;
  if (suffix && !isValidConnectorSuffix(suffix)) {
    return apiError(req, res, {
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
  if (provider === "slack" || provider === "slack_bot") {
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
    const configurationRes = ioTsParsePayload(
      configuration,
      WebCrawlerConfigurationTypeSchema
    );
    if (configurationRes.isErr()) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Invalid configuration: " + configurationRes.error.join(", "),
        },
      });
    }
    dataSourceDescription = configurationRes.value.url;
  }

  // Creating the datasource
  const systemAPIKeyRes = await getOrCreateSystemApiKey(owner);
  if (systemAPIKeyRes.isErr()) {
    logger.error(
      {
        error: systemAPIKeyRes.error,
      },
      "Could not create the system API key"
    );
    return apiError(req, res, {
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
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to create internal project for the data source.`,
        data_source_error: dustProject.error,
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
    credentials: dustManagedCredentials(),
    name: dataSourceName,
  });

  if (dustDataSource.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to create the data source.",
        data_source_error: dustDataSource.error,
      },
    });
  }

  // Check if there's already a data source with the same name
  const existingDataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dataSourceName
  );
  if (existingDataSource) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "A data source with the same name already exists.",
      },
    });
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
      space,
      auth.user()
    );

  const { dataSource } = dataSourceView;

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
      return apiError(req, res, {
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
      {
        error: connectorsRes.error,
      },
      "Failed to create the connector"
    );

    // Rollback the data source creation.
    await dataSource.delete(auth, { hardDelete: true });

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

    switch (connectorsRes.error.type) {
      case "authorization_error":
      case "invalid_request_error":
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Failed to create the connector.",
            connectors_error: connectorsRes.error,
          },
        });
      default:
        return apiError(req, res, {
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

  res.status(201).json({
    dataSource: dataSource.toJSON(),
    dataSourceView: dataSourceView.toJSON(),
  });

  try {
    // Asynchronous tracking & operations without awaiting, handled safely
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
    logger.error(
      {
        error,
      },
      "Failed to track data source creation"
    );
  }

  return;
};

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
