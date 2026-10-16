import {
  DUST_PUBLIC_SITE_URL,
  MCP_CLIENT_INFORMATIONAL_URIS,
} from "@app/lib/api/mcp_server/urls";
import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { extractWWWAuthenticateParams } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";

// Last 401/403 the remote server returned before the SDK fell into its OAuth flow.
export type MCPAuthChallenge = {
  status: number;
  wwwAuthenticate: string | null;
  error?: string;
  scope?: string;
};

export class MCPOAuthProviderError extends Error {
  constructor(
    method: string,
    readonly challenge?: MCPAuthChallenge,
    readonly tokenScope?: string
  ) {
    super(`MCPOAuthProvider: ${method} not implemented`);
    this.name = "MCPOAuthProviderError";
  }
}

export type MCPAuthFailureAction =
  | { kind: "reauthenticate"; scope: string | undefined }
  | { kind: "refused" };

function splitScope(scope: string | undefined): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

/**
 * @cc [owner:pmilliotte,label:product] reauth-only-when-it-can-help
 * A 403 MUST lead to `reauthenticate` only when it is `insufficient_scope` and names a scope
 * the current token does not hold; the requested scope is then the union of both. Any other 403
 * MUST lead to `refused`. A 401 or an unknown status MUST reauthenticate with
 * `configuredScope`.
 */
export function decideMCPAuthFailureAction(
  error: MCPOAuthProviderError,
  configuredScope: string | undefined
): MCPAuthFailureAction {
  const { challenge } = error;
  if (challenge?.status !== 403) {
    return { kind: "reauthenticate", scope: configuredScope };
  }
  if (challenge.error !== "insufficient_scope") {
    return { kind: "refused" };
  }

  const currentScopes = splitScope(error.tokenScope || configuredScope);
  const missingScopes = splitScope(challenge.scope).filter(
    (s) => !currentScopes.includes(s)
  );
  if (missingScopes.length === 0) {
    return { kind: "refused" };
  }
  return {
    kind: "reauthenticate",
    scope: [...currentScopes, ...missingScopes].join(" "),
  };
}

export class MCPOAuthProvider implements OAuthClientProvider {
  private token: OAuthTokens | undefined;
  private lastChallenge: MCPAuthChallenge | undefined;

  constructor(tokens?: OAuthTokens) {
    this.token = tokens;
  }

  // Wraps the transport fetch so errors thrown below carry the 401/403 that triggered them.
  wrapFetch(fetchFn: FetchLike = fetch): FetchLike {
    return async (url, init) => {
      const response = await fetchFn(url, init);
      if (response.status === 401 || response.status === 403) {
        const { error, scope } = extractWWWAuthenticateParams(response);
        this.lastChallenge = {
          status: response.status,
          wwwAuthenticate: response.headers.get("WWW-Authenticate"),
          error,
          scope,
        };
      }
      return response;
    };
  }

  private notImplemented(method: string): MCPOAuthProviderError {
    return new MCPOAuthProviderError(
      method,
      this.lastChallenge,
      this.token?.scope
    );
  }

  get redirectUrl(): string {
    // Must return a concrete redirect URI. The MCP SDK (>=1.29) treats a falsy
    // `redirectUrl` as a non-interactive (client_credentials) flow and calls
    // `fetchToken()` with no authorization code and no `prepareTokenRequest`,
    // throwing "Either provider.prepareTokenRequest() or authorizationCode is
    // required" on any OAuth-gated server. Returning the URI keeps the
    // interactive authorization-code path, where `saveCodeVerifier()` throws to
    // cleanly signal that OAuth is required.
    return finalizeUriForProvider({ provider: "mcp", connection: null });
  }

  /**
   * @cc [owner:smb2268,label:mcp] dcr-informational-uris-are-dust-tt
   * `client_uri`, `logo_uri`, `tos_uri` and `policy_uri` sent at dynamic client registration MUST
   * be on `https://dust.tt` in every region and environment: servers allowlist that origin, and
   * the EU site URL is rejected.
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [
        finalizeUriForProvider({ provider: "mcp", connection: null }),
      ],
      client_name: "Dust",
      client_uri: DUST_PUBLIC_SITE_URL,
      ...MCP_CLIENT_INFORMATIONAL_URIS,
      contacts: ["support@dust.com"],
      software_id: "dust",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return undefined;
  }

  saveClientInformation(_clientInformation: OAuthClientInformationMixed): void {
    // No-op: the SDK checks for this method's existence before attempting
    // dynamic client registration. We provide it so the probe/discovery
    // flow doesn't throw prematurely.
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return this.token;
  }

  saveTokens() {
    throw this.notImplemented("saveTokens");
  }

  redirectToAuthorization() {
    throw this.notImplemented("redirectToAuthorization");
  }

  saveCodeVerifier() {
    throw this.notImplemented("saveCodeVerifier");
  }

  codeVerifier(): string | Promise<string> {
    throw this.notImplemented("codeVerifier");
  }
}
