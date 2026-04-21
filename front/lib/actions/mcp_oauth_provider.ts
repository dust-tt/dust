import config from "@app/lib/api/config";
import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import { isDevelopment } from "@app/types/shared/env";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformation,
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export class MCPOAuthProviderError extends Error {
  constructor(method: string) {
    super(`MCPOAuthProvider: ${method} not implemented`);
    this.name = "MCPOAuthProviderError";
  }
}

export class MCPOAuthProvider implements OAuthClientProvider {
  private token: OAuthTokens | undefined;
  private clientInfo: OAuthClientInformation | undefined;

  constructor(tokens?: OAuthTokens, clientInfo?: OAuthClientInformation) {
    this.token = tokens;
    this.clientInfo = clientInfo;
  }
  get redirectUrl(): string {
    throw new MCPOAuthProviderError("redirectUrl");
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
      redirect_uris: [finalizeUriForProvider("mcp")],
      client_name: "Dust",
      ...informationalUris,
      contacts: ["support@dust.com"],
      software_id: "dust",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  }

  clientInformation(): OAuthClientInformation | undefined {
    // Returning static client info here prevents the MCP SDK from attempting
    // RFC 7591 dynamic client registration on 401. Providers that don't expose
    // a `registration_endpoint` (Entra ID, Cognito, etc.) would otherwise fail
    // with "Incompatible auth server: does not support dynamic client
    // registration" before tokens() is ever consulted.
    return this.clientInfo;
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
    throw new MCPOAuthProviderError("saveTokens");
  }

  redirectToAuthorization() {
    throw new MCPOAuthProviderError("redirectToAuthorization");
  }

  saveCodeVerifier() {
    throw new MCPOAuthProviderError("saveCodeVerifier");
  }

  codeVerifier(): string | Promise<string> {
    throw new MCPOAuthProviderError("codeVerifier");
  }
}
