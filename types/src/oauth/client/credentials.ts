import { LoggerInterface } from "../../shared/logger";
import { Result } from "../../shared/result";
import { OauthAPIGetCredentialsResponse } from "../lib";
import { OAuthAPI, OAuthAPIError } from "../oauth_api";

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
