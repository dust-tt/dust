import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";
import { Op, literal } from "sequelize";

type BackfillStats = {
  scanned: number;
  created: number;
  membersToSync: number;
  membersSkippedNoWorkOSUserId: number;
  errors: number;
};

/**
 * Backfill WorkOS organizations for workspaces that are missing one.
 *
 * Historically we only created a WorkOS organization once a workspace reached
 * an "upgraded" plan or hit the domains flow. We now create one for every
 * workspace at creation time; this script covers the gap for existing rows.
 *
 * `getOrCreateWorkOSOrganization` also syncs active members (with a
 * `workOSUserId`) into the WorkOS organization when the workspace is first
 * linked. Users without a WorkOS user id are skipped until they authenticate
 * through WorkOS; use `20250728_backfill_membership_workos.ts` for a fuller
 * membership reconcile if needed later.
 *
 * Filters early at SQL level: workspaces that already have a WorkOS
 * organization, and relocated stubs (`relocation-done`), are excluded from the
 * scan so we do not create a new org in the source cell for a workspace that
 * already lives elsewhere.
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

    const results: Omit<BackfillStats, "scanned">[] = [];

    await runOnAllWorkspaces(
      async (workspace) => {
        results.push(
          await backfillWorkspaceWorkOSOrganization({
            workspace,
            execute,
            logger,
          })
        );
      },
      {
        concurrency,
        wId,
        fromWorkspaceId,
        where: {
          [Op.and]: [
            { workOSOrganizationId: { [Op.is]: null } },
            // IS DISTINCT FROM keeps NULL metadata (and missing keys).
            literal(
              `(metadata->>'maintenance') IS DISTINCT FROM 'relocation-done'`
            ),
          ],
        },
      }
    );

    const stats: BackfillStats = {
      scanned: results.length,
      created: results.reduce((sum, r) => sum + r.created, 0),
      membersToSync: results.reduce((sum, r) => sum + r.membersToSync, 0),
      membersSkippedNoWorkOSUserId: results.reduce(
        (sum, r) => sum + r.membersSkippedNoWorkOSUserId,
        0
      ),
      errors: results.reduce((sum, r) => sum + r.errors, 0),
    };

    logger.info({ ...stats }, "WorkOS organization backfill completed");
  }
);

async function backfillWorkspaceWorkOSOrganization({
  workspace,
  execute,
  logger,
}: {
  workspace: LightWorkspaceType;
  execute: boolean;
  logger: Logger;
}): Promise<Omit<BackfillStats, "scanned">> {
  const workspaceLogger = logger.child({
    workspaceId: workspace.sId,
    workspaceModelId: workspace.id,
  });

  const domainRow = await WorkspaceHasDomainModel.findOne({
    where: {
      workspaceId: workspace.id,
    },
  });
  const domain = domainRow?.domain;

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const membersWithWorkOSUserId = memberships.filter(
    (m) => m.user?.workOSUserId
  ).length;
  const membersWithoutWorkOSUserId =
    memberships.length - membersWithWorkOSUserId;

  workspaceLogger.info(
    {
      domain: domain ?? null,
      execute,
      activeMembers: memberships.length,
      membersWithWorkOSUserId,
      membersWithoutWorkOSUserId,
    },
    "Will create WorkOS organization and sync active members"
  );

  if (!execute) {
    return {
      created: 1,
      membersToSync: membersWithWorkOSUserId,
      membersSkippedNoWorkOSUserId: membersWithoutWorkOSUserId,
      errors: 0,
    };
  }

  const orgRes = await getOrCreateWorkOSOrganization(
    workspace,
    domain ? { domain } : undefined
  );

  if (orgRes.isErr()) {
    workspaceLogger.error(
      { error: orgRes.error.message },
      "Failed to create WorkOS organization"
    );
    return {
      created: 0,
      membersToSync: membersWithWorkOSUserId,
      membersSkippedNoWorkOSUserId: membersWithoutWorkOSUserId,
      errors: 1,
    };
  }

  workspaceLogger.info(
    {
      organizationId: orgRes.value.id,
      membersWithWorkOSUserId,
      membersWithoutWorkOSUserId,
    },
    "Created WorkOS organization and synced active members"
  );

  return {
    created: 1,
    membersToSync: membersWithWorkOSUserId,
    membersSkippedNoWorkOSUserId: membersWithoutWorkOSUserId,
    errors: 0,
  };
}
