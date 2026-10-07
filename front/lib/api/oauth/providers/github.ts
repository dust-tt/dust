import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import type { ParsedUrlQuery } from "querystring";

/**
 * Composite `code` sent to core for GitHub App finalize. An unsigned
 * `installation_id` is not proof of authorization; core exchanges the OAuth
 * `code` and checks that the installation is one of the user's.
 */
export const GITHUB_APP_FINALIZE_CODE_PREFIX = "gh_app_install";

/**
 * OAuth `state` for the follow-up user-authorize hop used for legacy installs
 * (App already installed / update callback with no user OAuth `code`):
 * `gh_app_pending:{connection_id}:{installation_id}`.
 */
export const GITHUB_APP_PENDING_STATE_PREFIX = "gh_app_pending";

const GITHUB_INSTALLATION_ID_PATTERN = /^[1-9][0-9]{0,19}$/;
const GITHUB_APP_SETUP_ACTIONS = new Set(["install", "update"]);

export function isGithubInstallationId(value: string): boolean {
  return GITHUB_INSTALLATION_ID_PATTERN.test(value);
}

export function githubAppFinalizeCode(
  installationId: string,
  oauthCode: string
): string | null {
  if (!isGithubInstallationId(installationId) || oauthCode.length === 0) {
    return null;
  }
  return `${GITHUB_APP_FINALIZE_CODE_PREFIX}:${installationId}:${oauthCode}`;
}

export function githubAppPendingState(
  connectionId: string,
  installationId: string
): string | null {
  if (
    !connectionId.startsWith("con_") ||
    !isGithubInstallationId(installationId)
  ) {
    return null;
  }
  return `${GITHUB_APP_PENDING_STATE_PREFIX}:${connectionId}:${installationId}`;
}

export function parseGithubAppPendingState(
  state: string | null
): { connectionId: string; installationId: string } | null {
  if (!state?.startsWith(`${GITHUB_APP_PENDING_STATE_PREFIX}:`)) {
    return null;
  }
  const rest = state.slice(GITHUB_APP_PENDING_STATE_PREFIX.length + 1);
  const separator = rest.indexOf(":");
  if (separator <= 0) {
    return null;
  }
  const connectionId = rest.slice(0, separator);
  const installationId = rest.slice(separator + 1);
  if (
    !connectionId.startsWith("con_") ||
    !isGithubInstallationId(installationId)
  ) {
    return null;
  }
  return { connectionId, installationId };
}

/**
 * Legacy installs: GitHub App is already on the account/org, so the install
 * callback often returns `installation_id` without a user OAuth `code`. Dust
 * then sends the user through `/login/oauth/authorize` before finalize.
 */
export function isGithubAppInstallWithoutUserCode(
  query: ParsedUrlQuery
): boolean {
  const installationId = getStringFromQuery(query, "installation_id");
  const oauthCode = getStringFromQuery(query, "code");
  const state = getStringFromQuery(query, "state");
  if (!installationId || oauthCode || !state?.startsWith("con_")) {
    return false;
  }
  if (!isGithubInstallationId(installationId)) {
    return false;
  }
  const setupAction = getStringFromQuery(query, "setup_action");
  if (setupAction && !GITHUB_APP_SETUP_ACTIONS.has(setupAction)) {
    return false;
  }
  return true;
}

/**
 * Legacy installs only: when the App install/update callback has
 * `installation_id` but no user OAuth `code`, build the follow-up authorize URL.
 */
export function githubAppContinueAuthorizeUriFromQuery(
  query: ParsedUrlQuery,
  connection: OAuthConnectionType
): string | null {
  if (!isGithubAppInstallWithoutUserCode(query)) {
    return null;
  }
  const installationId = getStringFromQuery(query, "installation_id");
  if (!installationId) {
    return null;
  }
  return githubAppUserAuthorizeUri({ connection, installationId });
}

export function githubAppUserAuthorizeUri({
  connection,
  installationId,
}: {
  connection: OAuthConnectionType;
  installationId: string;
}): string | null {
  const useCase = connection.metadata.use_case;
  if (useCase !== "connection" && useCase !== "platform_actions") {
    return null;
  }

  const pendingState = githubAppPendingState(
    connection.connection_id,
    installationId
  );
  if (!pendingState) {
    return null;
  }

  const clientId =
    useCase === "platform_actions"
      ? config.getOAuthGithubAppPlatformActionsClientId()
      : config.getOAuthGithubAppClientId();
  const redirectUri = finalizeUriForProvider({
    provider: "github",
    connection,
  });

  return (
    `https://github.com/login/oauth/authorize?` +
    `client_id=${clientId}` +
    `&state=${encodeURIComponent(pendingState)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`
  );
}

export class GithubOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    if (useCase === "personal_actions") {
      // OAuth flow for personal connections (user access tokens)
      const clientId = config.getOAuthGithubAppPersonalActions();
      const redirectUri = finalizeUriForProvider({
        provider: "github",
        connection,
      });
      const url =
        `https://github.com/login/oauth/authorize?` +
        `client_id=${clientId}` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=repo`;

      return url;
    }

    if (useCase === "webhooks") {
      // OAuth flow for webhook management
      const clientId = config.getOAuthGithubAppWebhooks();
      const redirectUri = finalizeUriForProvider({
        provider: "github",
        connection,
      });
      const url =
        `https://github.com/login/oauth/authorize?` +
        `client_id=${clientId}` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=repo,admin:repo_hook,read:org,admin:org_hook`;

      return url;
    }

    const app =
      useCase === "platform_actions"
        ? config.getOAuthGithubAppPlatformActions()
        : config.getOAuthGithubApp();

    // Requires the GitHub App setting "Request user authorization (OAuth)
    // during installation" so the callback includes a user OAuth `code`.
    // Legacy installs (already installed) may omit `code`; finalize then
    // continues via githubAppUserAuthorizeUri.
    return (
      `https://github.com/apps/${app}/installations/new` +
      `?state=${connection.connection_id}`
    );
  }

  /**
   * @cc [owner:sflory,label:security] github-app-finalize-requires-user-oauth
   * GitHub App callbacks MUST send both `installation_id` and user OAuth `code`.
   * `codeFromQuery` MUST NOT treat `installation_id` alone as the finalize code.
   * User-token OAuth callbacks (personal_actions, webhooks) send only `code`.
   * Legacy-install hop 2 uses `code` plus pending state carrying installation_id.
   */
  codeFromQuery(query: ParsedUrlQuery) {
    const installationId = getStringFromQuery(query, "installation_id");
    const oauthCode = getStringFromQuery(query, "code");

    if (installationId) {
      if (!oauthCode) {
        return null;
      }
      return githubAppFinalizeCode(installationId, oauthCode);
    }

    if (!oauthCode) {
      return null;
    }

    // Legacy-install follow-up authorize: installation_id was stashed in state.
    const pending = parseGithubAppPendingState(
      getStringFromQuery(query, "state")
    );
    if (pending) {
      return githubAppFinalizeCode(pending.installationId, oauthCode);
    }

    return oauthCode;
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    const state = getStringFromQuery(query, "state");
    const pending = parseGithubAppPendingState(state);
    if (pending) {
      return pending.connectionId;
    }
    return state;
  }

  isCallbackQueryValid(query: ParsedUrlQuery) {
    const installationId = getStringFromQuery(query, "installation_id");
    const oauthCode = getStringFromQuery(query, "code");
    if (!installationId) {
      if (!oauthCode) {
        return false;
      }
      const pending = parseGithubAppPendingState(
        getStringFromQuery(query, "state")
      );
      // Hop 2 for legacy installs, or plain user-token OAuth.
      return pending !== null || getStringFromQuery(query, "state") !== null;
    }

    const setupAction = getStringFromQuery(query, "setup_action");
    if (setupAction && !GITHUB_APP_SETUP_ACTIONS.has(setupAction)) {
      return false;
    }

    return (
      isGithubInstallationId(installationId) &&
      oauthCode !== null &&
      oauthCode.length > 0
    );
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions") {
      return (
        Object.keys(extraConfig).length === 1 && "mcp_server_id" in extraConfig
      );
    }
    return (
      Object.keys(extraConfig).length === 0 ||
      (Object.keys(extraConfig).length === 1 && "mcp_server_id" in extraConfig)
    );
  }
}
