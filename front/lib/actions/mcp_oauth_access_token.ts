import apiConfig from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import { shouldUseStaticIpProxy } from "@app/lib/api/workspace_has_domains";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import type { OAuthAPIError } from "@app/types/oauth/oauth_api";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { LoggerInterface } from "@app/types/shared/logger";
import type { Result } from "@app/types/shared/result";

const MCP_STATIC_IP_PROXY_FRESHNESS_TTL_MS = 5 * 60 * 1000; // 5 minutes.

const MCP_STATIC_IP_PROXY_LAST_CHECKED_MS = new Map<string, number>();

function shouldCheckMCPStaticIpProxyFreshness(
  connectionId: string,
  nowMs: number = Date.now()
): boolean {
  const lastCheckedMs = MCP_STATIC_IP_PROXY_LAST_CHECKED_MS.get(connectionId);

  return (
    lastCheckedMs === undefined ||
    nowMs - lastCheckedMs >= MCP_STATIC_IP_PROXY_FRESHNESS_TTL_MS
  );
}

function markMCPStaticIpProxyFreshnessChecked(
  connectionId: string,
  nowMs: number = Date.now()
): void {
  MCP_STATIC_IP_PROXY_LAST_CHECKED_MS.set(connectionId, nowMs);
}

export function resetMCPStaticIpProxyFreshnessCache(): void {
  MCP_STATIC_IP_PROXY_LAST_CHECKED_MS.clear();
}

export async function syncMCPStaticIpProxyMetadata(
  auth: Authenticator,
  {
    connectionId,
    localLogger = logger,
  }: {
    connectionId: string;
    localLogger?: LoggerInterface;
  }
): Promise<void> {
  if (!shouldCheckMCPStaticIpProxyFreshness(connectionId)) {
    return;
  }

  const oauthApi = new OAuthAPI(apiConfig.getOAuthAPIConfig(), localLogger);
  const metadataRes = await oauthApi.getConnectionMetadata({ connectionId });

  if (metadataRes.isErr()) {
    localLogger.warn(
      { error: metadataRes.error, connectionId },
      "Failed to fetch MCP OAuth connection metadata for static IP proxy sync"
    );
    return;
  }

  const metadata = metadataRes.value.connection.metadata;
  const desired = await shouldUseStaticIpProxy(auth, metadata.token_endpoint);
  const stored = metadata.use_static_ip_proxy === "true";

  if (stored === desired) {
    markMCPStaticIpProxyFreshnessChecked(connectionId);
    return;
  }

  const updateRes = await oauthApi.updateConnectionMetadata({
    connectionId,
    useStaticIpProxy: desired,
  });

  if (updateRes.isErr()) {
    // Do not mark fresh on a failed write, so the next call retries the PATCH rather than waiting
    // out the full TTL with the flag still stale.
    localLogger.warn(
      { error: updateRes.error, connectionId, desired },
      "Failed to sync MCP OAuth static IP proxy metadata"
    );
    return;
  }

  markMCPStaticIpProxyFreshnessChecked(connectionId);
}

export async function getMCPConnectionAccessToken(
  auth: Authenticator,
  {
    connectionId,
    forceRefresh = false,
    localLogger = logger,
  }: {
    connectionId: string;
    forceRefresh?: boolean;
    localLogger?: LoggerInterface;
  }
): Promise<
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
  await syncMCPStaticIpProxyMetadata(auth, { connectionId, localLogger });

  return getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger: localLogger,
    connectionId,
    forceRefresh,
  });
}
