import { NextApiRequest, NextApiResponse } from "next";

import { dustManagedCredentials } from "@app/lib/api/credentials";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { DataSource } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";

export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceType>;
};

export type PostDataSourceResponseBody = {
  dataSource: DataSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetDataSourcesResponseBody
    | PostDataSourceResponseBody
    | ReturnedAPIErrorType
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
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
              "Only the users that are `admins` for the current workspace can create a managed data source.",
          },
        });
      }

      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !["public", "private"].includes(req.body.visibility) ||
        !(typeof req.body.assistantDefaultSelected == "boolean")
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
        owner.plan.limits.dataSources.count != -1 &&
        dataSources.length >= owner.plan.limits.dataSources.count
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

      const dataSourceProviderId = "openai";
      const dataSourceModelId = "text-embedding-ada-002";
      const dataSourceMaxChunkSize = 256;

      const dustProject = await CoreAPI.createProject();
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

      const dustDataSource = await CoreAPI.createDataSource({
        projectId: dustProject.value.project.project_id.toString(),
        dataSourceId: req.body.name as string,
        config: {
          provider_id: dataSourceProviderId,
          model_id: dataSourceModelId,
          splitter_id: "base_v0",
          max_chunk_size: dataSourceMaxChunkSize,
          use_cache: false,
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
        visibility: req.body.visibility,
        config: JSON.stringify(dustDataSource.value.data_source.config),
        dustAPIProjectId: dustProject.value.project.project_id.toString(),
        workspaceId: owner.id,
        assistantDefaultSelected: req.body.assistantDefaultSelected,
        userUpsertable: req.body.userUpsertable,
      });

      res.status(201).json({
        dataSource: {
          id: ds.id,
          name: ds.name,
          description: ds.description,
          visibility: ds.visibility,
          config: ds.config,
          dustAPIProjectId: ds.dustAPIProjectId,
          userUpsertable: ds.userUpsertable,
          assistantDefaultSelected: ds.assistantDefaultSelected,
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
