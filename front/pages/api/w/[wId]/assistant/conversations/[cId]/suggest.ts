/** @ignoreswagger */
import { getSuggestedAgentsForContent } from "@app/lib/api/assistant/agent_suggestion";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getLastUserMessage } from "@app/lib/api/assistant/conversation";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type SuggestResponseBody = {
  agentConfigurations: LightAgentConfigurationType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SuggestResponseBody>>,
  auth: Authenticator,
  { conversation }: { conversation: ConversationResource }
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

  // Get the last user message.
  // We could have passed the usermessage id instead of the conversation id, but user message has a randomly generated sId
  // and this comes from a route so since we don't want to pass the model id in a route we use the conversation sId.
  const lastUserMessage = await getLastUserMessage(auth, conversation.toJSON());
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { conversation: {} })
);
