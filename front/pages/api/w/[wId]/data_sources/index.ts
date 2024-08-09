import type {
  DataSourceOrViewType,
  DataSourceType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  DEFAULT_QDRANT_CLUSTER,
  dustManagedCredentials,
  EMBEDDING_CONFIGS,
  isDataSourceNameValid,
} from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getDataSource } from "@app/lib/api/data_sources";
import { getDataSourcesOrViews } from "@app/lib/api/data_sources_or_views";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceOrViewType>;
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
  const user = auth.user();
  const plan = auth.plan();
  if (!plan || !user || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSourcesOrViews = await getDataSourcesOrViews(auth);

  switch (req.method) {
    case "GET":
      res.status(200).json({ dataSources: dataSourcesOrViews });
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

      // Enforce plan limits: DataSources and DataSourceViews count.
      if (
        plan.limits.dataSources.count != -1 &&
        dataSourcesOrViews.length >= plan.limits.dataSources.count
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

      const dataSourceEmbedder = owner.defaultEmbeddingProvider ?? "openai";
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

      const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);
      const ds = await DataSourceResource.makeNew(
        {
          name: req.body.name,
          description: description,
          dustAPIProjectId: dustProject.value.project.project_id.toString(),
          workspaceId: owner.id,
          assistantDefaultSelected: req.body.assistantDefaultSelected,
          editedByUserId: user.id,
        },
        globalVault
      );

      const dataSourceType = await getDataSource(auth, ds.name);
      if (dataSourceType) {
        void ServerSideTracking.trackDataSourceCreated({
          user,
          workspace: owner,
          dataSource: dataSourceType,
        });
      }

      res.status(201).json({
        dataSource: {
          id: ds.id,
          createdAt: ds.createdAt.getTime(),
          name: ds.name,
          description: ds.description,
          dustAPIProjectId: ds.dustAPIProjectId,
          assistantDefaultSelected: ds.assistantDefaultSelected,
          connectorId: null,
          connectorProvider: null,
        },
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
