import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { getOAuthConnectionAccessToken } from "@app/types/oauth/client/access_token";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const RequestBodySchema = z.object({
  // The MCP server ID (e.g., "google_drive") - used to look up the OAuth connection
  mcpServerId: z.string().min(1, "mcpServerId is required"),
});

export interface PickerTokenResponseType {
  accessToken: string;
  clientId: string;
  developerKey: string;
  appId: string; // Project number extracted from clientId
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PickerTokenResponseType>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST": {
      const parseResult = RequestBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        const firstError = parseResult.error.errors[0];
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: firstError?.message || "Invalid request body",
          },
        });
      }

      const { mcpServerId } = parseResult.data;

      // Look up the user's personal OAuth connection for this MCP server
      const connectionResult =
        await MCPServerConnectionResource.findByMCPServer(auth, {
          mcpServerId,
          connectionType: "personal",
        });

      if (connectionResult.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message:
              "No Google Drive connection found. Please connect your Google Drive account first.",
          },
        });
      }

      const connectionId = connectionResult.value.connectionId;
      if (!connectionId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message:
              "No Google Drive connection found. Please connect your Google Drive account first.",
          },
        });
      }

      // Get the access token for this connection
      const tokenResult = await getOAuthConnectionAccessToken({
        config: config.getOAuthAPIConfig(),
        logger,
        connectionId,
      });

      if (tokenResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get access token",
          },
        });
      }

      const clientId = config.getOAuthGoogleDriveClientId();
      const developerKey = config.getGoogleDrivePickerApiKey();

      // Extract appId (project number) from clientId
      // clientId format: "PROJECT_NUMBER.apps.googleusercontent.com" or "PROJECT_NUMBER-xxx.apps.googleusercontent.com"
      const appIdMatch = clientId.match(/^(\d+)/);
      if (!appIdMatch) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to extract app ID from client ID",
          },
        });
      }
      const appId = appIdMatch[1];

      return res.status(200).json({
        accessToken: tokenResult.value.access_token,
        clientId,
        developerKey,
        appId,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
