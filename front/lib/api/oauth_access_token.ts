import type { OAuthConnectionType } from "@app/types/oauth/lib";
import type { OAuthAPIError } from "@app/types/oauth/oauth_api";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { LoggerInterface } from "@app/types/shared/logger";
import type { Result } from "@app/types/shared/result";

export async function getOAuthConnectionAccessToken({
  config,
  logger,
  connectionId,
}: {
  config: { url: string; apiKey: string | null };
  logger: LoggerInterface;
  connectionId: string;
}): Promise<
  Result<
    {
      connection: OAuthConnectionType;
      access_token: string;
      access_token_expiry: number | null;
      scrubbed_raw_json: unknown;
    },
    OAuthAPIError
  >
> {
  return new OAuthAPI(config, logger).getAccessToken({
    connectionId,
  });
}
