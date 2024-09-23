import type { DataSourceType, WithAPIErrorResponse } from "@dust-tt/types";
import {
  DEFAULT_EMBEDDING_PROVIDER_ID,
  DEFAULT_QDRANT_CLUSTER,
  dustManagedCredentials,
  EMBEDDING_CONFIGS,
  isDataSourceNameValid,
} from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getDataSources } from "@app/lib/api/data_sources";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceType>;
};

export type PostDataSourceResponseBody = {
  dataSource: DataSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetDataSourcesResponseBody | PostDataSourceResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();
  const plan = auth.getNonNullablePlan();

  const dataSources = await getDataSources(auth);

  switch (req.method) {
    case "GET":
      res
        .status(200)
        .json({ dataSources: dataSources.map((ds) => ds.toJSON()) });
      return;

    case "POST":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `admins` for the current workspace can create a data source.",
          },
        });
      }

      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !(typeof req.body.assistantDefaultSelected === "boolean")
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { name, description, provider_id, model_id, max_chunk_size, visibility, assistantDefaultSelected }.",
          },
        });
      }

      if (req.body.name.startsWith("managed-")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The data source name cannot start with `managed-`.",
          },
        });
      }

      if (!isDataSourceNameValid(req.body.name)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Data source names must only contain letters, numbers, and the characters `._-`, and cannot be empty.",
          },
        });
      }

      // Enforce plan limits: DataSources count.
      if (
        plan.limits.dataSources.count != -1 &&
        dataSources.length >= plan.limits.dataSources.count
      ) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "plan_limit_error",
            message:
              "Your plan does not allow you to create managed data sources.",
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

      const description = req.body.description ? req.body.description : null;

      // Dust managed credentials: all data sources.
      const credentials = dustManagedCredentials();

      const dataSourceEmbedder =
        owner.defaultEmbeddingProvider ?? DEFAULT_EMBEDDING_PROVIDER_ID;
      const embedderConfig = EMBEDDING_CONFIGS[dataSourceEmbedder];
      const dustDataSource = await coreAPI.createDataSource({
        projectId: dustProject.value.project.project_id.toString(),
        dataSourceId: req.body.name as string,
        config: {
          qdrant_config: {
            cluster: DEFAULT_QDRANT_CLUSTER,
            shadow_write_cluster: null,
          },
          embedder_config: {
            embedder: {
              max_chunk_size: embedderConfig.max_chunk_size,
              model_id: embedderConfig.model_id,
              provider_id: embedderConfig.provider_id,
              splitter_id: embedderConfig.splitter_id,
            },
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

      let vault = null;
      if (typeof req.body.vaultId === "string") {
        vault = await VaultResource.fetchById(auth, req.body.vaultId);
        if (!vault) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "vault_not_found",
              message: "The vault you requested was not found.",
            },
          });
        }
      } else {
        // If no vault is provided, use the global vault.
        vault = await VaultResource.fetchWorkspaceGlobalVault(auth);
      }

      if (!vault.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that have `write` permission for the current vault can create a data source.",
          },
        });
      }

      const ds = await DataSourceResource.makeNew(
        auth,
        {
          name: req.body.name,
          description: description,
          dustAPIProjectId: dustProject.value.project.project_id.toString(),
          dustAPIDataSourceId: dustDataSource.value.data_source.data_source_id,
          workspaceId: owner.id,
          assistantDefaultSelected: req.body.assistantDefaultSelected,
        },
        vault
      );

      await DataSourceViewResource.createViewInVaultFromDataSourceIncludingAllDocuments(
        auth,
        ds.vault,
        ds
      );

      res.status(201).json({
        dataSource: ds.toJSON(),
      });

      void ServerSideTracking.trackDataSourceCreated({
        user,
        workspace: owner,
        dataSource: ds.toJSON(),
      });
      return;

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
