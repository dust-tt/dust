import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import { ConfluenceOAuthProvider } from "@app/lib/api/oauth/providers/confluence";
import { GithubOAuthProvider } from "@app/lib/api/oauth/providers/github";
import { GmailOAuthProvider } from "@app/lib/api/oauth/providers/gmail";
import { GongOAuthProvider } from "@app/lib/api/oauth/providers/gong";
import { GoogleDriveOAuthProvider } from "@app/lib/api/oauth/providers/google_drive";
import { HubspotOAuthProvider } from "@app/lib/api/oauth/providers/hubspot";
import { IntercomOAuthProvider } from "@app/lib/api/oauth/providers/intercom";
import { MCPOAuthProvider } from "@app/lib/api/oauth/providers/mcp";
import { MicrosoftOAuthProvider } from "@app/lib/api/oauth/providers/microsoft";
import { NotionOAuthProvider } from "@app/lib/api/oauth/providers/notion";
import { SalesforceOAuthProvider } from "@app/lib/api/oauth/providers/salesforce";
import { SlackOAuthProvider } from "@app/lib/api/oauth/providers/slack";
import { ZendeskOAuthProvider } from "@app/lib/api/oauth/providers/zendesk";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type {
  OAuthAPIError,
  OAuthConnectionType,
  OAuthProvider,
  OAuthUseCase,
  Result,
} from "@app/types";
import { Err, OAuthAPI, Ok } from "@app/types";

export type OAuthError = {
  code:
    | "connection_creation_failed"
    | "connection_not_implemented"
    | "connection_finalization_failed";
  message: string;
  oAuthAPIError?: OAuthAPIError;
};

function finalizeUriForProvider(provider: OAuthProvider): string {
  return config.getClientFacingUrl() + `/oauth/${provider}/finalize`;
}

// DO NOT USE THIS DIRECTLY, USE getProviderStrategy instead.
const _PROVIDER_STRATEGIES: Record<OAuthProvider, BaseOAuthStrategyProvider> = {
  confluence: new ConfluenceOAuthProvider(),
  github: new GithubOAuthProvider(),
  gmail: new GmailOAuthProvider(),
  gong: new GongOAuthProvider(),
  google_drive: new GoogleDriveOAuthProvider(),
  hubspot: new HubspotOAuthProvider(),
  intercom: new IntercomOAuthProvider(),
  mcp: new MCPOAuthProvider(),
  microsoft: new MicrosoftOAuthProvider(),
  notion: new NotionOAuthProvider(),
  salesforce: new SalesforceOAuthProvider(),
  slack: new SlackOAuthProvider(),
  zendesk: new ZendeskOAuthProvider(),
};

function getProviderStrategy(
  provider: OAuthProvider
): BaseOAuthStrategyProvider {
  return _PROVIDER_STRATEGIES[provider];
}

export async function createConnectionAndGetSetupUrl(
  auth: Authenticator,
  provider: OAuthProvider,
  useCase: OAuthUseCase,
  extraConfig: ExtraConfigType
): Promise<Result<string, OAuthError>> {
  const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const providerStrategy = getProviderStrategy(provider);

  if (!providerStrategy.isExtraConfigValid(extraConfig, useCase)) {
    logger.error(
      { provider, useCase, extraConfig },
      "OAuth: Invalid extraConfig before getting related credential"
    );
    return new Err({
      code: "connection_creation_failed",
      message:
        "Invalid OAuth connection extraConfig for provider before getting related credential",
    });
  }

  // Extract related credential and update config if the provider has a method for it
  let relatedCredential:
    | {
        content: Record<string, string>;
        metadata: { workspace_id: string; user_id: string };
      }
    | undefined = undefined;
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const userId = auth.getNonNullableUser().sId;

  if (providerStrategy.getRelatedCredential) {
    const result = await providerStrategy.getRelatedCredential!(
      auth,
      extraConfig,
      workspaceId,
      userId,
      useCase
    );
    if (result) {
      relatedCredential = result.credential;
      extraConfig = result.cleanedConfig;

      if (
        //TODO: add the same verification for other providers with a getRelatedCredential method.
        providerStrategy.isExtraConfigValidPostRelatedCredential &&
        !providerStrategy.isExtraConfigValidPostRelatedCredential!(
          extraConfig,
          useCase
        )
      ) {
        logger.error(
          { provider, useCase, extraConfig },
          "OAuth: Invalid extraConfig after getting related credential"
        );
        return new Err({
          code: "connection_creation_failed",
          message:
            "Invalid OAuth connection extraConfig for provider after getting related credential",
        });
      }
    }
  }

  const clientId: string | undefined = extraConfig.client_id as string;

  const metadata: Record<string, unknown> = {
    use_case: useCase,
    workspace_id: auth.getNonNullableWorkspace().sId,
    user_id: auth.getNonNullableUser().sId,
    ...extraConfig,
  };

  const cRes = await api.createConnection({
    provider,
    metadata,
    relatedCredential,
  });
  if (cRes.isErr()) {
    logger.error({ provider, useCase }, "OAuth: Failed to create connection");
    return new Err({
      code: "connection_creation_failed",
      message: "Failed to create new OAuth connection",
      oAuthAPIError: cRes.error,
    });
  }

  const connection = cRes.value.connection;

  return new Ok(
    providerStrategy.setupUri({
      connection,
      extraConfig,
      relatedCredential,
      useCase,
      clientId,
    })
  );
}

export async function finalizeConnection(
  provider: OAuthProvider,
  query: ParsedUrlQuery
): Promise<Result<OAuthConnectionType, OAuthError>> {
  const providerStrategy = getProviderStrategy(provider);
  const code = providerStrategy.codeFromQuery(query);

  if (!code) {
    logger.error(
      { provider, step: "code_extraction" },
      "OAuth: Failed to finalize connection"
    );
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: authorization code not found in query`,
    });
  }

  const connectionId = providerStrategy.connectionIdFromQuery(query);

  if (!connectionId) {
    logger.error(
      { provider, step: "connection_extraction" },
      "OAuth: Failed to finalize connection"
    );
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: connection not found in query`,
    });
  }

  const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const cRes = await api.finalizeConnection({
    provider,
    connectionId,
    code,
    redirectUri: finalizeUriForProvider(provider),
  });

  if (cRes.isErr()) {
    logger.error(
      {
        provider,
        connectionId,
        step: "connection_finalization",
      },
      "OAuth: Failed to finalize connection"
    );

    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: ${cRes.error.message}`,
      oAuthAPIError: cRes.error,
    });
  }

  return new Ok(cRes.value.connection);
}

export async function checkConnectionOwnership(
  auth: Authenticator,
  connectionId: string
) {
  if (!connectionId || !connectionId.startsWith("con_")) {
    return new Ok(undefined);
  }

  // Ensure the connectionId has been created by the current user and is not being stolen.
  const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const connectionRes = await oauthAPI.getAccessToken({
    connectionId,
  });
  if (
    connectionRes.isErr() ||
    connectionRes.value.connection.metadata.user_id !== auth.user()?.sId
  ) {
    return new Err(new Error("Invalid connection"));
  }

  return new Ok(undefined);
}
