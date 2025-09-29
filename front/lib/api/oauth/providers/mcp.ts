import type { ParsedUrlQuery } from "querystring";
import { z } from "zod";

import config from "@app/lib/api/config";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { getPKCEConfig } from "@app/lib/utils/pkce";
import logger from "@app/logger/logger";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import { OAuthAPI } from "@app/types";
import type {
  OAuthConnectionType,
  OAuthProvider,
  OAuthUseCase,
} from "@app/types/oauth/lib";

const MCP_OAUTH_RESPONSE_TYPE = "code";
const MCP_OAUTH_CODE_CHALLENGE_METHOD = "S256";

const BaseMCPMetadataSchema = z.object({
  client_id: z.string(),
  token_endpoint: z.string(),
  authorization_endpoint: z.string(),
});

const MCPOAuthConnectionMetadataSchema = BaseMCPMetadataSchema.extend({
  client_secret: z.string().optional(),
});

const MCPMetadataSchema = BaseMCPMetadataSchema.extend({
  code_challenge: z.string(),
  code_verifier: z.string(),
});

export type MCPOAuthConnectionMetadataType = z.infer<
  typeof MCPOAuthConnectionMetadataSchema
>;

type MCPMetadataType = z.infer<typeof MCPMetadataSchema>;

export class MCPOAuthProvider implements BaseOAuthStrategyProvider {
  provider: OAuthProvider = "mcp";

  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const code_challenge = connection.metadata.code_challenge;
    const client_id = connection.metadata.client_id;
    const authorization_endpoint = connection.metadata.authorization_endpoint;
    const scope = connection.metadata.scope;

    if (!code_challenge) {
      throw new Error("Missing code challenge");
    }
    if (!client_id) {
      throw new Error("Missing client id");
    }
    if (!authorization_endpoint) {
      throw new Error("Missing authorization endpoint");
    }

    const authUrl = new URL(authorization_endpoint);

    authUrl.searchParams.set("response_type", MCP_OAUTH_RESPONSE_TYPE);
    authUrl.searchParams.set("client_id", client_id);
    authUrl.searchParams.set("code_challenge", code_challenge);
    authUrl.searchParams.set(
      "code_challenge_method",
      MCP_OAUTH_CODE_CHALLENGE_METHOD
    );
    authUrl.searchParams.set(
      "redirect_uri",
      finalizeUriForProvider(this.provider)
    );
    authUrl.searchParams.set("state", connection.connection_id);

    if (scope) {
      authUrl.searchParams.set("scope", scope);
    }

    return authUrl.toString();
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(
    extraConfig: ExtraConfigType,
    useCase: OAuthUseCase
  ): extraConfig is MCPOAuthConnectionMetadataType {
    if (useCase === "personal_actions") {
      // If we have an mcp_server_id it means the admin already setup the connection and we have
      // everything we need, otherwise we'll need the instance_url and client_id.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }

    return MCPOAuthConnectionMetadataSchema.safeParse(extraConfig).success;
  }

  async getRelatedCredential(
    auth: Authenticator,
    {
      extraConfig,
      workspaceId,
      userId,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      workspaceId: string;
      userId: string;
      useCase: OAuthUseCase;
    }
  ): Promise<RelatedCredential> {
    if (useCase === "personal_actions") {
      // For personal actions we reuse the existing connection credential id from the existing
      // workspace connection (setup by admin) if we have it.
      const { mcp_server_id } = extraConfig;

      if (mcp_server_id) {
        const mcpServerConnectionRes =
          await MCPServerConnectionResource.findByMCPServer(auth, {
            mcpServerId: mcp_server_id,
            connectionType: "workspace",
          });

        if (mcpServerConnectionRes.isErr()) {
          throw new Error(
            "Failed to find MCP server connection: " +
              mcpServerConnectionRes.error.message
          );
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getConnectionMetadata({
          connectionId: mcpServerConnectionRes.value.connectionId,
        });
        if (connectionRes.isErr()) {
          throw new Error(
            "Failed to get connection metadata: " + connectionRes.error.message
          );
        }
        const connection = connectionRes.value.connection;
        const connectionId = connection.connection_id;

        return {
          content: {
            from_connection_id: connectionId,
          },
          metadata: { workspace_id: workspaceId, user_id: userId },
        };
      }
    } else if (useCase === "platform_actions") {
      const { client_secret } = extraConfig;

      const content: { client_id: string; client_secret?: string } = {
        client_id: extraConfig.client_id,
      };

      // Only include client_secret if it's provided
      if (client_secret) {
        content.client_secret = client_secret;
      }

      return {
        content,
        metadata: { workspace_id: workspaceId, user_id: userId },
      };
    }
    throw new Error("MCP oauth provider does not support use case: " + useCase);
  }

  async getUpdatedExtraConfig(
    auth: Authenticator,
    {
      extraConfig,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      useCase: OAuthUseCase;
    }
  ): Promise<ExtraConfigType> {
    if (useCase === "personal_actions") {
      // For personal actions we reuse the existing connection credential id from the existing
      // workspace connection (setup by admin) if we have it.
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const mcpServerConnectionRes =
          await MCPServerConnectionResource.findByMCPServer(auth, {
            mcpServerId: mcp_server_id,
            connectionType: "workspace",
          });

        if (mcpServerConnectionRes.isErr()) {
          throw new Error(
            "Failed to find MCP server connection: " +
              mcpServerConnectionRes.error.message
          );
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getConnectionMetadata({
          connectionId: mcpServerConnectionRes.value.connectionId,
        });
        if (connectionRes.isErr()) {
          throw new Error(
            "Failed to get connection metadata: " + connectionRes.error.message
          );
        }
        const connection = connectionRes.value.connection;

        const { code_verifier, code_challenge } = await getPKCEConfig();

        return {
          client_id: connection.metadata.client_id,
          token_endpoint: connection.metadata.token_endpoint,
          authorization_endpoint: connection.metadata.authorization_endpoint,
          scope: connection.metadata.scope,
          code_verifier,
          code_challenge,
          ...restConfig,
        };
      }
    } else if (useCase === "platform_actions") {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we filter out the client_secret from the extraConfig
      const { client_secret, ...restConfig } = extraConfig;

      const { code_verifier, code_challenge } = await getPKCEConfig();

      return {
        ...restConfig,
        code_challenge,
        code_verifier,
      };
    }
    throw new Error("MCP oauth provider does not support use case: " + useCase);
  }

  isExtraConfigValidPostRelatedCredential(
    extraConfig: ExtraConfigType
  ): extraConfig is MCPMetadataType {
    return MCPMetadataSchema.safeParse(extraConfig).success;
  }
}
