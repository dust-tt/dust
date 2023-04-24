import { Request, Response } from "express";

import { createSlackConnector } from "../connectors/slack/slack";
import { ConnectorsAPIErrorResponse } from "../types/errors";

type ConnectorCreateReqBody = {
  APIKey: string;
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
      !req.body.APIKey ||
      !req.body.dataSourceName ||
      !req.body.workspaceId ||
      !req.body.nangoConnectionId
    ) {
      // We would probably want to return the same error inteface than we use in the /front package. TBD.
      res.status(400).send({
        error: {
          message: `Missing required parameters. Required : APIKey, dataSourceName, workspaceId, nangoConnectionId`,
        },
      });
      return;
    }
    const conncetorRes = await createSlackConnector(
      {
        APIKey: req.body.APIKey,
        dataSourceName: req.body.dataSourceName,
        workspaceId: req.body.workspaceId,
      },
      req.body.nangoConnectionId
    );
    if (conncetorRes.isErr()) {
      res.status(500).send({ error: { message: conncetorRes.error.message } });
      return;
    }

    return res.status(200).send({
      connectorId: conncetorRes.value,
    });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .send({ error: { message: "Could not create the connector" } });
  }
};
