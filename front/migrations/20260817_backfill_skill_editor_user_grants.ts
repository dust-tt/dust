import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { SKILL_STATUSES } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";

// Backfill: give every current member of a skill's legacy editor group the equivalent per-user
// grant (`editor` on `skill:<id>`), which `grantToUser` holds in one regular_auto group per skill.
// The skill mutation paths dual-write both sides from now on; this catches the existing editors.
// Idempotent: grantToUser is find-or-create on both the group and the membership.
async function backfillWorkspaceSkillEditorUserGrants(
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

  // Every status: archived and suggested skills keep their editors, so their grants must be
  // written too (an archived skill can be restored).
  const skills = await SkillResource.listByWorkspace(auth, {
    status: [...SKILL_STATUSES],
    onlyCustom: true,
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });

  // Sequential: a one-off with several queries per editor, so keep the load predictable. (The
  // per-tuple advisory lock `grantToUser` takes is per skill, so parallel skills would not contend
  // on it — it is not the reason.)
  for (const skill of skills) {
    const editors = await skill.listEditors(auth);
    if (!editors || editors.length === 0) {
      continue;
    }

    if (!execute) {
      logger.info(
        {
          workspaceId: workspace.sId,
          skillId: skill.sId,
          skillStatus: skill.status,
          editorCount: editors.length,
        },
        "Dry-run: would grant skill editors their per-user grant"
      );
      continue;
    }

    for (const editor of editors) {
      const result = await GroupPermissionResource.grantToUser(auth, {
        user: editor.toJSON(),
        grantType: "editor",
        resourceType: "skill",
        resourceId: skill.id,
      });
      if (result.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            skillId: skill.sId,
            userId: editor.sId,
            error: result.error.message,
          },
          "Failed to grant a skill editor their per-user grant"
        );
      }
    }

    // The editor list was read before the writes, so an edit in between would leave the grants
    // stale (a removed editor keeps a grant nobody revokes). Re-read and report: the reconcile
    // query is the source of truth, this just points at the skills to look at.
    const editorsAfter = (await skill.listEditors(auth)) ?? [];
    const grantedIds = new Set(editors.map((editor) => editor.sId));
    const currentIds = new Set(editorsAfter.map((editor) => editor.sId));
    const addedWhileRunning = editorsAfter
      .filter((editor) => !grantedIds.has(editor.sId))
      .map((editor) => editor.sId);
    const removedWhileRunning = editors
      .filter((editor) => !currentIds.has(editor.sId))
      .map((editor) => editor.sId);

    if (addedWhileRunning.length > 0 || removedWhileRunning.length > 0) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          skillId: skill.sId,
          skillModelId: skill.id,
          addedWhileRunning,
          removedWhileRunning,
        },
        "Skill editors changed while backfilling: grants may be stale, reconcile this skill"
      );
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        skillId: skill.sId,
        skillStatus: skill.status,
        editorCount: editors.length,
      },
      "Granted skill editors their per-user grant"
    );
  }
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting skill editor user-grant backfill");

    if (wId) {
      const ws = await WorkspaceResource.fetchById(wId);
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await backfillWorkspaceSkillEditorUserGrants(
        execute,
        logger,
        renderLightWorkspaceType({ workspace: ws })
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillWorkspaceSkillEditorUserGrants(
            execute,
            logger,
            workspace
          );
        },
        { concurrency: 4 }
      );
    }

    logger.info("Skill editor user-grant backfill completed");
  }
);
