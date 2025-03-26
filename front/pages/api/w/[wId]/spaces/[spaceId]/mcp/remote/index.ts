import { randomBytes } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";

import { fetchServerData } from "@app/lib/actions/mcp_actions";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { GetRemoteMCPServersResponseBody } from "@app/lib/swr/mcp_servers";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { MCPApiResponse } from "@app/types/mcp";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<MCPApiResponse | GetRemoteMCPServersResponseBody>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const { method } = req;
  const { wId } = req.query;

  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (!space.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_view_not_found",
        message: "The data source view you requested was not found.",
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

  const workspace = auth.workspace();

  if (!workspace || !space) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "Workspace or space not found",
      },
    });
  }

  switch (method) {
    case "GET": {
      try {
        const servers = await RemoteMCPServerResource.listBySpace(auth, space);

        const serverResponses = servers.map((server) => ({
          id: server.sId,
          workspaceId: wId,
          name: server.name,
          description: server.description || "",
          tools: server.cachedTools,
          url: server.url,
        }));

        return res.status(200).json({
          servers: serverResponses,
        });
      } catch (error) {
        logger.error("Error listing remote MCP servers:", error);
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Internal server error",
          },
        });
      }
    }

    case "POST": {
      const { url } = req.body;

      if (!url) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "URL is required",
          },
        });
      }

      const existingServers = await RemoteMCPServerResource.listBySpace(
        auth,
        space
      );
      const existingServer = existingServers.find(
        (server) => server.url === url
      );

      if (existingServer) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "A server with this URL already exists",
          },
        });
      }

      const metadata = await fetchServerData(url);
      const sharedSecret = randomBytes(32).toString("hex");

      const newRemoteMCPServer = await RemoteMCPServerResource.makeNew(
        auth,
        {
          workspaceId: workspace.id,
          name: metadata.name,
          url: url,
          description: metadata.description,
          cachedTools: metadata.tools,
          lastSyncAt: new Date(),
          sharedSecret,
        },
        space
      );

      return res.status(201).json({
        success: true,
        data: {
          id: newRemoteMCPServer.sId,
          workspaceId: wId,
          name: newRemoteMCPServer.name,
          description: newRemoteMCPServer.description ?? "",
          tools: newRemoteMCPServer.cachedTools,
          url: newRemoteMCPServer.url,
          sharedSecret: newRemoteMCPServer.sharedSecret,
        },
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
