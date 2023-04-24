import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { getOrCreateSystemApiKey } from "@app/lib/auth";
import { ConnectorsAPI } from "@app/lib/connectors_api";
import { DustAPI } from "@app/lib/dust_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { DataSource, Key, Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReturnedAPIErrorType>
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
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can create a data source.",
          },
        });
      }

      const dataSourceName = "managed-slack";
      const dataSourceDescription = "managed-slack";
      const dataSourceProviderId = "openai";
      const dataSourceModelId = "text-embedding-ada-002";
      const dataSourceMaxChunkSize = 256;

      if (
        !req.body.nangoConnectionId ||
        typeof req.body.nangoConnectionId !== "string"
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects \
               { nangoConnectionId: string }.",
          },
        });
      }
      const systemAPIKeyRes = await getOrCreateSystemApiKey(owner.id);
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
            message: "Could not create the system API key",
          },
        });
      }

      const connectorsRes = await ConnectorsAPI.createConnector(
        "slack",
        owner.id.toString(),
        systemAPIKeyRes.value.secret,
        dataSourceName,
        req.body.nangoConnectionId
      );
      if (connectorsRes.isErr()) {
        logger.error(
          {
            error: connectorsRes.error,
          },
          "Failed to create the connector"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create the connector.",
          },
        });
      }

      const dustProject = await DustAPI.createProject();
      if (dustProject.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            // I don't know if we want to forward the core error to the client. LMK during code review please.
            message: `Could not create the project. Reason: ${dustProject.error}`,
            data_source_error: dustProject.error,
          },
        });
      }

      const providers = await Provider.findAll({
        where: {
          workspaceId: owner.id,
        },
      });
      let credentials = credentialsFromProviders(providers);

      const dustDataSource = await DustAPI.createDataSource(
        dustProject.value.project.project_id.toString(),
        {
          dataSourceId: dataSourceName,
          config: {
            provider_id: dataSourceProviderId,
            model_id: dataSourceModelId,
            splitter_id: "base_v0",
            max_chunk_size: dataSourceMaxChunkSize,
            use_cache: false,
          },
          credentials,
        }
      );

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

      const dataSource = await DataSource.create({
        name: dataSourceName,
        description: dataSourceDescription,
        //assuming managed data sources are always private for now
        visibility: "private",
        config: JSON.stringify(dustDataSource.value.data_source.config),
        dustAPIProjectId: dustProject.value.project.project_id.toString(),
        workspaceId: owner.id,
        connectorId: connectorsRes.value.connectorId,
        connectorProvider: "slack",
      });

      res.redirect(`/${owner.sId}/ds/${dataSource.name}`);
      return;

    default:
  }
}

export default withLogging(handler);
