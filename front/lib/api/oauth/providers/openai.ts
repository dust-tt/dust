import type { ParsedUrlQuery } from "querystring";
import { z } from "zod";

import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import { getStringFromQuery } from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type {
  OAuthConnectionType,
  OAuthProvider,
  OAuthUseCase,
} from "@app/types/oauth/lib";

const OpenAIOAuthConnectionMetadataSchema = z.object({
  client_id: z.string().min(1, "OpenAI Admin API key is required"),
});

export type OpenAIOAuthConnectionMetadataType = z.infer<
  typeof OpenAIOAuthConnectionMetadataSchema
>;

export class OpenAIOAuthProvider implements BaseOAuthStrategyProvider {
  provider: OAuthProvider = "openai";

  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    // For OpenAI, we return a URL to the frontend finalize page
    // which will handle the connection and communicate with the parent window
    return `/oauth/${this.provider}/finalize?connection_id=${connection.connection_id}&code=direct&state=${connection.connection_id}`;
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return (
      getStringFromQuery(query, "connection_id") ||
      getStringFromQuery(query, "state")
    );
  }

  isExtraConfigValid(
    extraConfig: ExtraConfigType,
    useCase: OAuthUseCase
  ): extraConfig is OpenAIOAuthConnectionMetadataType {
    if (useCase !== "platform_actions") {
      return false;
    }
    return OpenAIOAuthConnectionMetadataSchema.safeParse(extraConfig).success;
  }
}
