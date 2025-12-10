import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  isMCPServerConnectionConnectionType,
  MCPServerConnectionResource,
} from "@app/lib/resources/mcp_server_connection_resource";
import logger, { auditLog } from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { getOAuthConnectionAccessToken, isString } from "@app/types";

export type GetTokenResponseBody = {
  token: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTokenResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_connection_not_found",
        message: "The connection you requested was not found.",
      },
    });
  }

  const { mcpServerId, connectionType, userId } = req.query;
  if (!isString(mcpServerId) || !isString(connectionType)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  if (!isMCPServerConnectionConnectionType(connectionType)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid connection type.",
      },
    });
  }

  // For personal connections, userId is required as a query parameter
  if (connectionType === "personal") {
    if (!isString(userId)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "User ID is required for personal connections.",
        },
      });
    }

    // Find personal connection for the specific user
    const connections = await MCPServerConnectionResource.listByMCPServer(
      auth,
      { mcpServerId }
    );

    if (connections.isErr()) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "internal_server_error",
          message: "Failed to fetch connections.",
        },
      });
    }

    const connection =
      connections.value.find(
        (conn) =>
          conn.connectionType === "personal" && conn.user?.sId === userId
      ) ?? null;

    if (!connection) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to fetch connections.",
        },
      });
    }

    switch (req.method) {
      case "GET":
        if (!connection.connectionId) {
          return res.status(200).json({ token: null });
        }

        auditLog(
          {
            author: auth.user()?.toJSON() ?? "no-author",
            connectionId: connection.connectionId,
            mcpServerId,
            connectionType: "personal",
            userId,
          },
          "Fetching MCP access token"
        );

        const tokenRes = await getOAuthConnectionAccessToken({
          config: apiConfig.getOAuthAPIConfig(),
          logger,
          connectionId: connection.connectionId,
        });

        if (tokenRes.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to fetch access token: ${tokenRes.error.message}`,
            },
          });
        }

        return res.status(200).json({
          token: tokenRes.value.access_token,
        });

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

  // For workspace connections, find the workspace connection
  const connectionRes = await MCPServerConnectionResource.findByMCPServer(
    auth,
    {
      mcpServerId,
      connectionType: "workspace",
    }
  );

  if (connectionRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch connection.",
      },
    });
  }

  const connection = connectionRes.value;

  switch (req.method) {
    case "GET":
      if (!connection.connectionId) {
        return res.status(200).json({ token: null });
      }

      auditLog(
        {
          author: auth.user()?.toJSON() ?? "no-author",
          connectionId: connection.connectionId,
          mcpServerId,
          connectionType: "workspace",
        },
        "Fetching MCP access token"
      );

      const tokenRes = await getOAuthConnectionAccessToken({
        config: apiConfig.getOAuthAPIConfig(),
        logger,
        connectionId: connection.connectionId,
      });

      if (tokenRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to fetch access token: ${tokenRes.error.message}`,
          },
        });
      }

      return res.status(200).json({
        token: tokenRes.value.access_token,
      });

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

export default withSessionAuthenticationForPoke(handler);
