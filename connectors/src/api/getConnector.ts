import { Request, Response } from "express";

import { Connector } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorType } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type GetConnectorRes = ConnectorType | ConnectorsAPIErrorResponse;

const _getConnector = async (
  req: Request<{ connector_id: string }, GetConnectorRes, undefined>,
  res: Response<GetConnectorRes>
) => {
  try {
    if (!req.params.connector_id) {
      res.status(400).send({
        error: {
          message: `Missing required parameters. Required : connector_id`,
        },
      });
      return;
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
    return res.status(200).send({
      id: connector.id,
      type: connector.type,
      lastSyncStatus: connector.lastSyncStatus,
      lastSyncStartTime: connector.lastSyncStartTime?.getTime(),
      lastSyncSuccessfulTime: connector.lastSyncSuccessfulTime?.getTime(),
      firstSuccessfulSyncTime: connector.firstSuccessfulSyncTime?.getTime(),
      firstSyncProgress: connector.firstSyncProgress,
    });
  } catch (e) {
    logger.error({ error: e }, "Error while getting the connector.");
    res.status(500).send({
      error: { message: "Error while getting the connector." },
    });
  }
};

export const getConnectorAPIHandler = withLogging(_getConnector);
