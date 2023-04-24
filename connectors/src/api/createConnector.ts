import { Result } from "@connectors/lib/result";
import { Request, Response } from "express";

import { createSlackConnector } from "../connectors/slack/slack";
import logger from "../logger/logger";
import { ConnectorsAPIErrorResponse } from "../types/errors";

type ConnectorCreateReqBody = {
  workspaceAPIKey: string;
  dataSourceName: string;
  workspaceId: string;
  nangoConnectionId: string;
};

type ConnectorCreateResBody =
  | { connectorId: string }
  | ConnectorsAPIErrorResponse;

export const createConnectorAPIHandler = async (
  req: Request<
    { connector_provider: string },
    ConnectorCreateResBody,
    ConnectorCreateReqBody
  >,
  res: Response<ConnectorCreateResBody>
) => {
  try {
    if (
      !req.body.workspaceAPIKey ||
      !req.body.dataSourceName ||
      !req.body.workspaceId ||
      !req.body.nangoConnectionId
    ) {
      // We would probably want to return the same error inteface than we use in the /front package. TBD.
      res.status(400).send({
        error: {
          message: `Missing required parameters. Required : workspaceAPIKey, dataSourceName, workspaceId, nangoConnectionId`,
        },
      });
      return;
    }
    let conncetorRes: Result<string, Error>;
    if (req.params.connector_provider === "slack") {
      conncetorRes = await createSlackConnector(
        {
          workspaceAPIKey: req.body.workspaceAPIKey,
          dataSourceName: req.body.dataSourceName,
          workspaceId: req.body.workspaceId,
        },
        req.body.nangoConnectionId
      );
    } else {
      return res.status(400).send({
        error: {
          message: `Unknown connector provider ${req.params.connector_provider}`,
        },
      });
    }
    if (conncetorRes.isErr()) {
      res.status(500).send({ error: { message: conncetorRes.error.message } });
      return;
    }

    return res.status(200).send({
      connectorId: conncetorRes.value,
    });
  } catch (e) {
    logger.error(e);
    return res
      .status(500)
      .send({ error: { message: "Could not create the connector" } });
  }
};
