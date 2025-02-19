import type {
  OAuthAPIError,
  OAuthConnectionType,
  Result,
} from "@dust-tt/types";
import type { OAuthProvider, OAuthUseCase } from "@dust-tt/types";
import { Err, isValidZendeskSubdomain, OAuthAPI, Ok } from "@dust-tt/types";
import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";

export type OAuthError = {
  code:
    | "connection_creation_failed"
    | "connection_not_implemented"
    | "connection_finalization_failed";
  message: string;
  oAuthAPIError?: OAuthAPIError;
};

function getStringFromQuery(query: ParsedUrlQuery, key: string): string | null {
  const value = query[key];
  if (typeof value != "string") {
    return null;
  }
  return value;
}

function finalizeUriForProvider(provider: OAuthProvider): string {
  return config.getClientFacingUrl() + `/oauth/${provider}/finalize`;
}

const PROVIDER_STRATEGIES: Record<
  OAuthProvider,
  {
    setupUri: (
      connection: OAuthConnectionType,
      useCase: OAuthUseCase,
      forceMeetScope?: boolean
    ) => string;
    codeFromQuery: (query: ParsedUrlQuery) => string | null;
    connectionIdFromQuery: (query: ParsedUrlQuery) => string | null;
    isExtraConfigValid: (extraConfig: Record<string, string>) => boolean;
  }
> = {
  github: {
    setupUri: (connection, useCase) => {
      const app =
        useCase === "platform_actions"
          ? config.getOAuthGithubAppPlatformActions()
          : config.getOAuthGithubApp();
      // Only the `installations/new` URL supports state passing.
      return (
        `https://github.com/apps/${app}/installations/new` +
        `?state=${connection.connection_id}`
      );
    },
    // {
    //   installation_id: '52689080',
    //   setup_action: 'update',
    //   state: 'con_...-...',
    //   provider: 'github'
    // }
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "installation_id");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  google_drive: {
    setupUri: (connection, useCase, forceMeetScope = false) => {
      const scopes =
        useCase === "labs_transcripts" && forceMeetScope
          ? ["https://www.googleapis.com/auth/drive.meet.readonly"]
          : [
              "https://www.googleapis.com/auth/drive.metadata.readonly",
              "https://www.googleapis.com/auth/drive.readonly",
            ];
      const qs = querystring.stringify({
        response_type: "code",
        client_id: config.getOAuthGoogleDriveClientId(),
        state: connection.connection_id,
        redirect_uri: finalizeUriForProvider("google_drive"),
        scope: scopes.join(" "),
        access_type: "offline",
        prompt: "consent",
      });
      return `https://accounts.google.com/o/oauth2/auth?${qs}`;
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  notion: {
    setupUri: (connection) => {
      return (
        `https://api.notion.com/v1/oauth/authorize?owner=user` +
        `&response_type=code` +
        `&client_id=${config.getOAuthNotionClientId()}` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("notion"))}`
      );
    },
    // {
    //   code: '03...',
    //   state: 'con_...-...',
    // }
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  slack: {
    setupUri: (connection) => {
      const scopes = [
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
      return (
        `https://slack.com/oauth/v2/authorize?` +
        `client_id=${config.getOAuthSlackClientId()}` +
        `&scope=${encodeURIComponent(scopes.join(" "))}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("slack"))}` +
        `&state=${connection.connection_id}`
      );
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  confluence: {
    setupUri: (connection) => {
      const scopes = [
        "read:confluence-space.summary",
        "read:confluence-content.all",
        "read:confluence-user",
        "search:confluence",
        "read:space:confluence",
        "read:page:confluence",
        "read:confluence-props",
        "read:confluence-content.summary",
        "report:personal-data",
        "read:me",
        "read:label:confluence",
        "offline_access",
      ];
      return (
        `https://auth.atlassian.com/authorize?audience=api.atlassian.com` +
        `&client_id=${config.getOAuthConfluenceClientId()}` +
        `&scope=${encodeURIComponent(scopes.join(" "))}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("confluence"))}` +
        `&state=${connection.connection_id}` +
        `&response_type=code&prompt=consent`
      );
    },
    // {
    //   code: 'ey...',
    //   state: 'con_...-...',
    // }
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  intercom: {
    setupUri: (connection) => {
      return (
        `https://app.intercom.com/oauth` +
        `?client_id=${config.getOAuthIntercomClientId()}` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("intercom"))}`
      );
    },
    codeFromQuery: (connection) => {
      return getStringFromQuery(connection, "code");
    },
    connectionIdFromQuery: (connection) => {
      return getStringFromQuery(connection, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  gong: {
    setupUri: (connection) => {
      const scopes = [
        "api:calls:read:transcript",
        "api:calls:read:extensive",
        "api:calls:read:basic",
        "api:users:read",
      ];
      return (
        `https://app.gong.io/oauth2/authorize?` +
        `client_id=${config.getOAuthGongClientId()}` +
        `&scope=${encodeURIComponent(scopes.join(" "))}` +
        `&response_type=code` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("gong"))}`
      );
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  microsoft: {
    setupUri: (connection) => {
      const scopes = [
        "User.Read",
        "Sites.Read.All",
        "Directory.Read.All",
        "Files.Read.All",
        "Team.ReadBasic.All",
        "ChannelSettings.Read.All",
        "ChannelMessage.Read.All",
        "offline_access",
      ];
      const qs = querystring.stringify({
        response_type: "code",
        client_id: config.getOAuthMicrosoftClientId(),
        state: connection.connection_id,
        redirect_uri: finalizeUriForProvider("microsoft"),
        scope: scopes.join(" "),
      });
      return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${qs}`;
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      return Object.keys(extraConfig).length === 0;
    },
  },
  zendesk: {
    setupUri: (connection) => {
      const scopes = ["read"];
      if (!isValidZendeskSubdomain(connection.metadata.zendesk_subdomain)) {
        throw "Invalid Zendesk subdomain";
      }
      return (
        `https://${connection.metadata.zendesk_subdomain}.zendesk.com/oauth/authorizations/new?` +
        `client_id=${config.getOAuthZendeskClientId()}` +
        `&scope=${encodeURIComponent(scopes.join(" "))}` +
        `&response_type=code` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("zendesk"))}`
      );
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      if (Object.keys(extraConfig).length !== 1) {
        return false;
      }
      // Ensure the string is less than 63 characters.
      return isValidZendeskSubdomain(extraConfig.zendesk_subdomain);
    },
  },
  salesforce: {
    setupUri: (connection) => {
      if (!connection.metadata.instance_url) {
        throw new Error("Missing Salesforce instance URL");
      }
      if (
        !connection.metadata.code_verifier ||
        !connection.metadata.code_challenge
      ) {
        throw new Error("Missing PKCE code verifier or challenge");
      }

      return (
        `${connection.metadata.instance_url}/services/oauth2/authorize` +
        `?response_type=code` +
        `&client_id=${config.getOAuthSalesforceClientId()}` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("salesforce"))}` +
        `&code_challenge=${connection.metadata.code_challenge}` +
        `&code_challenge_method=S256`
      );
    },
    codeFromQuery: (query) => {
      return getStringFromQuery(query, "code");
    },
    connectionIdFromQuery: (query) => {
      return getStringFromQuery(query, "state");
    },
    isExtraConfigValid: (extraConfig) => {
      if (!extraConfig.instance_url) {
        return false;
      }
      try {
        const url = new URL(extraConfig.instance_url);
        return (
          url.protocol === "https:" && url.hostname.endsWith(".salesforce.com")
        );
      } catch {
        return false;
      }
    },
  },
};

export async function createConnectionAndGetSetupUrl(
  auth: Authenticator,
  provider: OAuthProvider,
  useCase: OAuthUseCase,
  extraConfig: Record<string, string>
): Promise<Result<string, OAuthError>> {
  const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  if (!PROVIDER_STRATEGIES[provider].isExtraConfigValid(extraConfig)) {
    logger.error(
      { provider, useCase, extraConfig },
      "OAuth: Invalid extraConfig"
    );
    return new Err({
      code: "connection_creation_failed",
      message: "Invalid OAuth connection extraConfig for provider",
    });
  }

  const metadata: Record<string, string> = {
    use_case: useCase,
    workspace_id: auth.getNonNullableWorkspace().sId,
    user_id: auth.getNonNullableUser().sId,
    ...extraConfig,
  };

  const cRes = await api.createConnection({
    provider,
    metadata,
  });
  if (cRes.isErr()) {
    logger.error({ provider, useCase }, "OAuth: Failed to create connection");
    return new Err({
      code: "connection_creation_failed",
      message: "Failed to create new OAuth connection",
      oAuthAPIError: cRes.error,
    });
  }

  const connection = cRes.value.connection;

  const forceMeetScope = (
    await getFeatureFlags(auth.getNonNullableWorkspace())
  ).includes("labs_transcripts_meet_scope");

  return new Ok(
    PROVIDER_STRATEGIES[provider].setupUri(connection, useCase, forceMeetScope)
  );
}

export async function finalizeConnection(
  provider: OAuthProvider,
  query: ParsedUrlQuery
): Promise<Result<OAuthConnectionType, OAuthError>> {
  const code = PROVIDER_STRATEGIES[provider].codeFromQuery(query);

  if (!code) {
    logger.error(
      { provider, step: "code_extraction" },
      "OAuth: Failed to finalize connection"
    );
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: authorization code not found in query`,
    });
  }

  const connectionId =
    PROVIDER_STRATEGIES[provider].connectionIdFromQuery(query);

  if (!connectionId) {
    logger.error(
      { provider, step: "connection_extraction" },
      "OAuth: Failed to finalize connection"
    );
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: connection not found in query`,
    });
  }

  const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const cRes = await api.finalizeConnection({
    provider,
    connectionId,
    code,
    redirectUri: finalizeUriForProvider(provider),
  });

  if (cRes.isErr()) {
    logger.error(
      {
        provider,
        connectionId,
        step: "connection_finalization",
      },
      "OAuth: Failed to finalize connection"
    );

    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: ${cRes.error.message}`,
      oAuthAPIError: cRes.error,
    });
  }

  return new Ok(cRes.value.connection);
}
