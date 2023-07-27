import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { ConnectorPermission, ConnectorsAPI } from "@app/lib/connectors_api";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetManagedDataSourceDefaultNewResourcePermissionResponseBody = {
  default_new_resource_permission: ConnectorPermission;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetManagedDataSourceDefaultNewResourcePermissionResponseBody>
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

      const connectorRes = await ConnectorsAPI.getConnector(
        dataSource.connectorId.toString()
      );
      if (connectorRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while retrieving the data source's connector.`,
          },
        });
      }

      res.status(200).json({
        default_new_resource_permission:
          connectorRes.value.defaultNewResourcePermission,
      });
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
