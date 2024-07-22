import type {
  OAuthAPIError,
  OAuthConnectionType,
  Result,
} from "@dust-tt/types";
import type { OAuthProvider, OAuthUseCase } from "@dust-tt/types";
import { Err, OAuthAPI, Ok } from "@dust-tt/types";
import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
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
    setupUri: (connection: OAuthConnectionType) => string;
    codeFromQuery: (query: ParsedUrlQuery) => string | null;
    connectionIdFromQuery: (query: ParsedUrlQuery) => string | null;
  }
> = {
  github: {
    setupUri: (connection) => {
      // Only the `installations/new` URL supports state passing.
      return (
        `https://github.com/apps/${config.getOAuthGithubApp()}/installations/new` +
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
  },
  google_drive: {
    setupUri: (connection) => {
      const scopes = [
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
        "mpim:history",
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
  },
  gong: {
    setupUri: (connection) => {
      const scopes = [
        "api:calls:read:transcript",
        "api:calls:read:extensive",
        "api:calls:read:basic",
        "api:users:read"
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
  },
  microsoft: {
    setupUri: () => {
      throw new Error("Microsoft OAuth is not implemented");
    },
    codeFromQuery: () => null,
    connectionIdFromQuery: () => null,
  },
};

export async function createConnectionAndGetSetupUrl(
  auth: Authenticator,
  provider: OAuthProvider,
  useCase: OAuthUseCase
): Promise<Result<string, OAuthError>> {
  const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const cRes = await api.createConnection({
    provider,
    metadata: {
      use_case: useCase,
      workspace_id: auth.getNonNullableWorkspace().sId,
      user_id: auth.getNonNullableUser().sId,
    },
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

  return new Ok(PROVIDER_STRATEGIES[provider].setupUri(connection));
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
