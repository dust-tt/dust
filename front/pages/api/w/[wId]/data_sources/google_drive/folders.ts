import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { ConnectorsAPI, ConnectorType } from "@app/lib/connectors_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";

export type PostManagedDataSourceResponseBody = {
  dataSource: DataSourceType;
  connector: ConnectorType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | {
        folders: {
          name: string;
          id: string;
        }[];
      }
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
        message: "The Data Source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `admins` for the current workspace can get the Google Drive folders.",
          },
        });
      }

      if (!req.body || typeof req.query.connectorId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "uri_params required: connectorId.",
          },
        });
      }
      console.log('a12132432')
      const foldersRes = await ConnectorsAPI.getGoogleDriveFolders(
        req.query.connectorId
      );
      if (foldersRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while getting the Google Drive folders.`,
          },
        });
      }
      console.log("foldersRes.value ", foldersRes.value);

      res.status(200).json(foldersRes.value);

      break;
    case "POST":
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `admins` for the current workspace can create a managed Data Source.",
          },
        });
      }

      if (
        !req.body ||
        typeof req.body.folders !== "object" ||
        typeof req.body.connectorId !== "string"
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects { folders: string[], connectorId: string }.",
          },
        });
      }

      const setFoldersRes = await ConnectorsAPI.setGoogleDriveFolders(
        req.body.connectorId,
        req.body.folders
      );
      if (setFoldersRes.isErr()) {
        console.log("connectorsRes.isErr() ", setFoldersRes.error);
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while setting the Google Drive folders.`,
          },
        });
      }
      const syncRes = await ConnectorsAPI.syncConnector(req.body.connectorId);
      if (syncRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while starting the synchronization.`,
          },
        });
      }

      res.status(200).end();

      break;

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
