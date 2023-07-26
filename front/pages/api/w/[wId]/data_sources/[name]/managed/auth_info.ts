import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { ConnectorsAPI } from "@app/lib/connectors_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetDataSourceAuthInfoResponseBody = {
  scope: string;
  id: string;
  name: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetDataSourceAuthInfoResponseBody | ReturnedAPIErrorType | void
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

  const dataSource = await getDataSource(auth, req.query.name as string);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      if (!dataSource.connectorId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_not_managed",
            message: "The data source you requested is not managed.",
          },
        });
      }

      const authInfoRes = await ConnectorsAPI.getConnectorAuthInfo({
        connectorId: dataSource.connectorId,
      });
      if (authInfoRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              "An error occurred while retrieving the data source auth info.",
          },
        });
      }
      res.status(200).json(authInfoRes.value);
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(handler);
