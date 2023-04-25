import { Request, Response } from "express";

import { STOP_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import logger from "@connectors/logger/logger";
import { isConnectorProvider } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorStopReqBody = {
  dataSourceName: string;
  workspaceId: string;
};

type ConnectorStopResBody =
  | { connectorId: string }
  | ConnectorsAPIErrorResponse;

export const stopConnectorAPIHandler = async (
  req: Request<
    { connector_provider: string },
    ConnectorStopResBody,
    ConnectorStopReqBody
  >,
  res: Response<ConnectorStopResBody>
) => {
  try {
    if (!req.body.dataSourceName || !req.body.workspaceId) {
      // We would probably want to return the same error inteface than we use in the /front package. TBD.
      res.status(400).send({
        error: {
          message: `Missing required parameters. Required : dataSourceName, workspaceId`,
        },
      });
      return;
    }

    if (!isConnectorProvider(req.params.connector_provider)) {
      return res.status(400).send({
        error: {
          message: `Unknown connector provider ${req.params.connector_provider}`,
        },
      });
    }
    const connectorStopper =
      STOP_CONNECTOR_BY_TYPE[req.params.connector_provider];

    const stopRes = await connectorStopper({
      dataSourceName: req.body.dataSourceName,
      workspaceId: req.body.workspaceId,
    });

    if (stopRes.isErr()) {
      res.status(500).send({ error: { message: stopRes.error.message } });
      return;
    }

    return res.status(200).send({
      connectorId: stopRes.value,
    });
  } catch (e) {
    logger.error(e, "Failed to stop the connector");
    return res
      .status(500)
      .send({ error: { message: "Could not stop the connector" } });
  }
};
