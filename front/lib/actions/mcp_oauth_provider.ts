import config from "@app/lib/api/config";
import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
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

  constructor(tokens?: OAuthTokens) {
    this.token = tokens;
  }
  get redirectUrl(): string {
    throw new MCPOAuthProviderError("redirectUrl");
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [finalizeUriForProvider("mcp")],
      client_name: "Dust",
      client_uri: config.getClientFacingUrl(),
      logo_uri: "https://avatars.githubusercontent.com/u/116068963?s=200&v=4",
      contacts: ["support@dust.com"],
      tos_uri: config.getClientFacingUrl() + "/terms",
      policy_uri: config.getClientFacingUrl() + "/privacy",
      software_id: "dust",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return undefined;
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
