import config from "@app/lib/api/config";
import {
  createEdgeeGatewayApiKey,
  deleteEdgeeGatewayApiKey,
} from "@app/lib/api/edgee/console_client";
import type { Authenticator } from "@app/lib/auth";
import { EdgeeConnectionResource } from "@app/lib/resources/edgee_connection_resource";
import {
  GatewayApiKeyConflictError,
  GatewayApiKeyResource,
} from "@app/lib/resources/gateway_api_key_resource";
import { cacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import { EdgeeGatewayKeyCredentialsSchema } from "@app/types/gateways/edgee";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const EDGEE_GATEWAY = "edgee";
const GATEWAY_KEY_CACHE_TTL_MS = 10 * 60 * 1000;

type MintedEdgeeKey = {
  apiKey: string;
  apiKeyId: string;
  credentialId: string;
};

async function readGatewayKeyUncached(
  credentialId: string
): Promise<string | null> {
  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const res = await oauthApi.getCredentials({ credentialsId: credentialId });
  if (res.isErr()) {
    return null;
  }
  const parsed = EdgeeGatewayKeyCredentialsSchema.safeParse(
    res.value.credential.content
  );
  return parsed.success ? parsed.data.api_key : null;
}

// Credential ids are immutable, so a cached secret can only go stale when the row is deleted.
const readGatewayKey = cacheWithRedis(
  readGatewayKeyUncached,
  (credentialId: string) => `edgee_gateway_key:${credentialId}`,
  { cacheNullValues: false, ttlMs: GATEWAY_KEY_CACHE_TTL_MS }
);

async function readStoredKey(
  stored: GatewayApiKeyResource
): Promise<Result<string, Error>> {
  const apiKey = await readGatewayKey(stored.credentialId);
  return apiKey
    ? new Ok(apiKey)
    : new Err(new Error("Failed to read the stored Edgee gateway key."));
}

async function revokeMintedKey(
  connection: EdgeeConnectionResource,
  minted: MintedEdgeeKey
): Promise<void> {
  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  await oauthApi.deleteCredentials({ credentialsId: minted.credentialId });

  const revokeRes = await deleteEdgeeGatewayApiKey({
    adminToken: connection.adminToken,
    organizationId: connection.organizationId,
    apiKeyId: minted.apiKeyId,
  });
  if (revokeRes.isErr()) {
    logger.warn(
      { apiKeyId: minted.apiKeyId, error: revokeRes.error },
      "Failed to revoke an unused Edgee gateway key."
    );
  }
}

async function mintEdgeeKey(
  auth: Authenticator,
  connection: EdgeeConnectionResource
): Promise<Result<MintedEdgeeKey, Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();
  const holder = user?.sId ?? "workspace";

  const keyRes = await createEdgeeGatewayApiKey({
    adminToken: connection.adminToken,
    organizationId: connection.organizationId,
    name: `dust:${workspace.sId}:${holder}`,
    email: user?.email ?? null,
  });
  if (keyRes.isErr()) {
    return keyRes;
  }

  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const oauthRes = await oauthApi.postCredentials({
    provider: "edgee_gateway_key",
    workspaceId: workspace.sId,
    userId: holder,
    credentials: {
      api_key: keyRes.value.apiKey,
      api_key_id: keyRes.value.apiKeyId,
    },
  });
  if (oauthRes.isErr()) {
    await deleteEdgeeGatewayApiKey({
      adminToken: connection.adminToken,
      organizationId: connection.organizationId,
      apiKeyId: keyRes.value.apiKeyId,
    });
    return new Err(
      new Error(
        `Failed to store the Edgee gateway key: ${oauthRes.error.message}`
      )
    );
  }

  return new Ok({
    ...keyRes.value,
    credentialId: oauthRes.value.credential.credential_id,
  });
}

async function mintAndStoreEdgeeKey(
  auth: Authenticator
): Promise<Result<string, Error>> {
  const connection = await EdgeeConnectionResource.fetch(auth);
  if (!connection) {
    return new Err(
      new Error("Edgee is not configured for this workspace yet.")
    );
  }

  const mintRes = await mintEdgeeKey(auth, connection);
  if (mintRes.isErr()) {
    return mintRes;
  }
  const minted = mintRes.value;

  const storeRes = await GatewayApiKeyResource.makeNew(auth, {
    gateway: EDGEE_GATEWAY,
    credentialId: minted.credentialId,
    gatewayKeyId: minted.apiKeyId,
  });
  if (storeRes.isOk()) {
    return new Ok(minted.apiKey);
  }

  // Never leave a minted key behind: either storing failed, or a concurrent call stored the
  // caller's key first and that one wins.
  await revokeMintedKey(connection, minted);
  if (!(storeRes.error instanceof GatewayApiKeyConflictError)) {
    return storeRes;
  }

  const winner = await GatewayApiKeyResource.fetchForCaller(
    auth,
    EDGEE_GATEWAY
  );
  return winner
    ? readStoredKey(winner)
    : new Err(new Error("The concurrently stored Edgee gateway key vanished."));
}

/**
 * @cc [owner:pmilliotte,label:security;product] edgee-key-per-caller
 * Returns the Edgee gateway key of the caller (`gateway-key-owned-by-caller`), minting and storing
 * it on first use. Public API keys (key auth without a user, other than a system key) MUST get an
 * error. At most one key is kept per caller: a key minted but not stored MUST be revoked on Edgee.
 */
export async function getOrCreateEdgeeGatewayKey(
  auth: Authenticator
): Promise<Result<string, Error>> {
  const isPublicApiKey = auth.isKey() && !auth.isSystemKey() && !auth.user();
  if (isPublicApiKey) {
    return new Err(
      new Error("API keys cannot call models on a workspace routed through Edgee.")
    );
  }

  const stored = await GatewayApiKeyResource.fetchForCaller(
    auth,
    EDGEE_GATEWAY
  );
  return stored ? readStoredKey(stored) : mintAndStoreEdgeeKey(auth);
}
