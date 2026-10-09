import { createHmac, timingSafeEqual } from "node:crypto";
import config from "@app/lib/api/config";
import type { OAuthError } from "@app/lib/api/oauth";
import {
  getWorkspaceOAuthConnectionForMCPServer,
  shouldFallThroughPlatformWorkspaceReuse,
} from "@app/lib/api/oauth/mcp_server_connection_auth";
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
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import {
  isValidShopifyStoreDomain,
  normalizeShopifyStoreDomain,
} from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { ParsedUrlQuery } from "querystring";

const SHOPIFY_SCOPES = [
  "read_all_orders",
  "read_customers",
  "read_orders",
  "read_products",
] as const;

function hasValidClientCredentials(extraConfig: ExtraConfigType): boolean {
  return (
    !!extraConfig.client_id &&
    !!extraConfig.client_secret &&
    isValidShopifyStoreDomain(extraConfig.shopify_store_domain)
  );
}

export function isValidShopifyCallback(
  query: ParsedUrlQuery,
  clientSecret: string
): boolean {
  const hmac = getStringFromQuery(query, "hmac");
  const storeDomain = getStringFromQuery(query, "shop");
  if (
    !hmac ||
    !/^[a-f0-9]{64}$/i.test(hmac) ||
    !isValidShopifyStoreDomain(storeDomain)
  ) {
    return false;
  }

  const message = Object.entries(query)
    .filter(([key]) => key !== "hmac")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${key}=${Array.isArray(value) ? value.join(",") : (value ?? "")}`
    )
    .join("&");
  const digest = createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  return timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

export class ShopifyOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    clientId,
  }: {
    connection: OAuthConnectionType;
    clientId?: string;
  }) {
    const storeDomain = normalizeShopifyStoreDomain(
      connection.metadata.shopify_store_domain
    );
    if (!storeDomain) {
      throw new Error("Invalid Shopify store domain");
    }
    if (!clientId) {
      throw new Error("Missing client ID for Shopify");
    }

    const url = new URL(`https://${storeDomain}/admin/oauth/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
    url.searchParams.set(
      "redirect_uri",
      finalizeUriForProvider({ provider: "shopify", connection })
    );
    url.searchParams.set("state", connection.connection_id);
    return url.toString();
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  /**
   * @cc [owner:spolu,label:security] connection-callback-signature
   * A Shopify callback MUST match the connection's store and be signed with the client_secret
   * in its related credential. Missing credentials or a failed credential lookup MUST reject it.
   */
  async isCallbackQueryValid(
    query: ParsedUrlQuery,
    connection: OAuthConnectionType
  ): Promise<boolean> {
    if (
      connection.provider !== "shopify" ||
      !connection.related_credential_id ||
      getStringFromQuery(query, "shop") !==
        connection.metadata.shopify_store_domain
    ) {
      return false;
    }

    const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    const credentialRes = await api.getCredentials({
      credentialsId: connection.related_credential_id,
    });
    if (credentialRes.isErr()) {
      return false;
    }

    const { content } = credentialRes.value.credential;
    return (
      "client_secret" in content &&
      isString(content.client_secret) &&
      content.client_secret.length > 0 &&
      isValidShopifyCallback(query, content.client_secret)
    );
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase !== "platform_actions") {
      return false;
    }
    // Existing workspace connections already have the store domain and app credentials.
    if (extraConfig.mcp_server_id) {
      return true;
    }
    return hasValidClientCredentials(extraConfig);
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
    const { mcp_server_id } = extraConfig;
    if (mcp_server_id) {
      const connectionRes = await getWorkspaceOAuthConnectionForMCPServer(
        auth,
        mcp_server_id
      );
      if (connectionRes.isOk()) {
        const connection = connectionRes.value;
        if (
          connection.provider !== "shopify" ||
          !connection.related_credential_id ||
          !connection.metadata.client_id ||
          !isValidShopifyStoreDomain(connection.metadata.shopify_store_domain)
        ) {
          return new Err({
            code: "credential_retrieval_failed",
            message:
              "Reconnect Shopify with your app's client ID and client secret.",
          });
        }
        return new Ok({
          content: { from_connection_id: connection.connection_id },
          metadata: { workspace_id: workspaceId, user_id: userId },
          redirectUri: connection.redirect_uri,
        });
      }
      if (
        !shouldFallThroughPlatformWorkspaceReuse({
          useCase,
          error: connectionRes.error,
        })
      ) {
        return new Err({
          code: "credential_retrieval_failed",
          message: connectionRes.error.message,
          ...(connectionRes.error.kind === "oauth_metadata_failed" &&
          connectionRes.error.oAuthAPIError
            ? { oAuthAPIError: connectionRes.error.oAuthAPIError }
            : {}),
        });
      }
      // First connect only: no workspace connection yet.
    }

    if (!hasValidClientCredentials(extraConfig)) {
      return new Err({
        code: "credential_retrieval_failed",
        message:
          "Missing or invalid Shopify store domain, client_id or client_secret",
      });
    }

    return new Ok({
      content: {
        client_id: extraConfig.client_id,
        client_secret: extraConfig.client_secret,
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
    const { mcp_server_id } = extraConfig;
    if (mcp_server_id) {
      const connectionRes = await getWorkspaceOAuthConnectionForMCPServer(
        auth,
        mcp_server_id
      );
      if (connectionRes.isOk()) {
        const storeDomain = normalizeShopifyStoreDomain(
          connectionRes.value.metadata.shopify_store_domain
        );
        if (storeDomain) {
          return {
            client_id: connectionRes.value.metadata.client_id,
            shopify_store_domain: storeDomain,
          };
        }
        throw new Error(
          "Shopify workspace connection is missing a store domain; " +
            "cannot set up a connection from it."
        );
      }
      if (
        !shouldFallThroughPlatformWorkspaceReuse({
          useCase,
          error: connectionRes.error,
        })
      ) {
        throw new Error(connectionRes.error.message);
      }
      // First connect only: no workspace connection yet.
    }

    const storeDomain = normalizeShopifyStoreDomain(
      extraConfig.shopify_store_domain
    );
    return {
      client_id: extraConfig.client_id,
      shopify_store_domain: storeDomain ?? "",
    };
  }
}
