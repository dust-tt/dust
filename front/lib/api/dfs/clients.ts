import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DfsClient } from "@app/lib/dfs/client";
import { DfsGrpcTransport } from "@app/lib/dfs/grpc_transport";
import { DfsTenantResource } from "@app/lib/resources/dfs_tenant_resource";
import { DfsTenantError } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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

/** A client authenticated with the dfs master key, which can only create tenants. */
export function getDfsServerClient(): DfsClient {
  return new DfsClient(getDfsTransport(), config.getDfsMasterKey());
}

/**
 * A client authenticated with the tenant key of the authenticated workspace, to create sessions
 * and manage grants. Fails if the workspace has no dfs tenant.
 */
export async function getDfsTenantClient(
  auth: Authenticator
): Promise<Result<DfsClient, DfsTenantError>> {
  const tenant = await DfsTenantResource.fetchByWorkspace(auth);
  if (!tenant) {
    return new Err(
      new DfsTenantError("tenant_not_found", "The workspace has no dfs tenant.")
    );
  }
  const tenantKey = await tenant.getTenantKey(auth);
  if (tenantKey.isErr()) {
    return tenantKey;
  }
  return new Ok(new DfsClient(getDfsTransport(), tenantKey.value));
}
