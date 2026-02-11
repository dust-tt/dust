import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { getSuggestedAgentsForContent } from "@app/lib/api/assistant/agent_suggestion";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getLastUserMessage } from "@app/lib/api/assistant/conversation";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WithAPIErrorResponse } from "@app/types/error";

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
        message: "The method passed is not supported, GET is expected.",
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

  // Get the conversation.
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
  // Get the last user message.
  // We could have passed the usermessage id instead of the conversation id, but user message has a randomly generated sId
  // and this comes from a route so since we don't want to pass the model id in a route we use the conversation sId.
  const lastUserMessage = await getLastUserMessage(auth, conversation);
  if (lastUserMessage.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Error getting last user message",
      },
    });
  }

  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "list",
    variant: "light",
  });

  const agentRes = await getSuggestedAgentsForContent(auth, {
    agents,
    content: lastUserMessage.value,
    conversationId: conversation.sId,
  });

  if (agentRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Error suggesting agents",
      },
    });
  }

  res.status(200).json({
    agentConfigurations: agentRes.value,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
