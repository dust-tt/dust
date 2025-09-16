import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { MCPOAuthRequiredError } from "@app/lib/actions/mcp_oauth_error";
import config from "@app/lib/api/config";
import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";

export class MCPOAuthProvider implements OAuthClientProvider {
  private token: OAuthTokens | undefined;
  private auth: Authenticator;
  private metadata: OAuthMetadata | undefined;

  constructor(auth: Authenticator, tokens?: OAuthTokens) {
    this.auth = auth;
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
    };
  }

  saveAuthorizationServerMetadata(
    metadata?: OAuthMetadata
  ): void | Promise<void> {
    // Save for a later step.
    this.metadata = metadata;
  }

  clientInformation(): OAuthClientInformationFull | undefined {
    return undefined;
  }

  saveClientInformation(
    clientInformation: OAuthClientInformationFull
  ): void | Promise<void> {
    if (!this.metadata) {
      // This should never happen.
      throw new Error("Metadata not found, unable to create an oauth flow.");
    }

    const responseType = "code";
    const codeChallengeMethod = "S256";

    if (!this.metadata.response_types_supported.includes(responseType)) {
      throw new Error(
        `Incompatible auth server: does not support response type ${responseType}`
      );
    }

    if (
      !this.metadata.code_challenge_methods_supported ||
      !this.metadata.code_challenge_methods_supported.includes(
        codeChallengeMethod
      )
    ) {
      throw new Error(
        `Incompatible auth server: does not support code challenge method ${codeChallengeMethod}`
      );
    }

    // Raise an error to let the client know that the server requires an OAuth connection.
    // We pass the metadata to the client to allow them to handle the oauth flow.
    throw new MCPOAuthRequiredError({
      client_id: clientInformation.client_id,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      client_secret: clientInformation.client_secret || "",
      token_endpoint: this.metadata.token_endpoint,
      authorization_endpoint: this.metadata.authorization_endpoint,
    });
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
