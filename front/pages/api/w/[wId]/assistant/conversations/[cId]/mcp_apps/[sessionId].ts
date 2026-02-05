import type { NextApiRequest, NextApiResponse } from "next";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMCPAppSessionResource } from "@app/lib/resources/agent_mcp_app_session_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import { getGmailUIContent } from "@app/lib/api/actions/servers/gmail/ui";

export interface MCPAppSessionResponseType {
  html: string;
  csp: Record<string, string> | null;
  resourceUri: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<MCPAppSessionResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { cId, sessionId } = req.query;

  if (!isString(cId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  if (!isString(sessionId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `sessionId` (string) is required.",
      },
    });
  }

  // Verify the conversation exists and user has access
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(auth, cId);

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  switch (req.method) {
    case "GET": {
      // Fetch the session
      const session = await AgentMCPAppSessionResource.fetchById(
        auth,
        sessionId
      );

      if (!session) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "action_not_found",
            message: "MCP App session not found.",
          },
        });
      }

      // Verify the session belongs to this conversation
      if (session.conversationId !== cId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "action_not_found",
            message: "MCP App session not found in this conversation.",
          },
        });
      }

      // Fetch the action to get the tool output
      const action = await AgentMCPActionResource.fetchByModelIdWithAuth(
        auth,
        session.agentMCPActionId
      );

      if (!action) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "action_not_found",
            message: "MCP action not found for this session.",
          },
        });
      }

      // Get the action with output items
      const [actionWithOutput] =
        await AgentMCPActionResource.enrichActionsWithOutputItems(auth, [
          action,
        ]);

      // Get the HTML content for the resource URI
      // For now, we only support Gmail UI resources
      let html: string | null = null;

      if (session.resourceUri.startsWith("ui://gmail/")) {
        html = getGmailUIContent(session.resourceUri, actionWithOutput.output);
      }

      if (!html) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Unsupported resource URI: ${session.resourceUri}`,
          },
        });
      }

      return res.status(200).json({
        html,
        csp: session.csp,
        resourceUri: session.resourceUri,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
