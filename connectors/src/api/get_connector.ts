import { isConnectorProvider } from "@dust-tt/client";
import type { Request, Response } from "express";

import { GithubDiscussion, GithubIssue } from "@connectors/lib/models/github";
import { NotionPage } from "@connectors/lib/models/notion";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorType } from "@connectors/types";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

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

  return res.status(200).json(connector.toJSON());
};

export const getConnectorAPIHandler = withLogging(_getConnector);

type GetConnectorsResponseBody = WithConnectorsAPIErrorReponse<ConnectorType[]>;

const _getConnectors = async (
  req: Request<Record<string, string>, GetConnectorsResponseBody, undefined>,
  res: Response<GetConnectorsResponseBody>
) => {
  if (
    typeof req.query.provider !== "string" ||
    !isConnectorProvider(req.query.provider)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "unknown_connector_provider",
        message: `Unknown connector provider ${req.params.provider}`,
      },
    });
  }

  if (typeof req.query.connector_id === "string") {
    req.query.connector_id = [req.query.connector_id];
  }

  if (!Array.isArray(req.query.connector_id)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Expecting connector_id to be passed as query parameters`,
      },
    });
  }

  // TODO(salesforce): implement this
  if (req.query.provider === "salesforce") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Salesforce is not supported in this endpoint`,
      },
    });
  }

  const connectors = await ConnectorResource.fetchByIds(
    req.query.provider,
    req.query.connector_id as string[]
  );

  return res.status(200).json(connectors.map((c) => c.toJSON()));
};

export const getConnectorsAPIHandler = withLogging(_getConnectors);
