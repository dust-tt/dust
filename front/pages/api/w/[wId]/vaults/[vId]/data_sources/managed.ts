import type { WithAPIErrorResponse } from "@dust-tt/types";
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
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getDataSource } from "@app/lib/api/data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getOrCreateSystemApiKey } from "@app/lib/auth";
import {
  getDefaultDataSourceDescription,
  getDefaultDataSourceName,
  isConnectorProviderAllowedForPlan,
  isConnectorProviderAssistantDefaultSelected,
  isValidConnectorSuffix,
} from "@app/lib/connector_providers";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { isDisposableEmailDomain } from "@app/lib/utils/disposable_email_domains";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { PostVaultDataSourceResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_sources/static";

// Sorcery: Create a union type with at least two elements to satisfy t.union
export function getConnectorProviderCodec(): t.Mixed {
  const [first, second, ...rest] = CONNECTOR_PROVIDERS;
  return t.union([
    t.literal(first),
    t.literal(second),
    ...rest.map((value) => t.literal(value)),
  ]);
}

const PostManagedDataSourceRequestBodySchema = t.type({
  provider: getConnectorProviderCodec(),
  connectionId: t.union([t.string, t.undefined]),
  name: t.union([t.string, t.undefined]),
  configuration: ConnectorConfigurationTypeSchema,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostVaultDataSourceResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.workspace();
  const plan = auth.plan();
  const user = auth.user();

  if (!owner || !plan || !user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you requested was not found.",
      },
    });
  }

  const vault = await VaultResource.fetchById(auth, req.query.vId as string);

  if (
    !vault ||
    (!auth.isAdmin() && !auth.hasPermission([vault.acl()], "write"))
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostManagedDataSourceRequestBodySchema.decode(
        req.body
      );
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

      const { connectionId, provider, name } = bodyValidation.right;

      // Checking that the provider is allowed for the workspace plan
      const isDataSourceAllowedInPlan = isConnectorProviderAllowedForPlan(
        plan,
        provider
      );
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

      // System vaults only for managed data sources that are now webcrawler.
      if (vault.isSystem() && provider === "webcrawler") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Cannot post a datasource for provider: ${provider} in system vault.`,
          },
        });
      } else if (!vault.isSystem() && provider !== "webcrawler") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Cannot post a datasource for provider: ${provider} in regular vault.`,
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
      let dataSourceDescription = getDefaultDataSourceDescription(
        provider,
        suffix
      );

      let { configuration } = bodyValidation.right;
      if (provider === "slack") {
        configuration = {
          botEnabled: true,
          whitelistedDomains: undefined,
          autoReadChannelPattern: undefined,
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
        credentials: dustManagedCredentials(),
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

      const dataSource = await DataSourceResource.makeNew(
        {
          assistantDefaultSelected:
            isConnectorProviderAssistantDefaultSelected(provider),
          connectorProvider: provider,
          description: dataSourceDescription,
          dustAPIProjectId: dustProject.value.project.project_id.toString(),
          editedByUserId: user.id,
          name: dataSourceName,
          workspaceId: owner.id,
        },
        vault
      );

      // For each data source, we create two views:
      // - One default view in its associated vault
      // - If the data source resides in the system vault, we also create a custom view in the global vault until vault are released.
      if (dataSource.vault.isSystem()) {
        const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);

        await DataSourceViewResource.createViewInVaultFromDataSourceIncludingAllDocuments(
          globalVault,
          dataSource,
          "custom"
        );
      }

      const dataSourceView =
        await DataSourceViewResource.createViewInVaultFromDataSourceIncludingAllDocuments(
          dataSource.vault,
          dataSource
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
        await dataSource.delete(auth);
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

      await dataSource.update({
        connectorId: connectorsRes.value.id,
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
        dataSource: dataSource.toJSON(),
        dataSourceView: dataSourceView.toJSON(),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
