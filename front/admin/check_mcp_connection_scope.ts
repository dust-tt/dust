import config from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import { makeScript } from "@app/scripts/helpers";

// The scope we asked for lives on the connection metadata; the scope we were actually granted only
// exists in the token response, which `core` keeps encrypted and exposes as `scrubbed_raw_json`.
// Neither is readable from the front database, hence this script.
type ConnectionVerdict =
  | "OK"
  | "NEVER_REFRESHES"
  | "NO_GRANTED_SCOPE_RETURNED"
  | "TOKEN_FETCH_FAILED";

function extractScope(rawJson: unknown): string | null {
  if (
    rawJson &&
    typeof rawJson === "object" &&
    "scope" in rawJson &&
    typeof rawJson.scope === "string"
  ) {
    return rawJson.scope;
  }
  return null;
}

// Read-only: `--execute` is unused, so the "script was not executed" notice at the end is expected.
makeScript(
  {
    connectionId: {
      type: "string",
      demandOption: true,
      describe: "OAuth connection id (con_...).",
    },
    forceRefresh: {
      type: "boolean",
      default: false,
      describe: "Force the OAuth service to refresh the token upstream.",
    },
  },
  async ({ connectionId, forceRefresh }, logger) => {
    const tokRes = await getOAuthConnectionAccessToken({
      config: config.getOAuthAPIConfig(),
      logger,
      connectionId,
      forceRefresh,
    });

    if (tokRes.isErr()) {
      logger.error(
        { connectionId, error: tokRes.error, verdict: "TOKEN_FETCH_FAILED" },
        "Failed to fetch access token"
      );
      return;
    }

    const { connection, scrubbed_raw_json, access_token_expiry } = tokRes.value;
    const grantedScope = extractScope(scrubbed_raw_json);

    // `core` only leaves the expiry null when the token response carried neither `expires_in` nor a
    // refresh token, in which case `valid_access_token()` serves the same token forever — until the
    // provider expires it server-side and every tool call starts returning 401.
    const verdict: ConnectionVerdict =
      access_token_expiry === null
        ? "NEVER_REFRESHES"
        : grantedScope === null
          ? "NO_GRANTED_SCOPE_RETURNED"
          : "OK";

    logger.info(
      {
        connectionId,
        provider: connection.provider,
        connectionStatus: connection.status,
        requestedScope: connection.metadata.scope ?? null,
        grantedScope,
        resource: connection.metadata.resource ?? null,
        tokenEndpointAuthMethod:
          connection.metadata.token_endpoint_auth_method ?? null,
        accessTokenExpiry: access_token_expiry
          ? new Date(access_token_expiry).toISOString()
          : null,
        // `scrubbed_raw_json` strips access_token, refresh_token and expires_in
        scrubbedRawJson: scrubbed_raw_json,
        verdict,
      },
      "Connection"
    );
  }
);
