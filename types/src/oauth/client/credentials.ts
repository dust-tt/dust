import { LoggerInterface } from "../../shared/logger";
import { Result } from "../../shared/result";
import {
  ApiKeyCredentials,
  ConnectionCredentials,
  CredentialsProvider,
  OauthAPIGetCredentialsResponse,
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
  credentials: ConnectionCredentials | ApiKeyCredentials;
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
