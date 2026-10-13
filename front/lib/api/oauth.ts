import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import config from "@app/lib/api/config";
import {
  generateOAuthFinalizeNonce,
  hashOAuthFinalizeNonce,
  OAUTH_FINALIZE_NONCE_METADATA_KEY,
  oauthFinalizeNoncesMatch,
  scrubFinalizeNonceFromMetadata,
} from "@app/lib/api/oauth/finalize_binding";
import { verifyWorkspaceOAuthConnectionForMCPServer } from "@app/lib/api/oauth/mcp_server_connection_auth";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import { ConfluenceOAuthProvider } from "@app/lib/api/oauth/providers/confluence";
import { ConfluenceToolsOAuthProvider } from "@app/lib/api/oauth/providers/confluence_tools";
import { FathomOAuthProvider } from "@app/lib/api/oauth/providers/fathom";
import { FreshserviceOAuthProvider } from "@app/lib/api/oauth/providers/freshservice";
import {
  GithubOAuthProvider,
  githubAppContinueAuthorizeUriFromQuery,
} from "@app/lib/api/oauth/providers/github";
import { GmailOAuthProvider } from "@app/lib/api/oauth/providers/gmail";
import { GongOAuthProvider } from "@app/lib/api/oauth/providers/gong";
import { GoogleDriveOAuthProvider } from "@app/lib/api/oauth/providers/google_drive";
import { HubspotOAuthProvider } from "@app/lib/api/oauth/providers/hubspot";
import { IntercomOAuthProvider } from "@app/lib/api/oauth/providers/intercom";
import { JiraOAuthProvider } from "@app/lib/api/oauth/providers/jira";
import { LinearOAuthProvider } from "@app/lib/api/oauth/providers/linear";
import { MCPOAuthProvider } from "@app/lib/api/oauth/providers/mcp";
import { MCPOAuthStaticOAuthProvider } from "@app/lib/api/oauth/providers/mcp_static";
import { MicrosoftOAuthProvider } from "@app/lib/api/oauth/providers/microsoft";
import { MicrosoftToolsOAuthProvider } from "@app/lib/api/oauth/providers/microsoft_tools";
import { MondayOAuthProvider } from "@app/lib/api/oauth/providers/monday";
import { NotionOAuthProvider } from "@app/lib/api/oauth/providers/notion";
import { ProductboardOAuthProvider } from "@app/lib/api/oauth/providers/productboard";
import { SalesforceOAuthProvider } from "@app/lib/api/oauth/providers/salesforce";
import { ServiceNowOAuthProvider } from "@app/lib/api/oauth/providers/servicenow";
import { ShopifyOAuthProvider } from "@app/lib/api/oauth/providers/shopify";
import { SlackOAuthProvider } from "@app/lib/api/oauth/providers/slack";
import { SlackToolsOAuthProvider } from "@app/lib/api/oauth/providers/slack_tools";
import { SnowflakeOAuthProvider } from "@app/lib/api/oauth/providers/snowflake";
import { UkgReadyOAuthProvider } from "@app/lib/api/oauth/providers/ukg_ready";
import { VantaOAuthProvider } from "@app/lib/api/oauth/providers/vanta";
import { ZendeskOAuthProvider } from "@app/lib/api/oauth/providers/zendesk";
import { finalizeUriForProvider } from "@app/lib/api/oauth/utils";
import { Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { isTrustedDustOpenerOrigin } from "@app/lib/oauth/opener_origin";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthProvider,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import type { OAuthAPIError } from "@app/types/oauth/oauth_api";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { ParsedUrlQuery } from "querystring";

export type OAuthError = {
  code:
    | "connection_creation_failed"
    | "connection_not_implemented"
    | "connection_finalization_failed"
    | "connection_ownership_mismatch"
    | "credential_retrieval_failed"
    | "mcp_server_connection_not_found";
  message: string;
  oAuthAPIError?: OAuthAPIError;
};

export type OAuthSetupResult = {
  setupUrl: string;
  connectionId: string;
  finalizeNonce: string;
};

export type FinalizeConnectionOptions = {
  /**
   * Workspace sId from the session cookie/JWT claim. Used when
   * `auth.workspace()` is null (cross-region callback) so ownership can still
   * be checked against the initiating workspace without a local workspace row.
   */
  sessionWorkspaceId?: string;
  /** Nonce from the HttpOnly cookie set at setup for this connection. */
  finalizeNonce?: string;
};

// DO NOT USE THIS DIRECTLY, USE getProviderStrategy instead.
const _PROVIDER_STRATEGIES: Record<OAuthProvider, BaseOAuthStrategyProvider> = {
  confluence: new ConfluenceOAuthProvider(),
  confluence_tools: new ConfluenceToolsOAuthProvider(),
  fathom: new FathomOAuthProvider(),
  freshservice: new FreshserviceOAuthProvider(),
  github: new GithubOAuthProvider(),
  gmail: new GmailOAuthProvider(),
  gong: new GongOAuthProvider(),
  google_drive: new GoogleDriveOAuthProvider(),
  hubspot: new HubspotOAuthProvider(),
  intercom: new IntercomOAuthProvider(),
  jira: new JiraOAuthProvider(),
  linear: new LinearOAuthProvider(),
  mcp: new MCPOAuthProvider(),
  mcp_static: new MCPOAuthStaticOAuthProvider(),
  microsoft: new MicrosoftOAuthProvider(),
  microsoft_tools: new MicrosoftToolsOAuthProvider(),
  monday: new MondayOAuthProvider(),
  notion: new NotionOAuthProvider(),
  productboard: new ProductboardOAuthProvider(),
  salesforce: new SalesforceOAuthProvider(),
  shopify: new ShopifyOAuthProvider(),
  servicenow: new ServiceNowOAuthProvider(),
  slack: new SlackOAuthProvider(),
  slack_tools: new SlackToolsOAuthProvider(),
  snowflake: new SnowflakeOAuthProvider(),
  ukg_ready: new UkgReadyOAuthProvider(),
  zendesk: new ZendeskOAuthProvider(),
  vanta: new VantaOAuthProvider(),
};

export function getProviderStrategy(
  provider: OAuthProvider
): BaseOAuthStrategyProvider {
  return _PROVIDER_STRATEGIES[provider];
}

/**
 * @cc [owner:flvndvd,label:security] persist-credential-redirect
 * Connection creation MUST use the related credential's redirectUri when present,
 * otherwise the configured callback for the provider and use case. Caller-supplied
 * extraConfig MUST NOT override the callback used for creation, authorization, or
 * finalization.
 */
/**
 * @cc [owner:flvndvd,label:security] oauth-setup-binds-finalize-nonce
 * Connection creation MUST stamp `hashOAuthFinalizeNonce(nonce)` on connection
 * metadata (after spreading caller extraConfig so it cannot be overwritten) and
 * return the plaintext nonce so the setup route can set a matching HttpOnly
 * cookie. Finalize MUST reject when the cookie does not match — see
 * `oauth-finalize-requires-ownership`. Connection metadata MUST never store the
 * plaintext cookie value.
 */
/**
 * @cc [owner:spolu,label:security;logging] no-oauth-setup-config-values-in-logs
 * Setup validation failures MUST NOT log extraConfig values, except extraConfig.mcp_server_id,
 * which MAY be logged as a non-secret diagnostic identifier. Configuration payloads MUST be
 * logged as key names only, never as raw objects.
 */
export async function createConnectionAndGetSetupUrl(
  auth: Authenticator,
  provider: OAuthProvider,
  useCase: OAuthUseCase,
  extraConfig: ExtraConfigType,
  openerOrigin?: string
): Promise<Result<OAuthSetupResult, OAuthError>> {
  const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const providerStrategy = getProviderStrategy(provider);

  // opener_origin is reserved for the validated query param. Strip it from
  // caller-supplied extraConfig before validation/persistence so it cannot
  // bypass the allowlist via metadata spread.
  const {
    opener_origin: _openerOriginFromExtraConfig,
    ...extraConfigWithoutOpenerOrigin
  } = extraConfig;
  extraConfig = extraConfigWithoutOpenerOrigin;

  if (!providerStrategy.isExtraConfigValid(extraConfig, useCase)) {
    logger.error(
      { provider, useCase, extraConfigKeys: Object.keys(extraConfig) },
      "OAuth: Invalid extraConfig before getting related credential"
    );
    return new Err({
      code: "connection_creation_failed",
      message:
        "Invalid OAuth connection extraConfig for provider before getting related credential",
    });
  }

  // Extract related credential and update config if the provider has a method for it
  let relatedCredential: RelatedCredential | undefined = undefined;
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const userId = auth.getNonNullableUser().sId;

  // Personal connections with an `mcp_server_id` inherit their config from the workspace-level
  // admin connection. Verify it upfront: the front row can reference a connection that no longer
  // exists in the OAuth service (e.g. after a workspace relocation), and every provider treats
  // that as fatal deeper in the flow with a less actionable error. The provider re-fetches the
  // same metadata right after; the redundant read is acceptable for this rare, human-initiated
  // flow.
  if (useCase === "personal_actions" && isString(extraConfig.mcp_server_id)) {
    const workspaceConnectionRes =
      await verifyWorkspaceOAuthConnectionForMCPServer(
        auth,
        extraConfig.mcp_server_id
      );
    if (workspaceConnectionRes.isErr()) {
      // `info`, not `warn`: this is a user-recoverable condition, not a failure.
      logger.info(
        {
          workspaceId,
          userId,
          provider,
          useCase,
          mcpServerId: extraConfig.mcp_server_id,
          kind: workspaceConnectionRes.error.kind,
        },
        "OAuth: Workspace connection missing or invalid for personal connection setup"
      );
      return new Err({
        code: "mcp_server_connection_not_found",
        message: workspaceConnectionRes.error.message,
      });
    }
  }

  if (providerStrategy.getRelatedCredential) {
    const credentialResult = await providerStrategy.getRelatedCredential!(
      auth,
      {
        extraConfig,
        workspaceId,
        userId,
        useCase,
      }
    );

    // If getRelatedCredential returned an error, propagate it
    if (credentialResult && credentialResult.isErr()) {
      return new Err(credentialResult.error);
    }

    // credentialResult is either undefined or Ok at this point
    const credentials = credentialResult?.isOk()
      ? credentialResult.value
      : undefined;
    if (credentials) {
      if (!providerStrategy.getUpdatedExtraConfig) {
        // You probably need to clean up the extra config to remove any sensitive data (such as client_secret).
        return new Err({
          code: "connection_creation_failed",
          message:
            "If the providerStrategy has a getRelatedCredential method, it must also have a getUpdatedExtraConfig method.",
        });
      }

      relatedCredential = credentials;

      extraConfig = await providerStrategy.getUpdatedExtraConfig!(auth, {
        extraConfig,
        useCase,
      });

      if (
        //TODO: add the same verification for other providers with a getRelatedCredential method.
        providerStrategy.isExtraConfigValidPostRelatedCredential &&
        !providerStrategy.isExtraConfigValidPostRelatedCredential!(
          extraConfig,
          useCase
        )
      ) {
        logger.error(
          { provider, useCase, extraConfigKeys: Object.keys(extraConfig) },
          "OAuth: Invalid extraConfig after getting related credential"
        );
        return new Err({
          code: "connection_creation_failed",
          message:
            "Invalid OAuth connection extraConfig for provider after getting related credential",
        });
      }
    }
  } else if (providerStrategy.getUpdatedExtraConfig) {
    extraConfig = await providerStrategy.getUpdatedExtraConfig!(auth, {
      extraConfig,
      useCase,
    });
  }

  const clientId: string | undefined = extraConfig.client_id as string;

  // mcp_server_id is only a lookup key for inheriting workspace connection config;
  // never persist it on the OAuth connection metadata.
  const { mcp_server_id: _mcpServerId, ...connectionExtraConfig } = extraConfig;

  const finalizeNonce = generateOAuthFinalizeNonce();

  // Identity and finalize binding MUST be written after spreading caller
  // extraConfig so a malicious client cannot overwrite user_id / workspace_id /
  // finalize_nonce_hash via setup query params.

  // Defense in depth: only persist opener origins that are trusted Dust
  // surfaces. The setup route also rejects untrusted query values with 400.
  const trustedOpenerOrigin =
    openerOrigin && isTrustedDustOpenerOrigin(openerOrigin)
      ? openerOrigin
      : undefined;
  if (openerOrigin && !trustedOpenerOrigin) {
    return new Err({
      code: "connection_creation_failed",
      message:
        "Invalid openerOrigin: must be an explicitly trusted Dust origin.",
    });
  }

  const metadata: Record<string, unknown> = {
    use_case: useCase,
    ...connectionExtraConfig,
    workspace_id: auth.getNonNullableWorkspace().sId,
    user_id: auth.getNonNullableUser().sId,
    [OAUTH_FINALIZE_NONCE_METADATA_KEY]: hashOAuthFinalizeNonce(finalizeNonce),
    // Store opener origin for postMessage after OAuth finalize (cross-origin popup communication)
    ...(trustedOpenerOrigin && { opener_origin: trustedOpenerOrigin }),
  };

  const cRes = await api.createConnection({
    provider,
    metadata,
    // Reused clients keep the callback their workspace connection registered.
    redirectUri:
      relatedCredential?.redirectUri ??
      finalizeUriForProvider({ provider, connection: null, useCase }),
    relatedCredential: relatedCredential && {
      content: relatedCredential.content,
      metadata: relatedCredential.metadata,
    },
  });
  if (cRes.isErr()) {
    logger.error(
      { workspaceId, userId, provider, useCase, error: cRes.error },
      "OAuth: Failed to create connection"
    );
    return new Err({
      code: "connection_creation_failed",
      message: "Failed to create new OAuth connection",
      oAuthAPIError: cRes.error,
    });
  }

  const connection = cRes.value.connection;

  // No req available in this library function — context defaults to auth.clientIp().
  void emitAuditLogEvent({
    auth,
    action: "oauth.initiated",
    targets: [buildAuditLogTarget("workspace", auth.getNonNullableWorkspace())],
    metadata: {
      provider: String(provider),
      connection_id: connection.connection_id,
    },
  });

  const forceLabelsScope =
    provider === "microsoft"
      ? await hasFeatureFlag(auth, "sensitivity_labels")
      : false;

  return new Ok({
    setupUrl: providerStrategy.setupUri({
      connection,
      extraConfig,
      relatedCredential,
      useCase,
      clientId,
      forceLabelsScope,
    }),
    connectionId: connection.connection_id,
    finalizeNonce,
  });
}

/**
 * @cc [owner:flvndvd,label:security] oauth-finalize-requires-ownership
 * Before exchanging the authorization code, `finalizeConnection` MUST verify
 * that `connection.metadata.user_id` matches the authenticated session user,
 * that this user is an active member of the workspace in
 * `connection.metadata.workspace_id`, and that the presented finalize nonce
 * hashes to `connection.metadata.finalize_nonce_hash`. The workspace a session
 * was opened on MUST NOT stand in for membership: a user may start a
 * connection from any workspace they belong to. When the connection's
 * workspace is unknown to this region (cross-region callback), it MUST instead
 * equal `sessionWorkspaceId`.
 * It MUST NOT call the OAuth service finalize API when any of those checks fail,
 * and MUST NOT skip checks when auth/workspace is missing. On success it MUST
 * scrub `finalize_nonce_hash` from the returned connection metadata.
 * Fails closed when identity cannot be established — including cross-region
 * callbacks that lack a session workspace claim.
 */
async function assertFinalizeOwnership({
  auth,
  connection,
  options,
}: {
  auth: Authenticator | null;
  connection: OAuthConnectionType;
  options: FinalizeConnectionOptions;
}): Promise<
  Result<
    { user: UserResource; connectionWorkspace: WorkspaceResource | null },
    OAuthError
  >
> {
  const sessionUser = auth?.user();
  const connectionUserId = connection.metadata.user_id;
  const connectionWorkspaceId = connection.metadata.workspace_id;
  const expectedNonce = connection.metadata[OAUTH_FINALIZE_NONCE_METADATA_KEY];

  if (
    !sessionUser ||
    !isString(connectionUserId) ||
    sessionUser.sId !== connectionUserId
  ) {
    return new Err({
      code: "connection_ownership_mismatch",
      message:
        "Failed to finalize connection: authenticated user does not own this connection",
    });
  }

  const workspaceMismatch = new Err<OAuthError>({
    code: "connection_ownership_mismatch",
    message:
      "Failed to finalize connection: authenticated workspace does not own this connection",
  });

  if (!isString(connectionWorkspaceId)) {
    return workspaceMismatch;
  }

  // The session is bound to the workspace picked at login, which is not necessarily the one the
  // connection was started from, so check membership of the connection's workspace instead.
  const connectionWorkspace = await WorkspaceResource.fetchById(
    connectionWorkspaceId
  );
  if (connectionWorkspace) {
    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user: sessionUser,
        workspace: renderLightWorkspaceType({ workspace: connectionWorkspace }),
      });
    if (!membership) {
      return workspaceMismatch;
    }
  } else if (options.sessionWorkspaceId !== connectionWorkspaceId) {
    // Unknown to this region: membership cannot be checked, fall back to the session claim.
    return workspaceMismatch;
  }

  if (!oauthFinalizeNoncesMatch(expectedNonce, options.finalizeNonce)) {
    return new Err({
      code: "connection_ownership_mismatch",
      message:
        "Failed to finalize connection: OAuth finalize nonce mismatch or missing",
    });
  }

  return new Ok({ user: sessionUser, connectionWorkspace });
}

export type FinalizeConnectionResult =
  | { type: "finalized"; connection: OAuthConnectionType }
  | { type: "continue_authorize"; authorizeUrl: string };

/**
 * @cc [owner:flvndvd,label:backend] tolerate-missing-workspace
 * `auth` MAY be null or carry no workspace: the callback session can reference a
 * workspace unknown to this region. Finalization MUST NOT call
 * workspace-requiring accessors for audit logging. Ownership MUST still be
 * verified (see `oauth-finalize-requires-ownership`); missing identity fails
 * closed rather than skipping the check. The `oauth.authorized` audit event is
 * emitted on the connection's workspace when it exists in this region; otherwise
 * a warning is logged since no audit target exists.
 *
 * Architectural note: when the connection's workspace is unknown to this region,
 * membership cannot be checked, so a session without a `sessionWorkspaceId`
 * claim cannot be bound to the connection's `workspace_id` and fails closed.
 * Legitimate cross-region callbacks still work because they retain the workspace
 * claim on the session cookie even when the workspace row is absent locally.
 */
export async function finalizeConnection(
  auth: Authenticator | null,
  provider: OAuthProvider,
  query: ParsedUrlQuery,
  options: FinalizeConnectionOptions = {}
): Promise<Result<FinalizeConnectionResult, OAuthError>> {
  const childLogger = logger.child({
    workspaceId: auth?.workspace()?.sId ?? options.sessionWorkspaceId,
    userId: auth?.user()?.sId,
    provider,
  });

  const providerStrategy = getProviderStrategy(provider);
  const connectionId = providerStrategy.connectionIdFromQuery(query);

  if (!connectionId) {
    childLogger.error(
      { step: "connection_extraction" },
      "OAuth: Failed to finalize connection"
    );
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: connection not found in query`,
    });
  }

  const api = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  // Fetching the connection metadata is necessary to build the redirect URI
  // and to enforce ownership / finalize-nonce binding before code exchange
  // or a GitHub legacy-install continue-authorize redirect.
  const connectionRes = await api.getConnectionMetadata({
    connectionId,
  });

  if (connectionRes.isErr()) {
    childLogger.error(
      { connectionId, step: "connection_metadata_retrieval" },
      "OAuth: Failed to retrieve connection metadata"
    );
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: failed to retrieve connection metadata`,
    });
  }

  const connection = connectionRes.value.connection;

  const ownershipRes = await assertFinalizeOwnership({
    auth,
    connection,
    options,
  });
  if (ownershipRes.isErr()) {
    childLogger.error(
      {
        connectionId,
        step: "ownership_validation",
        connectionUserId: connection.metadata.user_id,
        connectionWorkspaceId: connection.metadata.workspace_id,
      },
      "OAuth: Refusing to finalize connection — ownership or finalize nonce mismatch"
    );
    return ownershipRes;
  }
  const { user, connectionWorkspace } = ownershipRes.value;

  // GitHub-only: legacy installs (App already on the account/org) often return
  // installation_id without a user OAuth code. Continue via /login/oauth/authorize
  // instead of failing finalize. Not modeled on BaseOAuthStrategyProvider.
  if (provider === "github") {
    const authorizeUrl = githubAppContinueAuthorizeUriFromQuery(
      query,
      connection
    );
    if (authorizeUrl) {
      childLogger.info(
        { connectionId, step: "github_legacy_install_continue_authorize" },
        "OAuth: Continuing GitHub App finalize with user authorization"
      );
      return new Ok({ type: "continue_authorize", authorizeUrl });
    }
  }

  const code = providerStrategy.codeFromQuery(query);

  if (!code) {
    const { error, error_description: errorDescription } = query;
    const oauthError = isString(error) ? error : undefined;
    const oauthErrorDescription = isString(errorDescription)
      ? errorDescription
      : undefined;

    childLogger.error(
      {
        step: "code_extraction",
        oauthError,
        oauthErrorDescription,
      },
      "OAuth: Failed to finalize connection"
    );
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: authorization code not found in query`,
    });
  }

  if (
    providerStrategy.isCallbackQueryValid &&
    !providerStrategy.isCallbackQueryValid(query)
  ) {
    childLogger.error(
      { connectionId, step: "callback_validation" },
      "OAuth: Failed to finalize connection"
    );
    return new Err({
      code: "connection_finalization_failed",
      message: `Failed to finalize ${provider} connection: invalid callback signature`,
    });
  }

  const cRes = await api.finalizeConnection({
    provider,
    connection,
    code,
  });

  if (cRes.isErr()) {
    childLogger.error(
      {
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

  if (providerStrategy.checkConnectionValidPostFinalize) {
    const res = await providerStrategy.checkConnectionValidPostFinalize(
      cRes.value.connection
    );
    if (res.isErr()) {
      return new Err({
        code: "connection_finalization_failed",
        message: res.error.message,
      });
    }
  }

  if (connectionWorkspace) {
    const auditAuthPromise =
      auth && auth.workspace()?.sId === connectionWorkspace.sId
        ? Promise.resolve(auth)
        : Authenticator.fromUserIdAndWorkspaceId(
            user.sId,
            connectionWorkspace.sId
          );
    // The code has already been exchanged: audit preparation must not fail the callback.
    // No req available in this library function — context defaults to auth.clientIp().
    void auditAuthPromise
      .then((auditAuth) =>
        emitAuditLogEvent({
          auth: auditAuth,
          action: "oauth.authorized",
          targets: [
            buildAuditLogTarget(
              "workspace",
              auditAuth.getNonNullableWorkspace()
            ),
          ],
          metadata: {
            provider: String(provider),
            connection_id: connectionId,
          },
        })
      )
      .catch((err) => {
        childLogger.error(
          { connectionId, err },
          "oauth.authorized: failed to emit audit log"
        );
      });
  } else {
    childLogger.warn(
      { connectionId },
      "oauth.authorized: skipping audit log — no Authenticator available"
    );
  }

  // Do not return the finalize-nonce hash to callers; it is only needed for the
  // ownership check above and should not circulate after a successful finalize.
  return new Ok({
    type: "finalized",
    connection: {
      ...cRes.value.connection,
      metadata: scrubFinalizeNonceFromMetadata(cRes.value.connection.metadata),
    },
  });
}

/**
 * @cc [owner:frankaloia,label:security;api] check-connection-user-ownership
 * Callers MUST verify that a caller-supplied connection ID (con_ prefix) belongs to
 * the acting user and workspace before forwarding it to downstream services. Use
 * checkConnectionOwnership and reject with 403 on Err.
 */
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
    connectionRes.value.connection.metadata.user_id !== auth.user()?.sId ||
    connectionRes.value.connection.metadata.workspace_id !==
      auth.workspace()?.sId
  ) {
    return new Err(new Error("Invalid connection"));
  }

  return new Ok(undefined);
}

/**
 * @cc [owner:frankaloia,label:security;api] check-credential-workspace-ownership
 * Callers MUST verify that a caller-supplied credential ID (cred_ prefix) belongs to
 * the acting workspace before forwarding it to downstream services. Use
 * checkCredentialOwnership and reject with 403 on Err.
 */
export async function checkCredentialOwnership(
  auth: Authenticator,
  credentialId: string
): Promise<Result<undefined, Error>> {
  if (!credentialId || !credentialId.startsWith("cred_")) {
    return new Ok(undefined);
  }

  const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const credentialRes = await oauthAPI.getCredentials({
    credentialsId: credentialId,
  });

  if (
    credentialRes.isErr() ||
    credentialRes.value.credential.metadata.workspace_id !==
      auth.workspace()?.sId
  ) {
    return new Err(new Error("Invalid credential"));
  }

  return new Ok(undefined);
}
