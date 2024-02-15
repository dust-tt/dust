import type {
  ConnectorType,
  WithConnectorsAPIErrorReponse,
} from "@dust-tt/types";
import type { Request, Response } from "express";

import { GithubDiscussion, GithubIssue } from "@connectors/lib/models/github";
import { NotionPage } from "@connectors/lib/models/notion";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

type GetConnectorRes = WithConnectorsAPIErrorReponse<ConnectorType>;

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

  const connector = await ConnectorResource.fetchById(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
      status_code: 404,
    });
  }

  let firstSyncProgress = connector.firstSyncProgress;

  if (!firstSyncProgress) {
    switch (connector.type) {
      case "github": {
        const [issues, discussions] = await Promise.all([
          GithubIssue.count({
            where: {
              connectorId: connector.id,
            },
          }),
          GithubDiscussion.count({
            where: {
              connectorId: connector.id,
            },
          }),
        ]);
        firstSyncProgress = `${issues} issues, ${discussions} discussions`;
        break;
      }
      case "notion": {
        const c = await NotionPage.count({
          where: {
            connectorId: connector.id,
          },
        });
        firstSyncProgress = `${c} pages`;
        break;
      }
    }
  }

  return res.status(200).json({
    id: connector.id.toString(),
    type: connector.type,
    workspaceId: connector.workspaceId,
    dataSourceName: connector.dataSourceName,
    lastSyncStatus: connector.lastSyncStatus,
    lastSyncStartTime: connector.lastSyncStartTime?.getTime(),
    lastSyncFinishTime: connector.lastSyncFinishTime?.getTime(),
    lastSyncSuccessfulTime: connector.lastSyncSuccessfulTime?.getTime(),
    firstSuccessfulSyncTime: connector.firstSuccessfulSyncTime?.getTime(),
    firstSyncProgress,
    errorType: connector.errorType || undefined,
  });
};

export const getConnectorAPIHandler = withLogging(_getConnector);
