import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServerData } from "@app/lib/actions/mcp_actions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { MCPApiResponse } from "@app/types/mcp";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<MCPApiResponse>>,
  auth: Authenticator
): Promise<void> {
  const { method } = req;
  const { wId, serverId } = req.query;

  if (typeof wId !== "string" || typeof serverId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only users that are `builders` for the current workspace can manage MCP servers.",
      },
    });
  }

  if (auth.workspace()?.sId !== wId) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You don't have access to this workspace.",
      },
    });
  }

  // Find the specific remote MCP server
  const server = await RemoteMCPServerResource.fetchById(auth, serverId);

  if (!server) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "Remote MCP Server not found",
      },
    });
  }

  if (method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const metadata = await fetchServerData(server.url);

  await server.updateServer(auth, {
    name: metadata.name,
    description: metadata.description,
    cachedTools: metadata.tools,
    lastSyncAt: new Date(),
  });

  return res.status(200).json({
    success: true,
    data: {
      id: server.sId,
      workspaceId: wId,
      name: server.name,
      description: server.description || "",
      tools: server.cachedTools,
      url: server.url,
      sharedSecret: server.sharedSecret,
    },
  });
}

export default withSessionAuthenticationForWorkspace(handler);
