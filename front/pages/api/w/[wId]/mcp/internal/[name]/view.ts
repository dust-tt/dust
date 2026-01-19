import type { NextApiRequest, NextApiResponse } from "next";

import {
  isAutoInternalMCPServerName,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export type GetInternalMCPServerViewResponseBody = {
  serverView: MCPServerViewType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetInternalMCPServerViewResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { method } = req;
  const { name } = req.query;

  if (!isString(name)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid internal server name.",
      },
    });
  }

  switch (method) {
    case "GET": {
      // First check if it's a valid internal MCP server name.
      if (!isInternalMCPServerName(name)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `"${name}" is not a valid internal MCP server name.`,
          },
        });
      }

      // Then check if it's an auto internal server (auto or auto_hidden_builder).
      if (!isAutoInternalMCPServerName(name)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `"${name}" is not an auto internal MCP server.`,
          },
        });
      }

      // TypeScript narrows `name` here after the type guard checks.
      const autoInternalName = name;

      // Ensure all auto tools are created first.
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

      // Get the MCPServerView for this auto internal tool.
      const serverView =
        await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          autoInternalName
        );

      if (!serverView) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "mcp_server_view_not_found",
            message: `MCPServerView for internal server "${name}" not found.`,
          },
        });
      }

      return res.status(200).json({
        serverView: serverView.toJSON(),
      });
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
