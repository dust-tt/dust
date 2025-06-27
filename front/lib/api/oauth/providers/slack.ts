import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type {
  BaseOAuthStrategyProvider,
  UpdatedExtraConfig,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
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

export class SlackOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    extraConfig?: ExtraConfigType;
  }) {
    const default_scopes = [
      "app_mentions:read",
      "channels:history",
      "channels:join",
      "channels:read",
      "chat:write",
      "groups:history",
      "groups:read",
      "im:history",
      "metadata.message:read",
      "mpim:read",
      "team:read",
      "users:read",
      "users:read.email",
      "im:read",
      "mpim:history",
      "files:read",
    ];

    let user_scopes: string[] = [];
    let bot_scopes: string[] = [...default_scopes];

    if (extraConfig?.scope) {
      const scopes_raw = extraConfig.scope.split(" ");

      // it's a bit of hack here to split the scopes into user and bot scopes which is a slack specific thing.
      user_scopes = scopes_raw
        .filter((scope) => scope.startsWith("user_scope:"))
        .map((scope) => scope.replace("user_scope:", ""));

      bot_scopes = scopes_raw.filter(
        (scope) => !scope.startsWith("user_scope")
      );

      if (user_scopes.length !== 0 && bot_scopes.length !== 0) {
        // To simplify the implementation, we don't support both user and bot scopes at the same time.
        throw new Error("User and bot scopes cannot be set at the same time.");
      }
    }

    return (
      `https://slack.com/oauth/v2/authorize?` +
      `client_id=${config.getOAuthSlackClientId()}` +
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

  async updateConfigAndGetRelatedCredential(
    auth: Authenticator,
    {
      extraConfig,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      workspaceId: string;
      userId: string;
      useCase: OAuthUseCase;
    }
  ): Promise<UpdatedExtraConfig | null> {
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
          return null;
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
          return null;
        }

        const teamId = connectionRes.value.connection.metadata.team_id;
        const teamName = connectionRes.value.connection.metadata.team_name;

        return {
          updatedConfig: {
            ...restConfig,
            requested_team_id: teamId,
            requested_team_name: teamName,
          },
        };
      }
    }

    return null;
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      return "scope" in extraConfig;
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
