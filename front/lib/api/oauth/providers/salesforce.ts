import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import { isManaged } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import { ConnectorsAPI, isValidSalesforceDomain, OAuthAPI } from "@app/types";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class SalesforceOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    clientId,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    clientId?: string;
  }) {
    if (!connection.metadata.instance_url) {
      throw new Error("Missing Salesforce instance URL");
    }
    if (
      !connection.metadata.code_verifier ||
      !connection.metadata.code_challenge
    ) {
      throw new Error("Missing PKCE code verifier or challenge");
    }

    if (!clientId) {
      throw new Error("Missing Salesforce client ID");
    }
    return (
      `${connection.metadata.instance_url}/services/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${clientId}` +
      `&state=${connection.connection_id}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("salesforce"))}` +
      `&code_challenge=${connection.metadata.code_challenge}` +
      `&code_challenge_method=S256`
    );
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
      // everything we need, otherwise we'll need the instance_url and client_id.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }

    if (useCase === "salesforce_personal") {
      return true;
    }

    if (!extraConfig.instance_url || !extraConfig.client_id) {
      return false;
    }
    return isValidSalesforceDomain(extraConfig.instance_url);
  }

  async getRelatedCredential(
    auth: Authenticator,
    extraConfig: ExtraConfigType,
    workspaceId: string,
    userId: string,
    useCase: OAuthUseCase
  ) {
    // SALESFORCE CONNECTION TO BE DEPRECATED.
    if (useCase === "salesforce_personal") {
      // For personal connection, we reuse the existing connection credential id
      // from the existing data source, if it exists.
      const dataSources = await DataSourceResource.listByConnectorProvider(
        auth,
        "salesforce"
      );
      if (dataSources.length !== 1) {
        return null;
      }
      const dataSource = dataSources[0].toJSON();
      if (!isManaged(dataSource)) {
        return null;
      }

      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );
      const connectorRes =
        await connectorsAPI.getConnectorFromDataSource(dataSource);
      if (connectorRes.isErr()) {
        return null;
      }

      const connector = connectorRes.value;

      const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
      const connectionRes = await oauthApi.getAccessToken({
        connectionId: connector.connectionId,
      });
      if (connectionRes.isErr()) {
        return null;
      }
      const connection = connectionRes.value.connection;
      const connectionId = connection.connection_id;

      return {
        credential: {
          content: {
            from_connection_id: connectionId,
          },
          metadata: { workspace_id: workspaceId, user_id: userId },
        },
        cleanedConfig: {
          client_id: connection.metadata.client_id as string,
          instance_url: connection.metadata.instance_url as string,
          ...extraConfig,
        },
      };
    }

    if (useCase === "personal_actions") {
      // For personal actions we reuse the existing connection credential id from the existing
      // workspace connection (setup by admin) if we have it, otherwise we fallback to assuming
      // we have client_secret and instance_url (initial admin setup).
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const mcpServerConnectionRes =
          await MCPServerConnectionResource.findByMCPServer({
            auth,
            mcpServerId: mcp_server_id as string,
            connectionType: "workspace",
          });

        if (mcpServerConnectionRes.isErr()) {
          return null;
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getConnectionMetadata({
          connectionId: mcpServerConnectionRes.value.connectionId,
        });
        if (connectionRes.isErr()) {
          return null;
        }
        const connection = connectionRes.value.connection;
        const connectionId = connection.connection_id;

        return {
          credential: {
            content: {
              from_connection_id: connectionId,
            },
            metadata: { workspace_id: workspaceId, user_id: userId },
          },
          cleanedConfig: {
            client_id: connection.metadata.client_id as string,
            instance_url: connection.metadata.instance_url as string,
            ...restConfig,
          },
        };
      }
    }

    const { client_secret, ...restConfig } = extraConfig;
    // Keep client_id in metadata in clear text.
    return {
      credential: {
        content: {
          client_secret,
          client_id: extraConfig.client_id,
        },
        metadata: { workspace_id: workspaceId, user_id: userId },
      },
      cleanedConfig: restConfig,
    };
  }
}
