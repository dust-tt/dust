import assert from "assert";
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

/**
 * OAuth provider for Slack Tools MCP server.
 *
 * This is a dedicated provider separate from the main `slack` provider to ensure
 * the Slack Tools MCP always uses the correct Slack App (Dust Slack Tools - A09361B9ULB)
 * for both platform_actions and personal_actions use cases.
 *
 * This separation was needed because the slack_bot MCP server reused the `slack` provider's
 * platform_actions with a different Slack App (the bot app), which broke the assumption that
 * the workspace connection could be reused for personal actions.
 */
export class SlackToolsOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    extraConfig?: ExtraConfigType;
  }) {
    const user_scopes = (() => {
      switch (useCase) {
        case "personal_actions":
        case "platform_actions":
          return [
            // Write permissions.
            "chat:write",
            // Get and read chat and thread in any channels.
            "channels:history",
            "groups:history",
            "im:history",
            "mpim:history",
            "channels:read",
            "files:write",
            "groups:read",
            "im:read",
            "mpim:read",
            // Semantic search scopes.
            "search:read.public",
            "search:read.private",
            // User info scopes.
            "users:read.email",
            "users:read",
          ];
        default:
          assert(
            false,
            `Unsupported useCase "${useCase}" in SlackToolsOAuthProvider`
          );
      }
    })();

    const clientId = config.getOAuthSlackToolsClientId();

    return (
      `https://slack.com/oauth/v2/authorize?` +
      `client_id=${clientId}` +
      `&user_scope=${encodeURIComponent(user_scopes.join(" "))}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("slack_tools"))}` +
      // Force the team id to be the same as the admin-setup.
      // Edge-case: if the user is not in the team or not logged in, they might still connect to the wrong team.
      // We catch it in the `checkConnectionValidPostFinalize` method.
      (extraConfig?.requested_team_id
        ? `&team=${extraConfig.requested_team_id}`
        : "") +
      `&state=${connection.connection_id}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
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
      // For personal actions we fetch the team id of the admin-setup (workspace connection)
      // to enforce the team id to be the same as the admin-setup.
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

        const teamId = connectionRes.value.connection.metadata.team_id;
        const teamName = connectionRes.value.connection.metadata.team_name;

        return {
          ...restConfig,
          requested_team_id: teamId,
          requested_team_name: teamName,
        };
      }
    }

    return extraConfig;
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions") {
      return (
        Object.keys(extraConfig).length === 1 && "mcp_server_id" in extraConfig
      );
    }
    // For platform_actions, no extra config is required.
    return Object.keys(extraConfig).length === 0;
  }

  checkConnectionValidPostFinalize(connection: OAuthConnectionType) {
    // If a team was requested, we need to check that the team id is the same as the requested team id.
    if ("requested_team_id" in connection.metadata) {
      if (
        connection.metadata.team_id === connection.metadata.requested_team_id
      ) {
        return new Ok(undefined);
      }
      return new Err({
        message:
          "You must select `" +
          connection.metadata.requested_team_name +
          "` as the team to connect, instead of `" +
          connection.metadata.team_name +
          "`.",
      });
    }
    return new Ok(undefined);
  }
}
