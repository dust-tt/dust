import type { DataSourceType, WithAPIErrorResponse } from "@dust-tt/types";
import type { ConnectorType } from "@dust-tt/types";
import {
  assertNever,
  ConnectorConfigurationTypeSchema,
  DEFAULT_QDRANT_CLUSTER,
  EMBEDDING_CONFIGS,
  ioTsParsePayload,
  isConnectorProvider,
  sendUserOperationMessage,
  WebCrawlerConfigurationTypeSchema,
} from "@dust-tt/types";
import { dustManagedCredentials } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getDataSource } from "@app/lib/api/data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getOrCreateSystemApiKey } from "@app/lib/auth";
import { renderDataSourceType } from "@app/lib/data_sources";
import { DataSource } from "@app/lib/models/data_source";
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

  const plan = auth.plan();
  const user = auth.user();
  if (
    !owner ||
    !plan ||
    !user ||
    // No role under "builder" can create a managed data source.
    // We perform a more detailed check below for each provider,
    // but this is a first line of defense.
    !auth.isBuilder()
  ) {
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

      let isDataSourceAllowedInPlan: boolean;
      let assistantDefaultSelected: boolean;
      switch (provider) {
        case "confluence":
          isDataSourceAllowedInPlan =
            plan.limits.connections.isConfluenceAllowed;
          assistantDefaultSelected = true;
          break;
        case "slack":
          isDataSourceAllowedInPlan = plan.limits.connections.isSlackAllowed;
          assistantDefaultSelected = true;
          break;
        case "notion":
          isDataSourceAllowedInPlan = plan.limits.connections.isNotionAllowed;
          assistantDefaultSelected = true;
          break;
        case "github":
          isDataSourceAllowedInPlan = plan.limits.connections.isGithubAllowed;
          assistantDefaultSelected = true;
          break;
        case "google_drive":
          isDataSourceAllowedInPlan =
            plan.limits.connections.isGoogleDriveAllowed;
          assistantDefaultSelected = true;
          break;
        case "intercom":
          isDataSourceAllowedInPlan = plan.limits.connections.isIntercomAllowed;
          assistantDefaultSelected = true;
          break;
        case "microsoft":
          isDataSourceAllowedInPlan = true;
          assistantDefaultSelected = true;
          break;
        case "webcrawler":
          isDataSourceAllowedInPlan =
            plan.limits.connections.isWebCrawlerAllowed;
          assistantDefaultSelected = false;
          break;
        default:
          assertNever(provider);
      }

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

      const dataSourceEmbedder = owner.defaultEmbeddingProvider ?? "openai";
      const embedderConfig = EMBEDDING_CONFIGS[dataSourceEmbedder];

      // Dust managed credentials: managed data source.
      const credentials = dustManagedCredentials();

      const dustDataSource = await coreAPI.createDataSource({
        projectId: dustProject.value.project.project_id.toString(),
        dataSourceId: dataSourceName,
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
      let dataSource = await DataSource.create({
        name: dataSourceName,
        description: dataSourceDescription,
        dustAPIProjectId: dustProject.value.project.project_id.toString(),
        workspaceId: owner.id,
        assistantDefaultSelected,
        editedByUserId: user.id,
        vaultId: vault.id,
      });

      const globalVault = vault.isGlobal()
        ? vault
        : await VaultResource.fetchWorkspaceGlobalVault(auth);

      // For managed data source, we create a default view in the workspace vault.
      await DataSourceViewResource.createViewInVaultFromDataSourceIncludingAllDocuments(
        globalVault,
        renderDataSourceType(dataSource)
      );

      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );

      const connectorsRes = await connectorsAPI.createConnector(
        provider,
        owner.sId,
        systemAPIKeyRes.value.secret,
        dataSourceName,
        connectionId || "none",
        configuration
      );

      if (connectorsRes.isErr()) {
        logger.error(
          {
            error: connectorsRes.error,
          },
          "Failed to create the connector"
        );

        // TODO(2024-07-30 flav) Move to DataSourceResource.
        await DataSourceViewResource.deleteForDataSource(
          auth,
          renderDataSourceType(dataSource)
        );
        await dataSource.destroy();

        const deleteRes = await coreAPI.deleteDataSource({
          projectId: dustProject.value.project.project_id.toString(),
          dataSourceName: dustDataSource.value.data_source.data_source_id,
        });
        if (deleteRes.isErr()) {
          logger.error(
            {
              error: deleteRes.error,
            },
            "Failed to delete the data source"
          );
        }
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create the connector.",
            connectors_error: connectorsRes.error,
          },
        });
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

      dataSource = await dataSource.update({
        connectorId: connectorsRes.value.id,
        connectorProvider: provider,
      });
      const dataSourceType = await getDataSource(auth, dataSource.name);
      if (dataSourceType) {
        void ServerSideTracking.trackDataSourceCreated({
          dataSource: dataSourceType,
          user,
          workspace: owner,
        });
      }

      return res.status(201).json({
        dataSource: {
          id: dataSource.id,
          createdAt: dataSource.createdAt.getTime(),
          name: dataSource.name,
          description: dataSource.description,
          dustAPIProjectId: dataSource.dustAPIProjectId,
          connectorId: connectorsRes.value.id,
          connectorProvider: provider,
          assistantDefaultSelected,
        },
        connector: connectorsRes.value,
      });

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
