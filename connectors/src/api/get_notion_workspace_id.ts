import type { Request, Response } from "express";

import { NotionConnectorStateModel } from "@connectors/lib/models/notion";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

type GetNotionWorkspaceIdParams = {
  connector_id: string;
};

type GetNotionWorkspaceIdResBody = WithConnectorsAPIErrorReponse<{
  notionWorkspaceId: string;
}>;

/**
 * GET /connectors/:connector_id/notion/workspace_id
 * Get the Notion workspace ID for a connector.
 */
const _getNotionWorkspaceIdHandler = async (
  req: Request<GetNotionWorkspaceIdParams, GetNotionWorkspaceIdResBody, never>,
  res: Response<GetNotionWorkspaceIdResBody>
) => {
  const { connector_id } = req.params;

  try {
    const connectorState = await NotionConnectorStateModel.findOne({
      where: {
        connectorId: connector_id,
      },
    });

    if (!connectorState) {
      logger.error(
        { connector_id },
        "Notion connector state not found for connector"
      );

      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "connector_not_found",
          message: `Notion connector state not found for connector '${connector_id}'`,
        },
      });
    }

    logger.info(
      { connector_id, notionWorkspaceId: connectorState.notionWorkspaceId },
      "Successfully retrieved Notion workspace ID"
    );

    return res.status(200).json({
      notionWorkspaceId: connectorState.notionWorkspaceId,
    });
  } catch (error) {
    logger.error({ error, connector_id }, "Failed to get Notion workspace ID");

    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to get Notion workspace ID",
      },
    });
  }
};

export const getNotionWorkspaceIdHandler = withLogging(
  _getNotionWorkspaceIdHandler
);
