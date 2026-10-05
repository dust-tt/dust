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

    return oauthCode;
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isCallbackQueryValid(query: ParsedUrlQuery) {
    const installationId = getStringFromQuery(query, "installation_id");
    const oauthCode = getStringFromQuery(query, "code");
    if (!installationId) {
      return oauthCode !== null;
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
