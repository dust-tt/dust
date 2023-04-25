import { Request, Response } from "express";

import { CREATE_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import logger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { isConnectorProvider } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorCreateReqBody = {
  workspaceAPIKey: string;
  dataSourceName: string;
  workspaceId: string;
  nangoConnectionId: string;
};

type ConnectorCreateResBody =
  | { connectorId: string }
  | ConnectorsAPIErrorResponse;

const _createConnectorAPIHandler = async (
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

    if (!isConnectorProvider(req.params.connector_provider)) {
      return res.status(400).send({
        error: {
          message: `Unknown connector provider ${req.params.connector_provider}`,
        },
      });
    }
    const connectorCreator =
      CREATE_CONNECTOR_BY_TYPE[req.params.connector_provider];

    const connectorRes = await connectorCreator(
      {
        workspaceAPIKey: req.body.workspaceAPIKey,
        dataSourceName: req.body.dataSourceName,
        workspaceId: req.body.workspaceId,
      },
      req.body.nangoConnectionId
    );

    if (connectorRes.isErr()) {
      res.status(500).send({ error: { message: connectorRes.error.message } });
      return;
    }

    return res.status(200).send({
      connectorId: connectorRes.value,
    });
  } catch (e) {
    logger.error(e, "Failed to create the connector");
    return res
      .status(500)
      .send({ error: { message: "Could not create the connector" } });
  }
};

export const createConnectorAPIHandler = withLogging(
  _createConnectorAPIHandler
);
