import { NotionConnectorStateModel } from "@connectors/lib/models/notion";
import { issueNotionWebhookRegistration } from "@connectors/lib/notion_webhook_registration";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import type { Request, Response } from "express";

type CreateNotionWebhookRegistrationParams = {
  connector_id: string;
};

type CreateNotionWebhookRegistrationResBody = WithConnectorsAPIErrorReponse<{
  expiresAt: string;
  notionWorkspaceId: string;
  registrationToken: string;
}>;

const _createNotionWebhookRegistrationHandler = async (
  req: Request<
    CreateNotionWebhookRegistrationParams,
    CreateNotionWebhookRegistrationResBody,
    never
  >,
  res: Response<CreateNotionWebhookRegistrationResBody>
) => {
  const { connector_id } = req.params;
  const connectorState = await NotionConnectorStateModel.findOne({
    where: { connectorId: connector_id },
  });

  if (!connectorState) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found",
        message: `Notion connector state not found for connector '${connector_id}'`,
      },
    });
  }

  const { expiresAt, registrationToken } = await issueNotionWebhookRegistration(
    {
      notionWorkspaceId: connectorState.notionWorkspaceId,
    }
  );

  logger.info(
    {
      connectorId: connector_id,
      expiresAt,
      notionWorkspaceId: connectorState.notionWorkspaceId,
    },
    "Created Notion webhook registration"
  );

  return res.status(200).json({
    expiresAt: expiresAt.toISOString(),
    notionWorkspaceId: connectorState.notionWorkspaceId,
    registrationToken,
  });
};

export const createNotionWebhookRegistrationHandler = withLogging(
  _createNotionWebhookRegistrationHandler
);
