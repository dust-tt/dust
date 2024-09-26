import { LoggerInterface } from "../../shared/logger";
import { Result } from "../../shared/result";
import {
  ConnectionCredentials,
  CredentialsProvider,
  OauthAPIPostCredentialsResponse,
} from "../lib";
import { OAuthAPI, OAuthAPIError } from "../oauth_api";

export async function postConnectionCredentials({
  config,
  logger,
  provider,
  workspaceId,
  userId,
  credentials,
}: {
  config: { url: string; apiKey: string | null };
  logger: LoggerInterface;
  provider: CredentialsProvider;
  workspaceId: string;
  userId: string;
  credentials: ConnectionCredentials;
}): Promise<Result<OauthAPIPostCredentialsResponse, OAuthAPIError>> {
  const res = await new OAuthAPI(config, logger).postCredentials({
    provider,
    workspaceId,
    userId,
    credentials,
  });

  if (res.isErr()) {
    return res;
  }

  return res;
}
