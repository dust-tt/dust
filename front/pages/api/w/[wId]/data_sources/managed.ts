import type {
  ConnectorType,
  DataSourceType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  assertNever,
  ConnectorConfigurationTypeSchema,
  ConnectorsAPI,
  CoreAPI,
  DEFAULT_EMBEDDING_PROVIDER_ID,
  DEFAULT_QDRANT_CLUSTER,
  dustManagedCredentials,
  EMBEDDING_CONFIGS,
  ioTsParsePayload,
  isConnectorProvider,
  sendUserOperationMessage,
  WebCrawlerConfigurationTypeSchema,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getOrCreateSystemApiKey } from "@app/lib/auth";
import {
  isConnectorProviderAllowedForPlan,
  isConnectorProviderAssistantDefaultSelected,
} from "@app/lib/connector_providers";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { isDisposableEmailDomain } from "@app/lib/utils/disposable_email_domains";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export const PostManagedDataSourceRequestBodySchema = t.type({
  provider: t.string,
  connectionId: t.string,
  name: t.union([t.string, t.undefined]),
  configuration: ConnectorConfigurationTypeSchema,
});

export type PostManagedDataSourceRequestBody = t.TypeOf<
  typeof PostManagedDataSourceRequestBodySchema
>;

export type PostManagedDataSourceResponseBody = {
  dataSource: DataSourceType;
  connector: ConnectorType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostManagedDataSourceResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();
  const user = auth.getNonNullableUser();

  // No role under "builder" can create a managed data source. We perform a more detailed check
  // below for each provider, but this is a first line of defense.
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PostManagedDataSourceRequestBodySchema.decode(
        req.body
      );
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      let { configuration } = bodyValidation.right;
      const { connectionId, provider, name } = bodyValidation.right;

      if (!isConnectorProvider(provider)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid provider.",
          },
        });
      }
      switch (provider) {
        case "webcrawler": {
          if (!auth.isBuilder()) {
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "data_source_auth_error",
                message:
                  "Only the users that are `builders` for the current workspace can add a public website.",
              },
            });
          }
          break;
        }
        case "confluence":
        case "github":
        case "google_drive":
        case "intercom":
        case "notion":
        case "microsoft":
        case "snowflake":
        case "slack": {
          if (!auth.isAdmin()) {
            return apiError(req, res, {
              status_code: 403,
              api_error: {
                type: "data_source_auth_error",
                message:
                  "Only the users that are `admins` for the current workspace can create a managed data source.",
              },
            });
          }
          if (!connectionId) {
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: "connectionId is required.",
              },
            });
          }
          break;
        }
        default:
          assertNever(provider);
      }
      // retrieve suffix GET parameter
      let suffix: string | null = null;
      if (req.query.suffix && typeof req.query.suffix === "string") {
        suffix = req.query.suffix;
      }
      if (suffix && !/^[a-z0-9\-_]{1,16}$/.test(suffix)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid suffix.",
          },
        });
      }

      let dataSourceName: string;
      let dataSourceDescription: string | null = null;
      if (name) {
        dataSourceName = name;
      } else {
        dataSourceName = suffix
          ? `managed-${provider}-${suffix}`
          : `managed-${provider}`;
      }
      switch (provider) {
        case "webcrawler":
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
          break;
        case "slack":
          // When creating a Slack data source we don't receive a configuration but pass a default
          // value for it as we create the connector.
          configuration = {
            botEnabled: true,
            whitelistedDomains: undefined,
            autoReadChannelPattern: undefined,
          };
          break;

        default:
          dataSourceDescription = suffix
            ? `Managed Data Source for ${provider} (${suffix})`
            : `Managed Data Source for ${provider}`;
      }

      const isDataSourceAllowedInPlan = isConnectorProviderAllowedForPlan(
        plan,
        provider
      );
      const assistantDefaultSelected =
        isConnectorProviderAssistantDefaultSelected(provider);

      // Enforce plan limits: managed DataSources.
      if (!isDataSourceAllowedInPlan) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "plan_limit_error",
            message:
              "Your plan does not allow you to create managed data sources.",
          },
        });
      }

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

      const dataSourceEmbedder =
        owner.defaultEmbeddingProvider ?? DEFAULT_EMBEDDING_PROVIDER_ID;
      const embedderConfig = EMBEDDING_CONFIGS[dataSourceEmbedder];

      // Dust managed credentials: managed data source.
      const credentials = dustManagedCredentials();

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

      const vault = await (provider === "webcrawler"
        ? VaultResource.fetchWorkspaceGlobalVault(auth)
        : VaultResource.fetchWorkspaceSystemVault(auth));

      const dataSourceView =
        await DataSourceViewResource.createDataSourceAndDefaultView(
          auth,
          {
            assistantDefaultSelected,
            connectorProvider: provider,
            description: dataSourceDescription,
            dustAPIProjectId: dustProject.value.project.project_id.toString(),
            dustAPIDataSourceId:
              dustDataSource.value.data_source.data_source_id,
            name: dataSourceName,
            workspaceId: owner.id,
          },
          vault
        );

      const dataSource = dataSourceView.dataSource;

      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );

      const connectorsRes = await connectorsAPI.createConnector({
        provider,
        workspaceId: owner.sId,
        workspaceAPIKey: systemAPIKeyRes.value.secret,
        dataSourceId: dataSource.sId,
        connectionId: connectionId || "none",
        configuration,
      });

      if (connectorsRes.isErr()) {
        logger.error(
          {
            error: connectorsRes.error,
          },
          "Failed to create the connector"
        );

        // If the connector creation fails, we delete the data source and the project.
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

      await dataSource.setConnectorId(connectorsRes.value.id);

      res.status(201).json({
        dataSource: dataSource.toJSON(),
        connector: connectorsRes.value,
      });

      void ServerSideTracking.trackDataSourceCreated({
        dataSource: dataSource.toJSON(),
        user,
        workspace: owner,
      });
      return;

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

export default withSessionAuthenticationForWorkspace(handler);
