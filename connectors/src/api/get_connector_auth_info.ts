import { Request, Response } from "express";

import { RETRIEVE_CONNECTOR_AUTH_INFO_BY_TYPE } from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type GetConnectorAuthInfoRes =
  | { scope: string; id: string; name: string }
  | ConnectorsAPIErrorResponse;

const _getConnectorAuthInfo = async (
  req: Request<{ connector_id: string }, GetConnectorAuthInfoRes, undefined>,
  res: Response<GetConnectorAuthInfoRes>
) => {
  if (!req.params.connector_id) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
      status_code: 400,
    });
  }

  const connector = await Connector.findByPk(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
      status_code: 404,
    });
  }

  const connectorAuthInfoRetriever =
    RETRIEVE_CONNECTOR_AUTH_INFO_BY_TYPE[connector.type];

  const pRes = await connectorAuthInfoRetriever(connector.id);

  if (pRes.isErr()) {
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: pRes.error.message,
      },
      status_code: 500,
    });
  }

  return res.status(200).json(pRes.value);
};

export const getConnectorAuthInfoAPIHandler = withLogging(
  _getConnectorAuthInfo
);
