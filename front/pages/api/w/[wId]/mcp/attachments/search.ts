import type { NextApiRequest, NextApiResponse } from "next";

import type {
  SearchForAttachResponseBody,
  ToolContentNode,
} from "@app/lib/actions/mcp_attachments";
import { searchServerForAttachments } from "@app/lib/actions/mcp_attachments";
import { getConnectionForMCPServer } from "@app/lib/actions/mcp_authentication";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { supportsAttachmentsByInternalMCPServerId } from "@app/lib/actions/mcp_internal_actions/constants";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type { SearchForAttachResponseBody, ToolContentNode };

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SearchForAttachResponseBody>>,
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

  const { query, pageSize: pageSizeParam } = req.query;
  if (typeof query !== "string" || query.length < 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Query parameter is required.",
      },
    });
  }

  const pageSize = pageSizeParam ? parseInt(pageSizeParam as string, 10) : 25;

  try {
    const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
    const serverViews = await MCPServerViewResource.listBySpaces(auth, spaces);
    const attachmentServerViews = serverViews.filter((view) =>
      supportsAttachmentsByInternalMCPServerId(view.mcpServerId)
    );

    if (attachmentServerViews.length === 0) {
      return res.status(200).json({
        nodes: [],
        resultsCount: 0,
      });
    }

    const results = await Promise.all(
      attachmentServerViews.map(async (serverView) => {
        const serverId = serverView.mcpServerId;
        const connectionType: MCPServerConnectionConnectionType =
          serverView.oAuthUseCase === "platform_actions"
            ? "workspace"
            : "personal";

        const connectionResult = await getConnectionForMCPServer(auth, {
          mcpServerId: serverId,
          connectionType,
        });

        if (!connectionResult) {
          return [];
        }

        const serverNodes = await searchServerForAttachments({
          auth,
          serverId,
          query,
          pageSize,
          accessToken: connectionResult.access_token,
        });

        const serverJson = serverView.toJSON();
        return serverNodes.map((node) => ({
          ...node,
          serverViewId: serverView.sId,
          serverName: getMcpServerViewDisplayName(serverJson),
          serverIcon: serverJson.server.icon,
        }));
      })
    );

    const allNodes = results.flat();

    return res.status(200).json({
      nodes: allNodes,
      resultsCount: allNodes.length,
    });
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      "Error in attachment search"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to search for attachments: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
