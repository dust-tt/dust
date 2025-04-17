import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { selectAgentForConversation } from "@app/lib/api/assistant/conversation";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";

export type SuggestResponseBody = {
  agentConfigurations: LightAgentConfigurationType[];
};

const SuggestQuerySchema = t.type({
  cId: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SuggestResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const queryValidation = SuggestQuerySchema.decode(req.query);
  if (isLeft(queryValidation)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters",
      },
    });
  }

  const { cId } = queryValidation.right;

  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(auth, cId);

  if (conversationRes.isErr()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  const conversation = conversationRes.value;

  const agentRes = await selectAgentForConversation(auth, conversation);

  if (agentRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Error selecting agent",
      },
    });
  }

  // For now, we'll return all active assistants
  // In the future, this could be enhanced with semantic search or other ranking
  // based on the message content
  res.status(200).json({
    agentConfigurations: agentRes.value,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
