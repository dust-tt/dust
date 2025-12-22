import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { UserMessageContext, WithAPIErrorResponse } from "@app/types";

export type PostSendAgentReinforcerResponseBody = {
  conversationSId: string;
};

const AGENT_REINFORCER_ID = "IZwTPFdEGJ";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostSendAgentReinforcerResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only superusers can use the agent reinforcer.",
      },
    });
  }

  const user = auth.user();
  if (!user) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "User not authenticated.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const { agentId, editInstructions } = req.body as {
        agentId?: string;
        editInstructions?: string;
      };

      if (!agentId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "agentId is required.",
          },
        });
      }

      // Fetch the target agent configuration to get its prompt
      const targetAgent = await getAgentConfiguration(auth, {
        agentId,
        variant: "full",
      });
      if (!targetAgent) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: `Agent with ID ${agentId} not found.`,
          },
        });
      }

      // Fetch the AgentReinforcer agent
      const reinforcerAgent = await getAgentConfiguration(auth, {
        agentId: AGENT_REINFORCER_ID,
        variant: "light",
      });
      if (!reinforcerAgent) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "agent_configuration_not_found",
            message: `AgentReinforcer with ID ${AGENT_REINFORCER_ID} not found.`,
          },
        });
      }

      // Create the conversation
      const conversation = await createConversation(auth, {
        title: `Reinforce: ${targetAgent.name}`,
        visibility: "unlisted",
        spaceId: null,
      });

      // Build the message content
      const messageContent = `# Agent ID: ${agentId}

# Agent Prompt

${targetAgent.instructions ?? "(No instructions)"}

# Improvements

${editInstructions ?? "Please suggest improvements to this agent's prompt."}`;

      const userJson = user.toJSON();
      const context: UserMessageContext = {
        username: userJson.username,
        fullName: userJson.fullName,
        email: userJson.email,
        profilePictureUrl: userJson.image,
        timezone: "UTC",
        origin: "agent_reinforcer",
      };

      const postRes = await postUserMessage(auth, {
        conversation,
        content: messageContent,
        mentions: [
          {
            configurationId: AGENT_REINFORCER_ID,
          },
        ],
        context,
        skipToolsValidation: false,
      });

      if (postRes.isErr()) {
        return apiError(req, res, postRes.error);
      }

      res.status(200).json({ conversationSId: conversation.sId });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
