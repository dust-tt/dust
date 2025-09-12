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
import { assertNever, Err, OAuthAPI, Ok } from "@app/types";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class SlackOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    extraConfig?: ExtraConfigType;
  }) {
    const { user_scopes, bot_scopes } = (() => {
      switch (useCase) {
        case "personal_actions":
          return {
            user_scopes: [
              "channels:read",
              "chat:write",
              "groups:read",
              "reactions:read",
              "reactions:write",
              "search:read.private",
              "search:read.public",
              "search:read",
              "users:read",
            ],
            bot_scopes: [],
          };
        case "connection": {
          return {
            user_scopes: [],
            bot_scopes: [
              "app_mentions:read",
              "channels:history",
              "channels:join",
              "channels:manage",
              "channels:read",
              "chat:write",
              "files:read",
              "groups:history",
              "groups:read",
              "im:history",
              "im:read",
              "metadata.message:read",
              "mpim:history",
              "mpim:read",
              "team:read",
              "users:read.email",
              "users:read",
            ],
          };
        }
        case "bot":
        case "platform_actions":
          return {
            user_scopes: [],
            bot_scopes: [
              "app_mentions:read",
              "channels:history",
              "channels:join",
              "channels:read",
              "chat:write",
              "files:read",
              "groups:history",
              "groups:read",
              "im:history",
              "mpim:history",
              "mpim:read",
              "team:read",
              "im:read",
              "users:read",
              "users:read.email",
            ],
          };
        case "labs_transcripts":
          assert(
            "Unreachable provider `labs_transcripts` in SlackOAuthProvider"
          );
          return { user_scopes: [], bot_scopes: [] };
        default:
          assertNever(useCase);
      }
    })();

    // To simplify the implementation, we don't support both user and bot scopes at the same time.
    assert(!(user_scopes.length !== 0 && bot_scopes.length !== 0));

    const clientId = (() => {
      switch (useCase) {
        case "personal_actions":
          return config.getOAuthSlackToolsClientId();
        case "connection": {
          return config.getOAuthSlackClientId();
        }
        case "bot":
        case "platform_actions":
          return config.getOAuthSlackBotClientId();
        case "labs_transcripts":
          assert(
            "Unreachable provider `labs_transcripts` in SlackOAuthProvider"
          );
          return "";
        default:
          assertNever(useCase);
      }
    })();

    return (
      `https://slack.com/oauth/v2/authorize?` +
      `client_id=${clientId}` +
      (bot_scopes.length > 0
        ? `&scope=${encodeURIComponent(bot_scopes.join(" "))}`
        : "") +
      (user_scopes.length > 0
        ? `&user_scope=${encodeURIComponent(user_scopes.join(" "))}`
        : "") +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("slack"))}` +
      // Force the team id to be the same as the admin-setup.
      // Edge-case: if the user is not in the team of not logged, it might still connect to the wrong team.
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
      // For personal actions we fetch the team id of the admin-setup to enforce the team id to be the same as the admin-setup.
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
