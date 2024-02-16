import type { ConnectorType, WithAPIErrorReponse } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetConnectorResponseBody = {
  connector: ConnectorType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<GetConnectorResponseBody | void>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!req.query.name || typeof req.query.name !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }
  const connectorId = dataSource.connectorId;
  if (!connectorId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found_error",
        message: "The connector you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const connectorRes = await new ConnectorsAPI(logger).getConnector(
        connectorId
      );
      if (connectorRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "connector_not_found_error",
            message: "The connector you requested was not found.",
          },
        });
      }

      res.status(200).json({ connector: connectorRes.value });
      return;
    }

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
