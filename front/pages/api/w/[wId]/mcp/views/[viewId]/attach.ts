import type { NextApiRequest, NextApiResponse } from "next";

import type { GetFileToAttachResponse } from "@app/lib/actions/mcp_attachments";
import { getFileToAttach } from "@app/lib/actions/mcp_attachments";
import { getConnectionForMCPServer } from "@app/lib/actions/mcp_authentication";
import { supportsAttachmentsByInternalMCPServerId } from "@app/lib/actions/mcp_internal_actions/constants";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetFileToAttachResponse>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET method is supported.",
      },
    });
  }

  const { viewId, fileId } = req.query;
  if (typeof viewId !== "string" || typeof fileId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "viewId and fileId are required.",
      },
    });
  }

  const serverView = await MCPServerViewResource.fetchById(auth, viewId);
  if (!serverView) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_not_found",
        message: "Server view not found.",
      },
    });
  }
  if (!supportsAttachmentsByInternalMCPServerId(serverView.mcpServerId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "This server does not support attachments.",
      },
    });
  }

  const serverId = serverView.mcpServerId;
  const connectionType: MCPServerConnectionConnectionType =
    serverView.oAuthUseCase === "platform_actions" ? "workspace" : "personal";
  const connectionResult = await getConnectionForMCPServer(auth, {
    mcpServerId: serverId,
    connectionType,
  });

  if (!connectionResult) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "mcp_auth_error",
        message: "Authentication required. Please connect your account first.",
      },
    });
  }

  try {
    const result = await getFileToAttach({
      auth,
      serverId,
      fileId,
      accessToken: connectionResult.access_token,
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error(
      {
        error,
        serverId,
        fileId,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Error fetching file for attachment"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to fetch file: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
