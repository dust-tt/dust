import { isWorkspaceRelocationDone } from "@app/lib/api/workspace";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Backfill WorkOS organizations for workspaces that are missing one.
 *
 * Historically we only created a WorkOS organization once a workspace reached
 * an "upgraded" plan or hit the domains flow. We now create one for every
 * workspace at creation time; this script covers the gap for existing rows.
 *
 * Skips relocated stubs (`relocation-done`) so we do not create a new org in
 * the source cell for a workspace that already lives elsewhere.
 *
 * Based on `20250602_migrate_organizations.ts`, but creates for all missing
 * orgs rather than only domain/paid workspaces.
 *
 * Usage (from `front/`):
 *   npx tsx -r tsconfig-paths/register migrations/20260902_backfill_workos_organizations.ts
 *   npx tsx -r tsconfig-paths/register migrations/20260902_backfill_workos_organizations.ts --execute
 *   npx tsx -r tsconfig-paths/register migrations/20260902_backfill_workos_organizations.ts --wId=xxx --execute
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
    logger.info(
      { execute, wId, fromWorkspaceId, concurrency },
      "Starting WorkOS organization backfill"
    );

    const stats = {
      scanned: 0,
      skippedHasOrg: 0,
      skippedRelocationDone: 0,
      created: 0,
      errors: 0,
    };

    await runOnAllWorkspaces(
      async (workspace) => {
        stats.scanned++;
        await backfillWorkspaceWorkOSOrganization({
          workspace,
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

    logger.info({ ...stats }, "WorkOS organization backfill completed");
  }
);

async function backfillWorkspaceWorkOSOrganization({
  workspace,
  execute,
  logger,
  stats,
}: {
  workspace: LightWorkspaceType;
  execute: boolean;
  logger: Logger;
  stats: {
    scanned: number;
    skippedHasOrg: number;
    skippedRelocationDone: number;
    created: number;
    errors: number;
  };
}): Promise<void> {
  const workspaceLogger = logger.child({
    workspaceId: workspace.sId,
    workspaceModelId: workspace.id,
  });

  if (isWorkspaceRelocationDone(workspace)) {
    stats.skippedRelocationDone++;
    workspaceLogger.info(
      { maintenance: workspace.metadata?.maintenance },
      "Skipping relocated workspace stub (relocation-done)"
    );
    return;
  }

  if (workspace.workOSOrganizationId) {
    stats.skippedHasOrg++;
    return;
  }

  const domainRow = await WorkspaceHasDomainModel.findOne({
    where: {
      workspaceId: workspace.id,
    },
  });
  const domain = domainRow?.domain;

  workspaceLogger.info(
    { domain: domain ?? null, execute },
    "Will create WorkOS organization"
  );

  if (!execute) {
    stats.created++;
    return;
  }

  const orgRes = await getOrCreateWorkOSOrganization(
    workspace,
    domain ? { domain } : undefined
  );

  if (orgRes.isErr()) {
    stats.errors++;
    workspaceLogger.error(
      { error: orgRes.error.message },
      "Failed to create WorkOS organization"
    );
    return;
  }

  stats.created++;
  workspaceLogger.info(
    { organizationId: orgRes.value.id },
    "Created WorkOS organization"
  );
}
