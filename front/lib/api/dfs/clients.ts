import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DfsClient } from "@app/lib/dfs/client";
import { DfsGrpcTransport } from "@app/lib/dfs/grpc_transport";
import { DfsTenantResource } from "@app/lib/resources/dfs_tenant_resource";
import { cacheWithRedisResult } from "@app/lib/utils/cache";
import { DfsTenantError } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// Tenant keys are cached so that sessions can be created without an oauth round trip each time.
const TENANT_KEY_CACHE_TTL_MS = 10 * 60 * 1000;

/** Splits a `DFS_API_URL` URL into a gRPC `host:port` endpoint and whether to use TLS. */
export function parseDfsApiUrl(url: string): {
  endpoint: string;
  useTls: boolean;
} {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid DFS_API_URL protocol: ${parsed.protocol}`);
  }
  const useTls = parsed.protocol === "https:";
  const port = parsed.port || (useTls ? "443" : "80");
  return { endpoint: `${parsed.hostname}:${port}`, useTls };
}

let transport: DfsGrpcTransport | null = null;

/**
 * @cc [owner:fabiencelier,label:performance] one-dfs-channel-per-process
 * Every dfs client created in a process MUST share the same `DfsGrpcTransport` (one gRPC channel),
 * created on first use and never closed.
 */
function getDfsTransport(): DfsGrpcTransport {
  if (!transport) {
    transport = new DfsGrpcTransport(
      parseDfsApiUrl(config.getDfsAPIConfig().url)
    );
  }
  return transport;
}

/** A client authenticated with the dfs server key, which can only create tenants. */
export function getDfsServerClient(): DfsClient {
  return new DfsClient(getDfsTransport(), config.getDfsServerKey());
}

async function fetchTenantKey(
  auth: Authenticator
): Promise<Result<string, DfsTenantError>> {
  const tenant = await DfsTenantResource.fetchByWorkspace(auth);
  if (!tenant) {
    return new Err(
      new DfsTenantError("tenant_not_found", "The workspace has no dfs tenant.")
    );
  }
  return tenant.getTenantKey(auth);
}

const fetchTenantKeyCached = cacheWithRedisResult(
  fetchTenantKey,
  (auth: Authenticator) => auth.getNonNullableWorkspace().sId,
  {
    ttlMs: TENANT_KEY_CACHE_TTL_MS,
    useDistributedLock: true,
    skipIfLocked: true,
    cacheNullValues: false,
  }
);

/**
 * A client authenticated with the tenant key of the authenticated workspace, to create sessions
 * and manage grants. Fails if the workspace has no dfs tenant.
 */
export async function getDfsTenantClient(
  auth: Authenticator
): Promise<Result<DfsClient, DfsTenantError>> {
  const cached = await fetchTenantKeyCached(auth);
  if (cached.isErr()) {
    return cached;
  }
  let tenantKey = cached.value;
  if (tenantKey === null) {
    // Another process is loading the key: read it directly instead of waiting.
    const direct = await fetchTenantKey(auth);
    if (direct.isErr()) {
      return direct;
    }
    tenantKey = direct.value;
  }
  return new Ok(new DfsClient(getDfsTransport(), tenantKey));
}
