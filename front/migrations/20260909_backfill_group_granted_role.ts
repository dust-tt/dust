import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { GroupGrantableRole } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";

// The role a group grants used to be inferred from these hardcoded provisioned
// group names. Roles are now driven by the per-group `grantedRole` column, so we
// backfill the mapping on any workspace that still has those legacy groups.
// `setGrantedRole` is idempotent and re-syncs member roles (a no-op when they
// already match).
const LEGACY_ROLE_GROUP_NAMES: Record<string, GroupGrantableRole> = {
  "dust-admins": "admin",
  "dust-managers": "manager",
};

async function backfillWorkspaceGrantedRoles(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const legacyGroups = await GroupModel.findAll({
    where: {
      workspaceId: workspace.id,
      kind: "provisioned",
      name: Object.keys(LEGACY_ROLE_GROUP_NAMES),
    },
  });
  if (legacyGroups.length === 0) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const groups = await GroupResource.dangerouslyFetchByModelIds(
    auth,
    legacyGroups.map((g) => g.id)
  );

  for (const group of groups) {
    const grantedRole = LEGACY_ROLE_GROUP_NAMES[group.name];
    if (!grantedRole || group.grantedRole === grantedRole) {
      continue;
    }

    const context = {
      workspaceId: workspace.sId,
      groupId: group.sId,
      groupName: group.name,
      grantedRole,
    };

    if (!execute) {
      logger.info(context, "Dry run: would map legacy group to role");
      continue;
    }

    const res = await group.setGrantedRole(auth, grantedRole);
    if (res.isErr()) {
      logger.error(
        { ...context, error: res.error },
        "Failed to map group role"
      );
      continue;
    }

    logger.info(context, "Mapped legacy group to role");
  }
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting group grantedRole backfill");

    await runOnAllWorkspaces(
      async (workspace) => {
        await backfillWorkspaceGrantedRoles(execute, logger, workspace);
      },
      { concurrency: 4, wId }
    );

    logger.info("Finished group grantedRole backfill");
  }
);
