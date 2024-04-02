import type { DataSourceType, WithAPIErrorReponse } from "@dust-tt/types";
import {
  DEFAULT_FREE_QDRANT_CLUSTER,
  DEFAULT_PAID_QDRANT_CLUSTER,
  dustManagedCredentials,
  EMBEDDING_CONFIG,
} from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { trackDataSourceCreated } from "@app/lib/amplitude/node";
import { getDataSource, getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { DataSource } from "@app/lib/models";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

const { NODE_ENV } = process.env;

export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceType>;
};

export type PostDataSourceResponseBody = {
  dataSource: DataSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<GetDataSourcesResponseBody | PostDataSourceResponseBody>
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();
  const plan = auth.plan();
  if (!owner || !plan || !user || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSources = await getDataSources(auth);

  switch (req.method) {
    case "GET":
      res.status(200).json({ dataSources });
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

      const coreAPI = new CoreAPI(logger);

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

      const dustDataSource = await coreAPI.createDataSource({
        projectId: dustProject.value.project.project_id.toString(),
        dataSourceId: req.body.name as string,
        config: {
          provider_id: EMBEDDING_CONFIG.provider_id,
          model_id: EMBEDDING_CONFIG.model_id,
          splitter_id: EMBEDDING_CONFIG.splitter_id,
          max_chunk_size: EMBEDDING_CONFIG.max_chunk_size,
          qdrant_config:
            auth.isUpgraded() && NODE_ENV === "production"
              ? {
                  cluster: DEFAULT_PAID_QDRANT_CLUSTER,
                  shadow_write_cluster: null,
                }
              : {
                  cluster: DEFAULT_FREE_QDRANT_CLUSTER,
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

      const ds = await DataSource.create({
        name: req.body.name,
        description: description,
        dustAPIProjectId: dustProject.value.project.project_id.toString(),
        workspaceId: owner.id,
        assistantDefaultSelected: req.body.assistantDefaultSelected,
        editedByUserId: user.id,
      });

      const dataSourceType = await getDataSource(auth, ds.name);
      if (dataSourceType) {
        trackDataSourceCreated(auth, { dataSource: dataSourceType });
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

export default withLogging(handler);
