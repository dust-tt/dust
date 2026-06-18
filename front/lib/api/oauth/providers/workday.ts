import type { OAuthError } from "@app/lib/api/oauth";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

export class WorkdayOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    clientId,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    clientId?: string;
    extraConfig?: ExtraConfigType;
  }) {
    if (!extraConfig || !extraConfig.workday_tenant_url) {
      throw new Error("Missing tenant URL for Workday");
    }
    if (!clientId) {
      throw new Error("Missing client ID for Workday");
    }

    const tenantUrl = extraConfig.workday_tenant_url.trim().replace(/\/$/, "");
    // TODO: confirm exact scope names with a real Workday tenant — scope names are configured
    // per tenant in the Workday API client and may differ (casing, naming, available scopes).
    const scopes = ["Staffing", "Financials", "System"];

    const qs = querystring.stringify({
      response_type: "code",
      client_id: clientId,
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider("workday"),
      scope: scopes.join(" "),
    });

    return `${tenantUrl}/authorize?${qs}`;
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "platform_actions") {
      return !!(
        extraConfig.client_id &&
        extraConfig.client_secret &&
        extraConfig.workday_tenant_url
      );
    }
    return false;
  }

  async getRelatedCredential(
    auth: Authenticator,
    {
      extraConfig,
      workspaceId,
      userId,
    }: {
      extraConfig: ExtraConfigType;
      workspaceId: string;
      userId: string;
      useCase: OAuthUseCase;
    }
  ): Promise<Result<RelatedCredential, OAuthError>> {
    void auth;

    const { client_secret, client_id } = extraConfig;

    if (!isString(client_secret) || !isString(client_id)) {
      return new Err({
        code: "credential_retrieval_failed",
        message: "Missing or invalid client_id or client_secret in extraConfig",
      });
    }

    return new Ok({
      content: { client_secret, client_id },
      metadata: { workspace_id: workspaceId, user_id: userId },
    });
  }

  async getUpdatedExtraConfig(
    auth: Authenticator,
    {
      extraConfig,
    }: {
      extraConfig: ExtraConfigType;
      useCase: OAuthUseCase;
    }
  ): Promise<ExtraConfigType> {
    void auth;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- filter out client_secret before storing in connection metadata.
    const { client_secret, ...restConfig } = extraConfig;
    return restConfig;
  }
}
