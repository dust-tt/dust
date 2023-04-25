import { Request, Response } from "express";

import { Connector } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorSyncStatus } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type GetSyncStatusRes =
  | {
      lastSyncStatus?: ConnectorSyncStatus;
      lastSyncStartTime?: number;
      lastSuccessfulSyncTime?: number;
    }
  | ConnectorsAPIErrorResponse;

const _getConnectorStatusAPIHandler = async (
  req: Request<{ connector_id: string }, GetSyncStatusRes, undefined>,
  res: Response<GetSyncStatusRes>
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
      return res.status(404).send({
        error: {
          message: `Connector not found`,
        },
      });
    }
    return res.status(200).send({
      lastSyncStatus: connector.lastSyncStatus,
      lastSyncStartTime: connector.lastSyncStartTime?.getTime(),
      lastSuccessfulSyncTime: connector.lastSyncSuccessfulTime?.getTime(),
    });
  } catch (e) {
    logger.error({ error: e }, "Error while getting the connector's status.");
    res.status(500).send({
      error: { message: "Error while getting the connector's status." },
    });
  }
};

export const getConnectorStatusAPIHandler = withLogging(
  _getConnectorStatusAPIHandler
);
