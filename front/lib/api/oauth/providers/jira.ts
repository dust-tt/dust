import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class JiraOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const scopes = [
      "read:jira-work",
      "read:jira-user",
      "read:issue:jira",
      "read:issue.property:jira",
      "read:project:jira",
      "read:user:jira",
      "offline_access",
    ];
    return (
      `https://auth.atlassian.com/authorize?audience=api.atlassian.com` +
      `&client_id=${config.getOAuthJiraClientId()}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("jira"))}` +
      `&state=${connection.connection_id}` +
      `&response_type=code&prompt=consent`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType) {
    return Object.keys(extraConfig).length === 0;
  }
}
