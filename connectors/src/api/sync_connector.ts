import { Request, Response } from "express";

import { SYNC_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type GetSyncStatusRes = { workflowId: string } | ConnectorsAPIErrorResponse;

const _syncConnectorAPIHandler = async (
  req: Request<{ connector_id: string }, GetSyncStatusRes, undefined>,
  res: Response<GetSyncStatusRes>
) => {
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
    res.status(404).send({
      error: {
        message: `Connector with id ${req.params.connector_id} not found`,
      },
    });
    return;
  }
  const launchRes = await SYNC_CONNECTOR_BY_TYPE[connector.type](
    connector.id.toString()
  );
  if (launchRes.isErr()) {
    res.status(500).send({
      error: {
        message: launchRes.error.message,
      },
    });
    return;
  }

  return res.status(200).send({
    workflowId: launchRes.value,
  });
};

export const syncConnectorAPIHandler = withLogging(_syncConnectorAPIHandler);
