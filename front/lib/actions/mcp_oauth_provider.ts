import config from "@app/lib/api/config";
import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import { isDevelopment } from "@app/types/shared/env";
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

  get clientMetadata(): OAuthClientMetadata {
    const baseUrl = config.getStaticWebsiteUrl();

    // In production `baseUrl` is always https so these URIs are always set.
    // In dev `baseUrl` is http://localhost and OAuth servers reject non-https
    // URIs here — we drop these informational fields entirely; they don't
    // matter for local testing.
    if (!isDevelopment() && !baseUrl.startsWith("https://")) {
      throw new Error(
        `OAuth client metadata requires an HTTPS base URL, got: ${baseUrl}`
      );
    }
    const informationalUris = isDevelopment()
      ? {}
      : {
          client_uri: baseUrl,
          logo_uri: baseUrl + "/static/AppIcon.png",
          tos_uri: baseUrl + "/terms",
          policy_uri: baseUrl + "/privacy",
        };

    return {
      redirect_uris: [
        finalizeUriForProvider({ provider: "mcp", connection: null }),
      ],
      client_name: "Dust",
      ...informationalUris,
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
