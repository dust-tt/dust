import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { SKILL_STATUSES } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";

// Backfill: give the workspace global group the `reader` grant on every existing skill, which is
// what `SkillResource.canRead` looks for. Skills created from now on get it at creation
// (`grantGlobalGroupAsReader`); this catches the ones created before.
//
// Must run before the read path starts filtering on the grant, or skills without it become
// invisible to everyone.
//
// Idempotent: `grantMany` is find-or-create per (group, grant type, resource).
async function backfillWorkspaceSkillGlobalReadGrants(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  // All groups: `listByWorkspace` filters on read access to the spaces a skill references, and
  // restricted spaces grant read through group membership only. The default single-group auth
  // silently skips those skills.
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
    dangerouslyRequestAllGroups: true,
  });

  const globalGroupRes = await GroupResource.fetchWorkspaceGlobalGroup(auth);
  if (globalGroupRes.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: globalGroupRes.error.message },
      "Failed to fetch the global group, skipping workspace"
    );
    return;
  }
  const globalGroup = globalGroupRes.value;

  // Every status: an archived or suggested skill is restored/accepted into a readable one, so it
  // needs the grant too.
  const skills = await SkillResource.listByWorkspace(auth, {
    status: [...SKILL_STATUSES],
    onlyCustom: true,
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });

  if (skills.length === 0) {
    return;
  }

  if (!execute) {
    logger.info(
      { workspaceId: workspace.sId, skillCount: skills.length },
      "Dry run: would grant the global group `reader` on the workspace skills"
    );
    return;
  }

  await GroupPermissionResource.grantMany(auth, {
    grants: skills.map((skill) => ({
      group: globalGroup,
      grantType: "reader" as const,
      resourceType: "skill" as const,
      resourceId: skill.id,
    })),
  });

  logger.info(
    { workspaceId: workspace.sId, skillCount: skills.length },
    "Granted the global group `reader` on the workspace skills"
  );
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting skill global read-grant backfill");

    if (wId) {
      const ws = await WorkspaceResource.fetchById(wId);
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await backfillWorkspaceSkillGlobalReadGrants(
        execute,
        logger,
        renderLightWorkspaceType({ workspace: ws })
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillWorkspaceSkillGlobalReadGrants(
            execute,
            logger,
            workspace
          );
        },
        { concurrency: 4 }
      );
    }

    logger.info("Skill global read-grant backfill completed");
  }
);
