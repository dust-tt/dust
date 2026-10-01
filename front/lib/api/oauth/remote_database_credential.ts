import apiConfig from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type {
  CredentialsProvider,
  OauthAPIGetCredentialsResponse,
} from "@app/types/oauth/lib";
import {
  BigQueryCredentialsWithLocationSchema,
  SnowflakeCredentialsSchema,
  SnowflakeKeyPairCredentialsSchema,
} from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type RemoteDatabaseCredentialUse =
  | "snowflake_keypair"
  | "snowflake"
  | "bigquery";

const PROVIDER_FOR_USE: Record<
  RemoteDatabaseCredentialUse,
  CredentialsProvider
> = {
  snowflake_keypair: "snowflake",
  snowflake: "snowflake",
  bigquery: "bigquery",
};

function contentMatchesUse(
  use: RemoteDatabaseCredentialUse,
  content: unknown
): boolean {
  switch (use) {
    case "snowflake_keypair":
      return SnowflakeKeyPairCredentialsSchema.safeParse(content).success;
    case "snowflake":
      return SnowflakeCredentialsSchema.safeParse(content).success;
    case "bigquery":
      return BigQueryCredentialsWithLocationSchema.safeParse(content).success;
    default:
      return assertNever(use);
  }
}

/**
 * @cc [owner:frankaloia,label:security] remote-database-credential-allowed-use
 * The credential MUST be rejected unless `metadata.workspace_id` equals `workspaceId`,
 * `provider` is the provider for one entry of `allowedUses`, and `content` parses as
 * that use. A fetch failure that is not a definitive oauth rejection MUST be
 * `unavailable`. Callers MUST run this before using the credential to log in or to
 * attach a remote table.
 */
export async function loadAllowedRemoteDatabaseCredential({
  credentialsId,
  workspaceId,
  allowedUses,
}: {
  credentialsId: string;
  workspaceId: string;
  allowedUses: readonly RemoteDatabaseCredentialUse[];
}): Promise<
  Result<
    OauthAPIGetCredentialsResponse["credential"],
    "unavailable" | "rejected"
  >
> {
  const oauthApi = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);
  const credentialRes = await oauthApi.getCredentials({ credentialsId });
  if (credentialRes.isErr()) {
    if (
      credentialRes.error.code === "unexpected_network_error" ||
      credentialRes.error.code === "unexpected_response_format" ||
      credentialRes.error.code === "unexpected_error_format"
    ) {
      return new Err("unavailable");
    }
    return new Err("rejected");
  }

  const credential = credentialRes.value.credential;
  if (credential.metadata.workspace_id !== workspaceId) {
    return new Err("rejected");
  }

  const allowed = allowedUses.some(
    (use) =>
      credential.provider === PROVIDER_FOR_USE[use] &&
      contentMatchesUse(use, credential.content)
  );
  if (!allowed) {
    return new Err("rejected");
  }

  return new Ok(credential);
}
