import type { LoggerInterface, Result } from "@dust-tt/client";

import type { OauthAPIGetCredentialsResponse } from "../lib";
import type { OAuthAPIError } from "../oauth_api";
import { OAuthAPI } from "../oauth_api";

export async function getConnectionCredentials({
  config,
  logger,
  credentialsId,
}: {
  config: { url: string; apiKey: string | null };
  logger: LoggerInterface;
  credentialsId: string;
}): Promise<Result<OauthAPIGetCredentialsResponse, OAuthAPIError>> {
  const res = await new OAuthAPI(config, logger).getCredentials({
    credentialsId,
  });

  if (res.isErr()) {
    return res;
  }

  return res;
}
