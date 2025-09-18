import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import { Err, OAuthAPI, Ok } from "@app/types";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

// Type definition for Notion OAuth response - only the fields we actually use
interface NotionOAuthResponse {
  workspace_id: string;
  workspace_name?: string;
  [key: string]: unknown;
}

// Type guard to safely check if an object has the Notion workspace properties we need
function hasNotionWorkspaceId(obj: unknown): obj is NotionOAuthResponse {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as any).workspace_id === "string"
  );
}

export class NotionOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const clientId =
      useCase === "platform_actions" || useCase === "personal_actions"
        ? config.getOAuthNotionPlatformActionsClientId()
        : config.getOAuthNotionClientId();
    return (
      `https://api.notion.com/v1/oauth/authorize?owner=user` +
      `&response_type=code` +
      `&client_id=${clientId}` +
      `&state=${connection.connection_id}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("notion"))}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions") {
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }
    return Object.keys(extraConfig).length === 0;
  }

  async getUpdatedExtraConfig(
    auth: Authenticator,
    {
      extraConfig,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      useCase: OAuthUseCase;
    }
  ): Promise<ExtraConfigType> {
    if (useCase === "personal_actions") {
      // For personal actions we fetch the workspace id of the admin-setup to enforce the workspace id to be the same as the admin-setup.
      // workspace connection (setup by admin) if we have it.
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const mcpServerConnectionRes =
          await MCPServerConnectionResource.findByMCPServer(auth, {
            mcpServerId: mcp_server_id,
            connectionType: "workspace",
          });

        if (mcpServerConnectionRes.isErr()) {
          throw new Error(
            "Failed to find MCP server connection: " +
              mcpServerConnectionRes.error.message
          );
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getConnectionMetadata({
          connectionId: mcpServerConnectionRes.value.connectionId,
        });
        if (connectionRes.isErr()) {
          logger.error(
            "Failed to get connection metadata for admin-setup connection when updating the config for personal actions",
            {
              error: connectionRes.error,
            }
          );
          throw new Error(
            "Failed to get connection metadata: " + connectionRes.error.message
          );
        }

        // The workspace_id in metadata is the Dust workspace ID, not the Notion workspace ID.
        // We need to get the Notion workspace info from the raw OAuth response
        const oauthRes = await oauthApi.getAccessToken({
          connectionId: mcpServerConnectionRes.value.connectionId,
        });

        if (oauthRes.isErr()) {
          throw new Error(
            "Failed to get access token for admin connection: " +
              oauthRes.error.message
          );
        }

        // Extract Notion workspace info from the raw OAuth response
        if (!hasNotionWorkspaceId(oauthRes.value.scrubbed_raw_json)) {
          throw new Error("No workspace_id found in admin OAuth response");
        }

        const notionWorkspaceId = oauthRes.value.scrubbed_raw_json.workspace_id;
        const notionWorkspaceName =
          oauthRes.value.scrubbed_raw_json.workspace_name;

        const updatedConfig = {
          ...restConfig,
          requested_notion_workspace_id: notionWorkspaceId,
          requested_notion_workspace_name:
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            notionWorkspaceName || "Unknown Workspace",
        };

        return updatedConfig;
      }
    }

    return extraConfig;
  }

  async checkConnectionValidPostFinalize(connection: OAuthConnectionType) {
    // If a Notion workspace was requested, we need to check that the Notion workspace id is the same as the requested one.
    if ("requested_notion_workspace_id" in connection.metadata) {
      const requestedNotionWorkspaceId =
        connection.metadata.requested_notion_workspace_id;
      const requestedNotionWorkspaceName =
        connection.metadata.requested_notion_workspace_name;

      try {
        // Get the current user's OAuth token information to extract their Notion workspace info
        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const accessTokenRes = await oauthApi.getAccessToken({
          connectionId: connection.connection_id,
        });

        if (accessTokenRes.isErr()) {
          return new Err({
            message:
              "Unable to validate Notion workspace. Please try connecting again.",
          });
        }

        // Extract current user's Notion workspace info from raw OAuth response
        if (!hasNotionWorkspaceId(accessTokenRes.value.scrubbed_raw_json)) {
          return new Err({
            message:
              "Unable to validate Notion workspace. Please try connecting again.",
          });
        }

        const currentNotionWorkspaceId =
          accessTokenRes.value.scrubbed_raw_json.workspace_id;
        const currentNotionWorkspaceName =
          accessTokenRes.value.scrubbed_raw_json.workspace_name;

        if (currentNotionWorkspaceId === requestedNotionWorkspaceId) {
          return new Ok(undefined);
        }

        return new Err({
          message:
            "You must connect to the Notion workspace configured by your admin (" +
            requestedNotionWorkspaceName +
            "), instead of the current workspace (" +
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            (currentNotionWorkspaceName || "Unknown") +
            ").",
        });
      } catch (error) {
        return new Err({
          message:
            "Unable to validate Notion workspace. Please try connecting again.",
        });
      }
    }

    return new Ok(undefined);
  }
}
