import type { ParsedUrlQuery } from "querystring";
import { z } from "zod";

import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export const MCPOAuthExtraConfigSchema = z.object({
  client_id: z.string(),
  client_secret: z.string(),
  token_endpoint: z.string(),
  authorization_endpoint: z.string(),
  response_types_supported: z.array(z.string()),
  grant_types_supported: z.array(z.string()).optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
  code_verifier: z.string().optional(),
  code_challenge: z.string().optional(),
});

export type MCPOAuthExtraConfig = z.infer<typeof MCPOAuthExtraConfigSchema>;

export class MCPOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const responseType = "code";
    const codeChallengeMethod = "S256";

    const metadata = connection.metadata as MCPOAuthExtraConfig;
    const authUrl = new URL(metadata.authorization_endpoint);

    if (!metadata.response_types_supported.includes(responseType)) {
      throw new Error(
        `Incompatible auth server: does not support response type ${responseType}`
      );
    }

    if (
      !metadata.code_challenge_methods_supported ||
      !metadata.code_challenge_methods_supported.includes(codeChallengeMethod)
    ) {
      throw new Error(
        `Incompatible auth server: does not support code challenge method ${codeChallengeMethod}`
      );
    }

    if (!metadata.code_challenge) {
      throw new Error("Missing code challenge");
    }

    authUrl.searchParams.set("response_type", responseType);
    authUrl.searchParams.set("client_id", metadata.client_id);
    authUrl.searchParams.set("code_challenge", metadata.code_challenge);
    authUrl.searchParams.set("code_challenge_method", codeChallengeMethod);
    authUrl.searchParams.set("redirect_uri", finalizeUriForProvider("mcp"));
    authUrl.searchParams.set("state", connection.connection_id);

    return authUrl.toString();
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(
    extraConfig: ExtraConfigType
  ): extraConfig is MCPOAuthExtraConfig {
    return MCPOAuthExtraConfigSchema.safeParse(extraConfig).success;
  }

  async getRelatedCredential(
    auth: Authenticator,
    extraConfig: ExtraConfigType,
    workspaceId: string,
    userId: string
  ) {
    if (!this.isExtraConfigValid(extraConfig)) {
      return null;
    }

    const { client_secret, ...restConfig } = extraConfig;

    const { code_verifier, code_challenge } = await getPKCEConfig();

    return {
      credential: {
        content: {
          client_secret,
          client_id: extraConfig.client_id,
        },
        metadata: { workspace_id: workspaceId, user_id: userId },
      },
      cleanedConfig: {
        ...restConfig,
        code_verifier,
        code_challenge,
      },
    };
  }
}
