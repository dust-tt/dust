import type { ParsedUrlQuery } from "querystring";

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
import logger from "@app/logger/logger";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import { isValidUrl, OAuthAPI } from "@app/types";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class UkgReadyOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({ connection }: { connection: OAuthConnectionType }) {
    const instanceUrl = connection.metadata.instance_url;
    const companyId = connection.metadata.ukg_ready_company_id;
    const clientId = connection.metadata.client_id;

    if (!instanceUrl) {
      throw new Error("Missing instance_url in connection metadata");
    }
    if (!companyId) {
      throw new Error("Missing ukg_ready_company_id in connection metadata");
    }
    if (!clientId) {
      throw new Error("Missing client_id in connection metadata");
    }

    // Build UKG Ready authorization URL
    // Use !{companyId} format per UKG Ready docs for company reference
    const authUrl = new URL(
      `${instanceUrl.replace(/\/$/, "")}/ta/rest/v2/companies/!${companyId}/oauth2/authorize`
    );

    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set(
      "redirect_uri",
      finalizeUriForProvider("ukg_ready")
    );
    authUrl.searchParams.set("state", connection.connection_id);

    return authUrl.toString();
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions") {
      // If we have an mcp_server_id it means the admin already setup the connection and we have
      // everything we need, otherwise we'll need client_id, client_secret, instance_url, and company_id.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }

    // Standard OAuth flow needs: client_id, client_secret, instance_url, and ukg_ready_company_id
    if (
      !extraConfig.client_id ||
      !extraConfig.client_secret ||
      !extraConfig.instance_url ||
      !extraConfig.ukg_ready_company_id
    ) {
      return false;
    }

    // Validate instance_url is a valid URL
    return isValidUrl(extraConfig.instance_url);
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
    }

    // Standard OAuth flow needs client_id and client_secret
    return {
      content: {
        client_id: extraConfig.client_id,
        client_secret: extraConfig.client_secret,
      },
      metadata: { workspace_id: workspaceId, user_id: userId },
    };
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
      // For personal actions we reuse the existing connection metadata from the existing
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

        // Return config with workspace connection metadata (client_secret is stored in credential)
        return {
          ...restConfig,
          client_id: connection.metadata.client_id,
          instance_url: connection.metadata.instance_url,
          ukg_ready_company_id: connection.metadata.ukg_ready_company_id,
        };
      }
    }

    // Remove client_secret from extraConfig as it's stored in the credential
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { client_secret, ...configWithoutSecret } = extraConfig;
    return configWithoutSecret;
  }
}
