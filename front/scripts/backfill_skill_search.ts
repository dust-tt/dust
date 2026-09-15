import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";

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
    status: ["active", "archived"],
    onlyCustom: true,
    permissionFiltering: "dangerously_skip",
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });
  const results = execute
    ? await concurrentExecutor(
        skills,
        async (skill) => {
          const result = await launchIndexSkillSearchWorkflow({
            workspaceId: workspace.sId,
            skillId: skill.sId,
          });
          if (result.isErr()) {
            logger.error(
              {
                error: result.error,
                skillId: skill.sId,
                workspaceId: workspace.sId,
              },
              "[SkillSearchBackfill] Failed to enqueue workflow"
            );
          }
          return result.isOk();
        },
        { concurrency }
      )
    : [];
  const enqueued = results.filter(Boolean).length;
  const failed = results.length - enqueued;
  logger.info(
    {
      execute,
      workspaceId: workspace.sId,
      candidates: skills.length,
      enqueued,
      failed,
    },
    "[SkillSearchBackfill] Workspace complete"
  );
  if (failed > 0) {
    throw new Error(`${failed} skill search workflow launches failed`);
  }
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
    assert(
      Number.isInteger(concurrency) && concurrency > 0,
      "--concurrency must be positive"
    );
    await runOnAllWorkspaces(
      (workspace) =>
        backfillWorkspace(workspace, { concurrency, execute, logger }),
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );
  }
);
