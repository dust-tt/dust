import { config as cellConfig } from "@app/lib/api/cells/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import { getWorkOSOrganization } from "@app/lib/api/workos/organization_primitives";
import { isWorkspaceRelocationDone } from "@app/lib/api/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { CellType } from "@app/types/cell";
import { isCellType } from "@app/types/cell";
import type { RegionType } from "@app/types/region";
import { isRegionType } from "@app/types/region";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Backfill WorkOS organization metadata with `cell` (and keep `region` in sync).
 *
 * Must be run once per cell. WorkOS orgs are global, so relocated workspaces are
 * critical:
 * - Source cell still has a `relocation-done` stub → SKIP (WorkOS already points
 *   at the destination; writing current cell would clobber it).
 * - Destination cell has the live workspace → update metadata to current cell.
 * - If WorkOS already has a region/cell for another deployment → SKIP with a
 *   warning (belongs elsewhere or is inconsistent).
 */
makeScript(
  {
    wId: {
      describe: "Optional workspace sId to backfill a single workspace",
      type: "string",
      required: false,
    },
    fromWorkspaceId: {
      describe: "Optional numeric workspace model id to resume from",
      type: "number",
      required: false,
    },
    concurrency: {
      describe: "Number of workspaces to process in parallel",
      type: "number",
      default: 5,
    },
  },
  async ({ execute, wId, fromWorkspaceId, concurrency }, logger) => {
    const currentCell = cellConfig.getCurrentCell();
    const targetCell: CellType = currentCell.name;
    const targetRegion: RegionType = currentCell.region;

    logger.info(
      { targetCell, targetRegion, execute, wId, fromWorkspaceId },
      "Starting WorkOS organization cell metadata backfill"
    );

    const stats = {
      scanned: 0,
      skippedNoOrg: 0,
      skippedRelocationDone: 0,
      skippedAlreadyCorrect: 0,
      skippedOtherDeployment: 0,
      updated: 0,
      errors: 0,
    };

    await runOnAllWorkspaces(
      async (workspace) => {
        stats.scanned++;
        await backfillWorkspaceWorkOSMetadata({
          workspace,
          targetCell,
          targetRegion,
          execute,
          logger,
          stats,
        });
      },
      {
        concurrency,
        wId,
        fromWorkspaceId,
      }
    );

    logger.info({ ...stats, targetCell, targetRegion }, "Backfill completed");
  }
);

async function backfillWorkspaceWorkOSMetadata({
  workspace,
  targetCell,
  targetRegion,
  execute,
  logger,
  stats,
}: {
  workspace: LightWorkspaceType;
  targetCell: CellType;
  targetRegion: RegionType;
  execute: boolean;
  logger: Logger;
  stats: {
    scanned: number;
    skippedNoOrg: number;
    skippedRelocationDone: number;
    skippedAlreadyCorrect: number;
    skippedOtherDeployment: number;
    updated: number;
    errors: number;
  };
}): Promise<void> {
  const workspaceLogger = logger.child({
    workspaceId: workspace.sId,
    workspaceModelId: workspace.id,
  });

  // Relocated stubs in the source cell must never rewrite WorkOS metadata —
  // cutover already pointed the org at the destination.
  if (isWorkspaceRelocationDone(workspace)) {
    stats.skippedRelocationDone++;
    workspaceLogger.info(
      { maintenance: workspace.metadata?.maintenance },
      "Skipping relocated workspace stub (relocation-done)"
    );
    return;
  }

  if (!workspace.workOSOrganizationId) {
    stats.skippedNoOrg++;
    workspaceLogger.info("Skipping workspace without WorkOS organization id");
    return;
  }

  const organizationRes = await getWorkOSOrganization(workspace);
  if (organizationRes.isErr()) {
    stats.errors++;
    workspaceLogger.error(
      { error: organizationRes.error.message },
      "Failed to fetch WorkOS organization"
    );
    return;
  }

  const organization = organizationRes.value;
  if (!organization) {
    stats.skippedNoOrg++;
    workspaceLogger.warn(
      "Workspace has workOSOrganizationId but organization was not found in WorkOS"
    );
    return;
  }

  const existingCell = organization.metadata.cell;
  const existingRegion = organization.metadata.region;

  if (existingCell === targetCell && existingRegion === targetRegion) {
    stats.skippedAlreadyCorrect++;
    workspaceLogger.info(
      { existingCell, existingRegion },
      "WorkOS metadata already up to date"
    );
    return;
  }

  // If WorkOS already routes this org elsewhere, do not overwrite.
  // Relocated workspaces live here only as stubs (handled above); a live
  // workspace whose WorkOS region/cell points elsewhere is inconsistent.
  if (
    (isCellType(existingCell) && existingCell !== targetCell) ||
    (isRegionType(existingRegion) && existingRegion !== targetRegion)
  ) {
    stats.skippedOtherDeployment++;
    workspaceLogger.warn(
      {
        existingCell,
        existingRegion,
        targetCell,
        targetRegion,
      },
      "Skipping: WorkOS metadata points to another cell/region"
    );
    return;
  }

  workspaceLogger.info(
    {
      existingCell: existingCell ?? null,
      existingRegion: existingRegion ?? null,
      targetCell,
      targetRegion,
      execute,
    },
    "Will update WorkOS organization metadata"
  );

  if (!execute) {
    stats.updated++;
    return;
  }

  try {
    await getWorkOS().organizations.updateOrganization({
      organization: organization.id,
      metadata: {
        region: targetRegion,
        cell: targetCell,
      },
    });
    stats.updated++;
    workspaceLogger.info(
      { targetCell, targetRegion },
      "Updated WorkOS organization metadata"
    );
  } catch (error) {
    stats.errors++;
    workspaceLogger.error({ error }, "Failed to update WorkOS organization");
  }
}
