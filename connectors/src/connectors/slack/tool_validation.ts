import type { Result } from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";

import { apiConfig } from "@connectors/lib/api/config";
import logger from "@connectors/logger/logger";
import {
  BotAnswerParams,
  getSlackConnector,
} from "@connectors/connectors/slack/bot";

interface ToolValidationParams {
  actionId: number;
  approved: "approved" | "rejected";
  conversationId: string;
  messageId: string;
}

export async function botValidateToolExecution(
  { actionId, approved, conversationId, messageId }: ToolValidationParams,
  params: BotAnswerParams
) {
  const connectorRes = await getSlackConnector(params);
  if (connectorRes.isErr()) {
    return connectorRes;
  }

  const { connector } = connectorRes.value;

  const dustAPI = new DustAPI(
    apiConfig.getDustAPIConfig(),
    {
      apiKey: connector.workspaceAPIKey,
      // We neither need group ids nor user email headers here because validate tool endpoint is not
      // gated by group ids or user email headers.
      extraHeaders: {},
      workspaceId: connector.workspaceId,
    },
    logger,
    apiConfig.getDustFrontAPIUrl()
  );

  const res = await dustAPI.validateAction({
    conversationId,
    messageId,
    actionId,
    approved,
  });

  return res;
}
