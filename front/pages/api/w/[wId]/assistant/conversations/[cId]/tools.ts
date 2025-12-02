import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type FetchConversationToolsResponse = {
  tools: MCPServerViewType[];
};

const ConversationToolActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  mcp_server_view_id: z.string(),
});

export type ConversationToolActionRequest = z.infer<
  typeof ConversationToolActionRequestSchema
>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<FetchConversationToolsResponse | { success: boolean }>
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

  switch (req.method) {
    case "GET":
      try {
        // Fetch all conversation MCP server views
        const conversationMCPServerViews =
          await ConversationResource.fetchMCPServerViews(
            auth,
            conversationWithoutContent
          );

        // Fetch the actual MCP server view details
        const tools: MCPServerViewType[] = [];
        for (const conversationView of conversationMCPServerViews) {
          if (conversationView.enabled) {
            const mcpServerViewRes = await MCPServerViewResource.fetchByModelPk(
              auth,
              conversationView.mcpServerViewId
            );
            if (mcpServerViewRes) {
              tools.push(mcpServerViewRes.toJSON());
            }
          }
        }

        res.status(200).json({ tools });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to fetch conversation tools",
          },
        });
      }
      break;

    case "POST":
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

      try {
        // Fetch the MCP server view by sId
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

        res.status(200).json({ success: true });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to update conversation tools",
          },
        });
      }
      break;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET or POST expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
