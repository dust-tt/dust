import { Request, Response } from "express";

import { Connector } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorType } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type GetConnectorRes = ConnectorType | ConnectorsAPIErrorResponse;

const _getConnector = async (
  req: Request<{ connector_id: string }, GetConnectorRes, undefined>,
  res: Response<GetConnectorRes>
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

  return res.status(200).json({
    id: connector.id,
    type: connector.type,
    lastSyncStatus: connector.lastSyncStatus,
    lastSyncStartTime: connector.lastSyncStartTime?.getTime(),
    lastSyncFinishTime: connector.lastSyncFinishTime?.getTime(),
    lastSyncSuccessfulTime: connector.lastSyncSuccessfulTime?.getTime(),
    firstSuccessfulSyncTime: connector.firstSuccessfulSyncTime?.getTime(),
    firstSyncProgress: connector.firstSyncProgress,
  });
};

export const getConnectorAPIHandler = withLogging(_getConnector);
