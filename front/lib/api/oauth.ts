import type {
  OAuthAPIError,
  OAuthConnectionType,
  Result,
} from "@dust-tt/types";
import type { OAuthProvider } from "@dust-tt/types";
import { Err, OAuthAPI, Ok } from "@dust-tt/types";
import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";

export const OAUTH_USE_CASES = ["connection"] as const;

export type OAuthUseCase = (typeof OAUTH_USE_CASES)[number];

export function isOAuthUseCase(obj: unknown): obj is OAuthUseCase {
  return OAUTH_USE_CASES.includes(obj as OAuthUseCase);
}

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

const PROVIDER_STRATEGIES: Record<
  OAuthProvider,
  {
    redirectUrl: (
      connection: OAuthConnectionType
    ) => Result<string, OAuthError>;
    codeFromQuery: (query: ParsedUrlQuery) => string | null;
    connectionIdFromQuery: (query: ParsedUrlQuery) => string | null;
  }
> = {
  github: {
    redirectUrl: (connection) => {
      // Only the `installations/new` URL supports state passing.
      return new Ok(
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
    redirectUrl: () => {
      return new Err({
        code: "connection_not_implemented",
        message: "Google Drive OAuth is not implemented",
      });
    },
    codeFromQuery: () => null,
    connectionIdFromQuery: () => null,
  },
  notion: {
    redirectUrl: (connection) => {
      return new Ok(
        `https://api.notion.com/v1/oauth/authorize?owner=user` +
          `response_type=code` +
          `&client_id=${config.getOAuthNotionClientId()}` +
          `&redirect_uri=${encodeURIComponent(config.getClientFacingUrl() + "/oauth/notion/finalize")}` +
          `&state=${connection.connection_id}`
      );
    },
    codeFromQuery: () => null,
    connectionIdFromQuery: () => null,
  },
  slack: {
    redirectUrl: () => {
      return new Err({
        code: "connection_not_implemented",
        message: "Slack OAuth is not implemented",
      });
    },
    codeFromQuery: () => null,
    connectionIdFromQuery: () => null,
  },
  confluence: {
    redirectUrl: () => {
      return new Err({
        code: "connection_not_implemented",
        message: "Confluence OAuth is not implemented",
      });
    },
    codeFromQuery: () => null,
    connectionIdFromQuery: () => null,
  },
  intercom: {
    redirectUrl: () => {
      return new Err({
        code: "connection_not_implemented",
        message: "Intercom OAuth is not implemented",
      });
    },
    codeFromQuery: () => null,
    connectionIdFromQuery: () => null,
  },
  microsoft: {
    redirectUrl: () => {
      return new Err({
        code: "connection_not_implemented",
        message: "Microsoft OAuth is not implemented",
      });
    },
    codeFromQuery: () => null,
    connectionIdFromQuery: () => null,
  },
};

export async function createConnectionAndGetRedirectURL(
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

  return PROVIDER_STRATEGIES[provider].redirectUrl(connection);
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

  const cRes = await api.finalizeConnection({ provider, connectionId, code });
  logger.error(
    {
      provider,
      connectionId,
      step: "connection_finalization",
    },
    "OAuth: Failed to finalize connection"
  );
  if (cRes.isErr()) {
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: ${cRes.error.message}`,
      oAuthAPIError: cRes.error,
    });
  }

  return new Ok(cRes.value.connection);
}
