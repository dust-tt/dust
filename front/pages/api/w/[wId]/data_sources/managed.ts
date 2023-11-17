import { NextApiRequest, NextApiResponse } from "next";

import { dustManagedCredentials } from "@app/lib/api/credentials";
import { Authenticator, getSession } from "@app/lib/auth";
import { getOrCreateSystemApiKey } from "@app/lib/auth";
import {
  ConnectorProvider,
  ConnectorsAPI,
  ConnectorType,
} from "@app/lib/connectors_api";
import { CoreAPI } from "@app/lib/core_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { DataSource } from "@app/lib/models";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";

export type PostManagedDataSourceResponseBody = {
  dataSource: DataSourceType;
  connector: ConnectorType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostManagedDataSourceResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan) {
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

      if (!req.body || typeof req.body.connectionId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The request body is missing.",
          },
        });
      }

      if (
        !req.body.provider ||
        !["slack", "notion", "github", "google_drive", "intercom"].includes(
          req.body.provider
        )
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid provider.",
          },
        });
      }

      if (typeof req.body.connectionId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { connectionId: string, provider: string }.",
          },
        });
      }

      const provider = req.body.provider as ConnectorProvider;

      const dataSourceName = suffix
        ? `managed-${provider}-${suffix}`
        : `managed-${provider}`;
      const dataSourceDescription = suffix
        ? `Managed Data Source for ${provider} (${suffix})`
        : `Managed Data Source for ${provider}`;
      const dataSourceProviderId = "openai";
      const dataSourceModelId = "text-embedding-ada-002";
      const dataSourceMaxChunkSize = 256;

      let isDataSourceAllowedInPlan: boolean;
      switch (provider) {
        case "slack":
          isDataSourceAllowedInPlan = plan.limits.connections.isSlackAllowed;
          break;
        case "notion":
          isDataSourceAllowedInPlan = plan.limits.connections.isNotionAllowed;
          break;
        case "github":
          isDataSourceAllowedInPlan = plan.limits.connections.isGithubAllowed;
          break;
        case "google_drive":
          isDataSourceAllowedInPlan =
            plan.limits.connections.isGoogleDriveAllowed;
          break;
        case "intercom":
          isDataSourceAllowedInPlan = plan.limits.connections.isIntercomAllowed;
          break;
        default:
          isDataSourceAllowedInPlan = false; // default to false if provider is not recognized
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

      // Dust managed credentials: managed data source.
      const credentials = dustManagedCredentials();

      const dustDataSource = await CoreAPI.createDataSource({
        projectId: dustProject.value.project.project_id.toString(),
        dataSourceId: dataSourceName,
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

      let dataSource = await DataSource.create({
        name: dataSourceName,
        description: dataSourceDescription,
        visibility: "private",
        dustAPIProjectId: dustProject.value.project.project_id.toString(),
        workspaceId: owner.id,
        assistantDefaultSelected: true,
      });

      const connectorsRes = await ConnectorsAPI.createConnector(
        provider,
        owner.sId,
        systemAPIKeyRes.value.secret,
        dataSourceName,
        req.body.connectionId
      );
      if (connectorsRes.isErr()) {
        logger.error(
          {
            error: connectorsRes.error,
          },
          "Failed to create the connector"
        );
        await dataSource.destroy();
        const deleteRes = await CoreAPI.deleteDataSource({
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

      dataSource = await dataSource.update({
        connectorId: connectorsRes.value.id,
        connectorProvider: provider,
      });

      return res.status(201).json({
        dataSource: {
          id: dataSource.id,
          name: dataSource.name,
          description: dataSource.description,
          visibility: dataSource.visibility,
          dustAPIProjectId: dataSource.dustAPIProjectId,
          connectorId: connectorsRes.value.id,
          connectorProvider: provider,
          assistantDefaultSelected: true,
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

export default withLogging(handler);
