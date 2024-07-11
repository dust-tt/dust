import type { OAuthAPIError, Result } from "@dust-tt/types";
import type { OAuthProvider } from "@dust-tt/types";
import { Err, OAuthAPI, Ok } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";

const { OAUTH_GITHUB_APP = "" } = process.env;

export const OAUTH_USE_CASES = ["connection"] as const;

export type OAuthUseCase = (typeof OAUTH_USE_CASES)[number];

export function isOAuthUseCase(obj: unknown): obj is OAuthUseCase {
  return OAUTH_USE_CASES.includes(obj as OAuthUseCase);
}

export type OAuthError = {
  code: "connection_creation_failed";
  message: string;
  oAuthAPIError?: OAuthAPIError;
};

export async function createConnectionAndGetRedirectURL(
  auth: Authenticator,
  provider: OAuthProvider,
  useCase: OAuthUseCase
): Promise<Result<string, OAuthError>> {
  const api = new OAuthAPI(logger);

  const cRes = await api.createConnection(provider, {
    use_case: useCase,
    workspace_id: auth.getNonNullableWorkspace().sId,
    user_id: auth.getNonNullableUser().sId,
  });
  if (cRes.isErr()) {
    return new Err({
      code: "connection_creation_failed",
      message: "Failed to create new OAuth connection",
      oAuthAPIError: cRes.error,
    });
  }

  const connection = cRes.value.connection;

  switch (provider) {
    case "github":
      return new Ok(
        // Only the `installations/new` URL supports state passing.
        `https://github.com/apps/${OAUTH_GITHUB_APP}/installations/new` +
          `?state=${connection.connection_id}`
      );
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
