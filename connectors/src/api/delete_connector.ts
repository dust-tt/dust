import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";

import { getConnectorManager } from "@connectors/connectors";
import { terminateAllWorkflowsForConnectorId } from "@connectors/lib/temporal";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

type ConnectorDeleteResBody = WithConnectorsAPIErrorReponse<{ success: true }>;

const _deleteConnectorAPIHandler = async (
  req: Request<{ connector_id: string }, ConnectorDeleteResBody>,
  res: Response<ConnectorDeleteResBody>
) => {
  const force = req.query.force === "true";
  const connector = await ConnectorResource.fetchById(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
    });
  }

  const connectorManager = getConnectorManager({
    connectorProvider: connector.type,
    connectorId: connector.id,
  });

  const stopRes = await connectorManager.stop();

  if (stopRes.isErr() && !force) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: stopRes.error.message,
      },
    });
  }

  const cleanRes = await connectorManager.clean({ force });
  if (cleanRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: cleanRes.error.message,
      },
    });
  }
  await terminateAllWorkflowsForConnectorId(connector.id);
  return res.json({
    success: true,
  });
};

export const deleteConnectorAPIHandler = withLogging(
  _deleteConnectorAPIHandler
);
