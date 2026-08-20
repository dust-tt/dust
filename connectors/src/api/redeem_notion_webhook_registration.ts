import { connectorsConfig } from "@connectors/connectors/shared/config";
import { NotionConnectorStateModel } from "@connectors/lib/models/notion";
import { redeemNotionWebhookRegistration } from "@connectors/lib/notion_webhook_registration";
import { WebhookRouterConfigService } from "@connectors/lib/webhook_router_config";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import type { Request, Response } from "express";
import { z } from "zod";
import { fromError } from "zod-validation-error";

type RedeemNotionWebhookRegistrationParams = {
  providerWorkspaceId: string;
};

type RedeemNotionWebhookRegistrationResBody = WithConnectorsAPIErrorReponse<{
  success: boolean;
}>;

const RedeemNotionWebhookRegistrationBodySchema = z.object({
  registrationToken: z.string(),
  signingSecret: z.string(),
});

type RedeemNotionWebhookRegistrationReqBody = z.infer<
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
  const bodyValidation = RedeemNotionWebhookRegistrationBodySchema.safeParse(
    req.body
  );
  if (!bodyValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
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

  const { registrationToken, signingSecret } = bodyValidation.data;
  const connectorIds = connectorStates.map((state) => state.connectorId);
  const region = connectorsConfig.getCurrentRegion();
  const webhookRouterConfigService = new WebhookRouterConfigService();

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

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "authorization_error",
        message: "Invalid or expired Notion webhook registration.",
      },
    });
  }

  logger.info(
    {
      alreadyRedeemed: result.value.alreadyRedeemed,
      connectorIds,
      notionWorkspaceId: providerWorkspaceId,
      region,
    },
    "Redeemed Notion webhook registration"
  );
  return res.status(200).json({ success: true });
};

export const redeemNotionWebhookRegistrationHandler = withLogging(
  _redeemNotionWebhookRegistrationHandler
);
