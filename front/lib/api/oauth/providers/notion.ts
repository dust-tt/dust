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
        ? config.getOAuthNotionToolsClientId()
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
            "Failed to get access token for admin-setup connection when updating the config for personal actions",
            {
              error: connectionRes.error,
            }
          );
          throw new Error(
            "Failed to get connection metadata: " + connectionRes.error.message
          );
        }

        const workspaceId = connectionRes.value.connection.metadata.workspace_id;
        const workspaceName = connectionRes.value.connection.metadata.workspace_name;

        return {
          ...restConfig,
          requested_workspace_id: workspaceId,
          requested_workspace_name: workspaceName,
        };
      }
    }

    return extraConfig;
  }

  checkConnectionValidPostFinalize(connection: OAuthConnectionType) {
    // If a workspace was requested, we need to check that the workspace id is the same as the requested workspace id.
    if ("requested_workspace_id" in connection.metadata) {
      if (
        connection.metadata.workspace_id === connection.metadata.requested_workspace_id
      ) {
        return new Ok(undefined);
      }
      return new Err({
        message:
          "You must connect to the Notion workspace configured by your admin (" +
          connection.metadata.requested_workspace_name +
          "), instead of the current workspace (" +
          connection.metadata.workspace_name +
          ").",
      });
    }
    return new Ok(undefined);
  }
}
