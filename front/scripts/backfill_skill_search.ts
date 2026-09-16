import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

async function backfillWorkspace(
  workspace: LightWorkspaceType,
  {
    concurrency,
    execute,
    logger,
  }: { concurrency: number; execute: boolean; logger: Logger }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const skills = await SkillResource.listByWorkspace(auth, {
    permissionFiltering: "redact_unreadable",
    status: ["active", "archived"],
    onlyCustom: true,
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });
  if (execute) {
    await concurrentExecutor(
      skills,
      (skill) => SkillResource.launchSearchIndexation(auth, [skill.sId]),
      { concurrency }
    );
  }
  logger.info(
    {
      execute,
      workspaceId: workspace.sId,
      candidates: skills.length,
      attempted: execute ? skills.length : 0,
    },
    "[SkillSearchBackfill] Workspace complete"
  );
}

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to backfill (omit to run on all workspaces).",
    },
    fromWorkspaceModelId: {
      type: "number",
      describe: "Resume from this workspace model ID.",
    },
    concurrency: {
      type: "number",
      default: 10,
      describe: "Concurrent Temporal workflow launches.",
    },
  },
  async ({ wId, fromWorkspaceModelId, concurrency, execute }, logger) => {
    await runOnAllWorkspaces(
      (workspace) =>
        backfillWorkspace(workspace, { concurrency, execute, logger }),
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );
  }
);
