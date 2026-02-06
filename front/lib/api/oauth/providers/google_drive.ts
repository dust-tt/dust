import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/types";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class GoogleDriveOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    extraConfig?: ExtraConfigType;
  }) {
    const scopes =
      useCase === "labs_transcripts"
        ? ["https://www.googleapis.com/auth/drive.meet.readonly"]
        : [
            "https://www.googleapis.com/auth/drive.metadata.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/drive.labels.readonly",
          ];

    const qs = querystring.stringify({
      response_type: "code",
      client_id: config.getOAuthGoogleDriveClientId(),
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider("google_drive"),
      scope: extraConfig?.scope ?? scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
    });

    return `https://accounts.google.com/o/oauth2/auth?${qs}`;
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      if (extraConfig.scope) {
        return true;
      }
    }

    return Object.keys(extraConfig).length === 0;
  }
}
