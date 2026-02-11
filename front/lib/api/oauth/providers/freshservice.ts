import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { OAuthError } from "@app/lib/api/oauth";
import { getWorkspaceOAuthConnectionIdForMCPServer } from "@app/lib/api/oauth/mcp_server_connection_auth";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { ExtraConfigType } from "@app/types/oauth/lib";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export class FreshserviceOAuthProvider implements BaseOAuthStrategyProvider {
  requiresWorkspaceConnectionForPersonalAuth = true;

  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const scopes = [
      "freshservice.departments.view",
      "freshservice.oncall.view",
      "freshservice.products.view",
      "freshservice.purchase_orders.view",
      "freshservice.requesters.fields.view",
      "freshservice.requesters.view",
      "freshservice.service_catalog.view",
      "freshservice.service_catalog.edit",
      "freshservice.sla_policies.view",
      "freshservice.solutions.publish",
      "freshservice.solutions.view",
      "freshservice.statuspage.incidents.publish",
      "freshservice.statuspage.incidents.view",
      "freshservice.statuspage.view",
      "freshservice.tickets.conversations.create",
      "freshservice.tickets.conversations.edit",
      "freshservice.tickets.conversations.view",
      "freshservice.tickets.create",
      "freshservice.tickets.edit",
      "freshservice.tickets.fields.manage",
      "freshservice.tickets.tasks.create",
      "freshservice.tickets.tasks.edit",
      "freshservice.tickets.tasks.delete",
      "freshservice.tickets.tasks.view",
      "freshservice.tickets.time_entries.create",
      "freshservice.tickets.time_entries.edit",
      "freshservice.tickets.time_entries.view",
      "freshservice.tickets.view",
      "freshservice.canned_responses.view",
    ];

    // Get domain from connection metadata
    const freshworksDomainRaw = connection.metadata.freshworks_org_url;

    if (!freshworksDomainRaw) {
      throw new Error("Freshworks domain is required");
    }

    // Normalize the Freshworks domain (remove protocol and trailing slash)
    const freshworksDomain = freshworksDomainRaw
      .trim() // Remove whitespace
      .replace(/^https?:\/\//, "") // Remove protocol
      .replace(/\/$/, ""); // Remove trailing slash

    if (!freshworksDomain) {
      throw new Error("Invalid Freshworks domain format");
    }

    return (
      `https://${freshworksDomain}/org/oauth/v2/authorize` +
      `?response_type=code` +
      `&client_id=${config.getOAuthFreshserviceClientId()}` +
      `&state=${connection.connection_id}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("freshservice"))}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // If we have an mcp_server_id it means the admin already setup the connection and we have
      // everything we need, otherwise we'll need the instance_url and client_id.
      if (extraConfig.mcp_server_id) {
        return true;
      }
      // For personal/platform actions without MCP server, still need the standard validation
      return (
        !!extraConfig.freshworks_org_url && !!extraConfig.freshservice_domain
      );
    }

    // For other use cases, both domains are required
    if (Object.keys(extraConfig).length !== 2) {
      return false;
    }
    return (
      !!extraConfig.freshworks_org_url && !!extraConfig.freshservice_domain
    );
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
  ): Promise<Result<RelatedCredential, OAuthError>> {
    if (useCase === "personal_actions") {
      // For personal actions we reuse the existing connection credential id from the existing
      // workspace connection (setup by admin) if we have it, otherwise we fallback to assuming
      // we have client_id and instance_url (initial admin setup).
      const { mcp_server_id } = extraConfig;

      if (mcp_server_id) {
        logger.info(
          `Freshservice getRelatedCredential: Using MCP server connection for mcp_server_id: ${mcp_server_id}`
        );
        const oauthConnectionIdRes =
          await getWorkspaceOAuthConnectionIdForMCPServer(auth, mcp_server_id);
        if (oauthConnectionIdRes.isErr()) {
          return new Err({
            code: "credential_retrieval_failed",
            message: oauthConnectionIdRes.error.message,
          });
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getConnectionMetadata({
          connectionId: oauthConnectionIdRes.value,
        });
        if (connectionRes.isErr()) {
          return new Err({
            code: "credential_retrieval_failed",
            message:
              "Failed to get connection metadata: " +
              connectionRes.error.message,
            oAuthAPIError: connectionRes.error,
          });
        }
        const connection = connectionRes.value.connection;
        const connectionId = connection.connection_id;

        return new Ok({
          content: {
            from_connection_id: connectionId,
            freshservice_domain: connection.metadata.freshservice_domain,
          },
          metadata: { workspace_id: workspaceId, user_id: userId },
        });
      }
    }

    // For non-personal actions, we need freshservice_domain in the extraConfig
    if (!extraConfig.freshservice_domain) {
      return new Err({
        code: "credential_retrieval_failed",
        message: `Missing freshservice_domain in extraConfig for Freshservice credential creation. UseCase: ${useCase}, ExtraConfig keys: ${Object.keys(extraConfig).join(", ")}`,
      });
    }

    return new Ok({
      content: {
        freshservice_domain: extraConfig.freshservice_domain,
      },
      metadata: { workspace_id: workspaceId, user_id: userId },
    });
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
      // workspace connection (setup by admin) if we have it, otherwise we fallback to assuming
      // we have client_id and instance_url (initial admin setup).
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const oauthConnectionIdRes =
          await getWorkspaceOAuthConnectionIdForMCPServer(auth, mcp_server_id);
        if (oauthConnectionIdRes.isErr()) {
          throw new Error(oauthConnectionIdRes.error.message);
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getConnectionMetadata({
          connectionId: oauthConnectionIdRes.value,
        });
        if (connectionRes.isErr()) {
          throw new Error(
            "Failed to get connection metadata: " + connectionRes.error.message
          );
        }
        const connection = connectionRes.value.connection;

        return {
          ...restConfig,
          freshservice_domain: connection.metadata.freshservice_domain,
          freshworks_org_url: connection.metadata.freshworks_org_url,
        };
      }
    }

    return extraConfig;
  }
}
