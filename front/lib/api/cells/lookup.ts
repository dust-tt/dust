import { config } from "@app/lib/api/cells/config";
import { handleLookupWorkspace } from "@app/lib/api/regions/lookup";
import { getWorkOS } from "@app/lib/api/workos/client";
import { cacheWithRedis, invalidateCacheWithRedis } from "@app/lib/utils/cache";
import type { CellType } from "@app/types/cell";
import { isCellType } from "@app/types/cell";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const WORKSPACE_CELL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours.

function isWorkOSNotFoundEntityError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 404 &&
    "code" in error &&
    error.code === "entity_not_found"
  );
}

/**
 * Resolves a workspace's cell from WorkOS organization metadata.
 * Returns null when WorkOS cannot answer — callers should fall back to peer-cell
 * lookup in those cases:
 * - No WorkOS organization (common for free / never-upgraded workspaces).
 * - Organization exists but `metadata.cell` is missing or invalid (pre-backfill).
 */
async function lookupWorkspaceCellFromWorkOS(
  wId: string
): Promise<CellType | null> {
  try {
    const organization =
      await getWorkOS().organizations.getOrganizationByExternalId(wId);

    const cell = organization.metadata.cell;
    if (!cell || !isCellType(cell)) {
      return null;
    }

    return cell;
  } catch (error) {
    if (isWorkOSNotFoundEntityError(error)) {
      return null;
    }

    throw error;
  }
}

async function _lookupWorkspaceCellUncached(
  wId: string
): Promise<CellType | null> {
  const localLookup = await handleLookupWorkspace({ workspace: wId });
  if (localLookup.workspace) {
    return config.getCurrentCell().name;
  }

  const workOSCell = await lookupWorkspaceCellFromWorkOS(wId);
  if (workOSCell) {
    return workOSCell;
  }

  throw new Error("Workspace not found in WorkOS.");
}

const _lookupWorkspaceCellCached = cacheWithRedis(
  _lookupWorkspaceCellUncached,
  (wId) => `workspace-cell:${wId}`,
  { ttlMs: WORKSPACE_CELL_CACHE_TTL_MS }
);

const _invalidateWorkspaceCellCache = invalidateCacheWithRedis(
  _lookupWorkspaceCellUncached,
  (wId) => `workspace-cell:${wId}`
);

export async function invalidateWorkspaceCellCache(wId: string): Promise<void> {
  await _invalidateWorkspaceCellCache(wId);
}

export async function lookupWorkspaceCell(
  wId: string
): Promise<Result<CellType | null, Error>> {
  try {
    const cell = await _lookupWorkspaceCellCached(wId);
    return new Ok(cell);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
