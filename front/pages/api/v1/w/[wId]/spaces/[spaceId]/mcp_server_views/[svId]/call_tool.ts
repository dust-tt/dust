import { connectToMCPServer } from "@app/lib/actions/mcp_metadata";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { CallMCPToolResponseType } from "@dust-tt/client";
import { CallMCPToolRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<CallMCPToolResponseType>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { svId } = req.query;
  if (!isString(svId)) {
    return res.status(400).json({
      error: {
        type: "invalid_request_error",
        message: "Missing or invalid svId parameter.",
      },
    });
  }

  const view = await MCPServerViewResource.fetchById(auth, svId);
  if (!view) {
    return res.status(404).json({
      error: {
        type: "mcp_server_view_not_found",
        message: "MCP server view not found.",
      },
    });
  }

  if (view.space.sId !== space.sId) {
    return res.status(404).json({
      error: {
        type: "mcp_server_view_not_found",
        message: "MCP server view not found in this space.",
      },
    });
  }

  const { method } = req;

  switch (method) {
    case "POST": {
      const bodyRes = CallMCPToolRequestBodySchema.safeParse(req.body);
      if (!bodyRes.success) {
        return res.status(400).json({
          error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${bodyRes.error.message}`,
          },
        });
      }

      const { toolName, arguments: toolArgs } = bodyRes.data;

      const clientRes = await connectToMCPServer(auth, {
        params: {
          type: "mcpServerId",
          mcpServerId: view.mcpServerId,
          oAuthUseCase: view.oAuthUseCase,
        },
        directToolExecution: true,
      });

      if (clientRes.isErr()) {
        const err = clientRes.error;

        logger.error({ error: err, svId }, "Failed to connect to MCP server");
        return res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "Failed to connect to MCP server.",
          },
        });
      }

      const mcpClient = clientRes.value;
      try {
        const result = await mcpClient.callTool({
          name: toolName,
          arguments: toolArgs,
        });

        if (!("content" in result) || !Array.isArray(result.content)) {
          return res.status(500).json({
            error: {
              type: "internal_server_error",
              message: "Unexpected tool result format.",
            },
          });
        }

        const content: CallMCPToolResponseType["result"]["content"] =
          result.content.map((block: { type: string; text?: string }) => ({
            type: block.type,
            ...("text" in block ? { text: block.text } : {}),
          }));

        return res.status(200).json({
          success: true,
          result: {
            content,
            isError: result.isError === true,
          },
        });
      } finally {
        await mcpClient.close();
      }
    }

    default:
      return res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message: "Only POST is supported.",
        },
      });
  }
}

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
