import assert from "assert";
import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import { assertNever, Err, Ok } from "@app/types";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class SlackOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
    extraConfig,
    clientId: providedClientId,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    extraConfig?: ExtraConfigType;
    clientId?: string;
  }) {
    const bot_scopes = (() => {
      switch (useCase) {
        case "connection": {
          return [
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
          ];
        }
        case "bot":
        case "platform_actions":
          const scopes = [
            "app_mentions:read",
            "channels:history",
            "channels:join",
            "channels:read",
            "chat:write",
            "files:read",
            "files:write",
            "groups:history",
            "groups:read",
            "im:history",
            "mpim:history",
            "mpim:read",
            "team:read",
            "im:read",
            "users:read",
            "users:read.email",
          ];

          // TODO: This is temporary until our Slack app scope is approved.
          if (extraConfig?.slack_bot_mcp_feature_flag) {
            scopes.push("reactions:read", "reactions:write");
          }

          return scopes;
        case "labs_transcripts":
          assert(
            false,
            "Unreachable useCase `labs_transcripts` in SlackOAuthProvider"
          );
          break;
        case "webhooks":
          assert(false, "Unreachable useCase `webhooks` in SlackOAuthProvider");
          break;
        case "personal_actions":
          assert(
            false,
            "Unreachable useCase `personal_actions` in SlackOAuthProvider"
          );
          break;
        default:
          assertNever(useCase);
      }
    })();

    const clientId = (() => {
      switch (useCase) {
        case "connection": {
          if (providedClientId) {
            return providedClientId;
          }
          return config.getOAuthSlackClientId();
        }
        case "bot":
        case "platform_actions":
          return config.getOAuthSlackBotClientId();
        default:
          assertNever(useCase);
      }
    })();

    return (
      `https://slack.com/oauth/v2/authorize?` +
      `client_id=${clientId}` +
      `&scope=${encodeURIComponent(bot_scopes.join(" "))}` +
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

  async getRelatedCredential(
    auth: Authenticator,
    {
      extraConfig,
      workspaceId,
      userId,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      workspaceId: string;
      userId: string;
      useCase: OAuthUseCase;
    }
  ): Promise<RelatedCredential | undefined> {
    if (useCase !== "connection") {
      return undefined;
    }

    const { client_id, client_secret } = extraConfig;
    if (!client_id || !client_secret) {
      return undefined;
    }

    // Note: we don't store the signing secret as it's not needed for OAuth connections.
    // It is only used for webhook validation
    return {
      content: {
        client_id,
        client_secret,
      },
      metadata: { workspace_id: workspaceId, user_id: userId },
    };
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
    if (useCase === "connection") {
      // Remove the secrets from the stored config (they're stored in relatedCredential)
      const {
        client_secret: _,
        signing_secret: __,
        ...restConfig
      } = extraConfig;
      return restConfig;
    } else if (useCase === "platform_actions") {
      const feature_flags = await getFeatureFlags(
        auth.getNonNullableWorkspace()
      );
      const config = { ...extraConfig };
      if (feature_flags.includes("slack_bot_mcp")) {
        config.slack_bot_mcp_feature_flag = "true";
      }
      return config;
    }

    return extraConfig;
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "connection") {
      // Accept either empty config or config with all required Slack app credentials
      const keys = Object.keys(extraConfig);
      if (keys.length === 0) {
        return true;
      }
      return !!(
        extraConfig.client_id &&
        extraConfig.client_secret &&
        extraConfig.signing_secret
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
