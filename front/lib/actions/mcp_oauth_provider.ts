import config from "@app/lib/api/config";
import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export class MCPOAuthProvider implements OAuthClientProvider {
  private token: OAuthTokens | undefined;

  constructor(tokens?: OAuthTokens) {
    this.token = tokens;
  }
  get redirectUrl(): string {
    throw new Error(
      "Method redirectUrl not implemented. We should never reach this point."
    );
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
    throw new Error(
      "Method saveTokens not implemented. We should never reach this point."
    );
  }

  redirectToAuthorization() {
    throw new Error(
      "Method redirectToAuthorization not implemented. We should never reach this point."
    );
  }

  saveCodeVerifier() {
    throw new Error(
      "Method saveCodeVerifier not implemented. We should never reach this point."
    );
  }

  codeVerifier(): string | Promise<string> {
    throw new Error(
      "Method codeVerifier not implemented. We should never reach this point."
    );
  }
}
