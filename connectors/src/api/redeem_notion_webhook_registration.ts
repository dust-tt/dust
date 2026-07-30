import { connectorsConfig } from "@connectors/connectors/shared/config";
import { NotionConnectorStateModel } from "@connectors/lib/models/notion";
import {
  NotionWebhookRegistrationError,
  redeemNotionWebhookRegistration,
} from "@connectors/lib/notion_webhook_registration";
import { WebhookRouterConfigService } from "@connectors/lib/webhook_router_config";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

type RedeemNotionWebhookRegistrationParams = {
  providerWorkspaceId: string;
};

type RedeemNotionWebhookRegistrationResBody = WithConnectorsAPIErrorReponse<{
  success: boolean;
}>;

const RedeemNotionWebhookRegistrationBodySchema = t.type({
  registrationToken: t.string,
  signingSecret: t.string,
});

type RedeemNotionWebhookRegistrationReqBody = t.TypeOf<
  typeof RedeemNotionWebhookRegistrationBodySchema
>;

const _redeemNotionWebhookRegistrationHandler = async (
  req: Request<
    RedeemNotionWebhookRegistrationParams,
    RedeemNotionWebhookRegistrationResBody,
    RedeemNotionWebhookRegistrationReqBody
  >,
  res: Response<RedeemNotionWebhookRegistrationResBody>
) => {
  const { providerWorkspaceId } = req.params;
  const bodyValidation = RedeemNotionWebhookRegistrationBodySchema.decode(
    req.body
  );
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const connectorStates = await NotionConnectorStateModel.findAll({
    where: { notionWorkspaceId: providerWorkspaceId },
  });
  if (connectorStates.length === 0) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found",
        message: "No Notion connectors found for this workspace.",
      },
    });
  }

  const { registrationToken, signingSecret } = bodyValidation.right;
  const connectorIds = connectorStates.map((state) => state.connectorId);
  const region = connectorsConfig.getCurrentRegion();
  const webhookRouterConfigService = new WebhookRouterConfigService();

  try {
    const result = await redeemNotionWebhookRegistration({
      notionWorkspaceId: providerWorkspaceId,
      registrationToken,
      signingSecret,
      storeSigningSecret: async () => {
        await webhookRouterConfigService.syncEntry(
          "notion",
          providerWorkspaceId,
          signingSecret,
          region,
          connectorIds
        );
      },
    });

    logger.info(
      {
        alreadyRedeemed: result.alreadyRedeemed,
        connectorIds,
        notionWorkspaceId: providerWorkspaceId,
        region,
      },
      "Redeemed Notion webhook registration"
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof NotionWebhookRegistrationError) {
      return apiError(req, res, {
        status_code: 401,
        api_error: {
          type: "authorization_error",
          message: "Invalid or expired Notion webhook registration.",
        },
      });
    }
    throw error;
  }
};

export const redeemNotionWebhookRegistrationHandler = withLogging(
  _redeemNotionWebhookRegistrationHandler
);
