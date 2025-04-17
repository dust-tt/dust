import type { NextApiRequest, NextApiResponse } from "next";

import { fetchRemoteServerMetaDataByURL } from "@app/lib/actions/mcp_metadata";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { MCPServerType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type SyncMCPServerResponseBody = {
  success: boolean;
  server: MCPServerType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SyncMCPServerResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { method } = req;
  const { serverId } = req.query;

  if (typeof serverId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only users that are `admins` for the current workspace can manage MCP servers.",
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

  try {
    const metadata = await fetchRemoteServerMetaDataByURL(auth, server.url);
    await server.updateMetadata(auth, {
      cachedName: metadata.name,
      cachedDescription: metadata.description,
      cachedTools: metadata.tools,
      lastSyncAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      server: server.toJSON(),
    });
  } catch (e) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Error fetching remote server metadata, URL may be invalid.",
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
