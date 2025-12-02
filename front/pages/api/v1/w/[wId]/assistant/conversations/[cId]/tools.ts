import type {
  GetMCPServerViewsResponseType,
  PatchConversationResponseType,
} from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

type FetchConversationToolsResponse = GetMCPServerViewsResponseType;

const ConversationToolActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  mcp_server_view_id: z.string(),
});

export type ConversationToolActionRequest = z.infer<
  typeof ConversationToolActionRequestSchema
>;

/**
 * @ignoreswagger
 */
async function handler(
  req: NextApiRequest,
  // eslint-disable-next-line dust/enforce-client-types-in-public-api
  res: NextApiResponse<
    WithAPIErrorResponse<
      FetchConversationToolsResponse | PatchConversationResponseType
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  const conversationId = req.query.cId;
  const conversationRes =
    await ConversationResource.fetchConversationWithoutContent(
      auth,
      conversationId
    );

  if (conversationRes.isErr()) {
    return apiErrorForConversation(req, res, conversationRes.error);
  }

  const conversationWithoutContent = conversationRes.value;

  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const parseResult = ConversationToolActionRequestSchema.safeParse(
        req.body
      );

      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(parseResult.error).toString(),
          },
        });
      }

      const { action, mcp_server_view_id } = parseResult.data;

      const mcpServerViewRes = await MCPServerViewResource.fetchById(
        auth,
        mcp_server_view_id
      );

      if (!mcpServerViewRes) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "mcp_server_view_not_found",
            message: "MCP server view not found",
          },
        });
      }

      const r = await ConversationResource.upsertMCPServerViews(auth, {
        conversation: conversationWithoutContent,
        mcpServerViews: [mcpServerViewRes],
        enabled: action === "add",
      });
      if (r.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to add MCP server view to conversation",
          },
        });
      }

      return res.status(200).json({ success: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
