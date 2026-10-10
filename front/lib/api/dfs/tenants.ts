import type { Authenticator } from "@app/lib/auth";
import type { DfsClient } from "@app/lib/dfs/client";
import { DfsTenantResource } from "@app/lib/resources/dfs_tenant_resource";
import logger from "@app/logger/logger";
import type { DfsGrant } from "@app/types/dfs";
import { DfsError } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";

/**
 * Creates the dfs tenant of the authenticated workspace and stores its key and root ID. `serverClient`
 * MUST be authenticated with the dfs server key.
 */
/**
 * @cc [owner:fabiencelier,label:backend;security] one-tenant-per-workspace
 * The tenant ID MUST be the workspace sId. A workspace that already has a stored tenant MUST get
 * `already_exists` without calling dfs. When dfs reports the tenant as existing although no key is
 * stored, the call MUST fail with `already_exists`: the key cannot be recovered.
 */
export async function createDfsTenant(
  auth: Authenticator,
  {
    serverClient,
    rootGrants = [],
  }: { serverClient: DfsClient; rootGrants?: DfsGrant[] }
): Promise<Result<DfsTenantResource, Error>> {
  const tenantId = auth.getNonNullableWorkspace().sId;
  if (await DfsTenantResource.fetchByWorkspace(auth)) {
    return new Err(
      new DfsError("already_exists", "The workspace already has a dfs tenant.")
    );
  }

  const created = await serverClient.createTenant({ tenantId, rootGrants });
  if (created.isErr()) {
    if (created.error.code === "already_exists") {
      return new Err(
        new DfsError(
          "already_exists",
          `Dfs tenant ${tenantId} exists but its key is not stored and cannot be recovered.`
        )
      );
    }
    return created;
  }
  if (created.value.tenantId !== tenantId) {
    return new Err(
      new DfsError("invalid_response", "Dfs created another tenant.")
    );
  }

  // If storing fails, the only copy of the key is lost: the tenant exists in dfs but can no longer
  // be administered.
  let stored: Result<DfsTenantResource, Error>;
  try {
    stored = await DfsTenantResource.makeNew(auth, {
      tenantKey: created.value.tenantKey,
      rootId: created.value.rootId,
    });
  } catch (err) {
    logger.error(
      { workspaceId: tenantId, err },
      "Dfs tenant created but its key could not be stored."
    );
    throw err;
  }
  if (stored.isErr()) {
    logger.error(
      { workspaceId: tenantId, err: stored.error },
      "Dfs tenant created but its key could not be stored."
    );
  }
  return stored;
}
