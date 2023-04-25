import { Request, Response } from "express";

import { RESUME_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import logger from "@connectors/logger/logger";
import { withLogging } from "@connectors/logger/withlogging";
import { isConnectorProvider } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorResumeReqBody = {
  workspaceAPIKey: string;
  dataSourceName: string;
  workspaceId: string;
  nangoConnectionId: string;
};

type ConnectorResumeResBody =
  | { connectorId: string }
  | ConnectorsAPIErrorResponse;

const _resumeConnectorAPIHandler = async (
  req: Request<
    { connector_provider: string },
    ConnectorResumeResBody,
    ConnectorResumeReqBody
  >,
  res: Response<ConnectorResumeResBody>
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
    const connectorResumer =
      RESUME_CONNECTOR_BY_TYPE[req.params.connector_provider];

    const resumeRes = await connectorResumer(
      {
        workspaceAPIKey: req.body.workspaceAPIKey,
        dataSourceName: req.body.dataSourceName,
        workspaceId: req.body.workspaceId,
      },
      req.body.nangoConnectionId
    );

    if (resumeRes.isErr()) {
      res.status(500).send({ error: { message: resumeRes.error.message } });
      return;
    }

    return res.status(200).send({
      connectorId: resumeRes.value,
    });
  } catch (e) {
    logger.error(e, "Failed to resume the connector");
    return res
      .status(500)
      .send({ error: { message: "Could not resume the connector" } });
  }
};

export const resumeConnectorAPIHandler = withLogging(
  _resumeConnectorAPIHandler
);
