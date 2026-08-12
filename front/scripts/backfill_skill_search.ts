import { Authenticator } from "@app/lib/auth";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_CONCURRENCY = 10;

interface BackfillCounts {
  candidates: number;
  enqueued: number;
  failed: number;
}

async function enqueueSkillSearchBatch({
  concurrency,
  logger,
  skills,
  workspaceId,
}: {
  concurrency: number;
  logger: Logger;
  skills: readonly { skillId: string }[];
  workspaceId: string;
}): Promise<Pick<BackfillCounts, "enqueued" | "failed">> {
  const results = await concurrentExecutor(
    skills,
    async ({ skillId }) => {
      const result = await launchIndexSkillSearchWorkflow({
        workspaceId,
        skillId,
      });
      if (result.isErr()) {
        logger.error(
          { error: result.error, skillId, workspaceId },
          "[SkillSearchBackfill] Failed to enqueue workflow"
        );
        return false;
      }

      return true;
    },
    { concurrency }
  );
  const enqueued = results.filter(Boolean).length;

  return { enqueued, failed: results.length - enqueued };
}

async function backfillWorkspace({
  batchSize,
  concurrency,
  execute,
  initialSkillModelId,
  logger,
  workspace,
}: {
  batchSize: number;
  concurrency: number;
  execute: boolean;
  initialSkillModelId: ModelId | null;
  logger: Logger;
  workspace: LightWorkspaceType;
}): Promise<BackfillCounts> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  let lastSkillModelId = initialSkillModelId;
  const counts: BackfillCounts = {
    candidates: 0,
    enqueued: 0,
    failed: 0,
  };

  while (true) {
    const skills =
      await SkillSearchDocumentResource.listActiveSearchIndexSkillIds(auth, {
        afterSkillModelId: lastSkillModelId,
        limit: batchSize,
      });
    if (skills.length === 0) {
      break;
    }

    lastSkillModelId = skills[skills.length - 1].skillModelId;
    counts.candidates += skills.length;

    if (execute) {
      const batchCounts = await enqueueSkillSearchBatch({
        concurrency,
        logger,
        skills,
        workspaceId: workspace.sId,
      });
      counts.enqueued += batchCounts.enqueued;
      counts.failed += batchCounts.failed;
    }

    logger.info(
      {
        execute,
        lastSkillModelId,
        workspaceCandidates: counts.candidates,
        workspaceEnqueued: counts.enqueued,
        workspaceFailed: counts.failed,
        workspaceId: workspace.sId,
      },
      "[SkillSearchBackfill] Batch complete"
    );
  }

  logger.info(
    {
      execute,
      lastSkillModelId,
      workspaceCandidates: counts.candidates,
      workspaceEnqueued: counts.enqueued,
      workspaceFailed: counts.failed,
      workspaceId: workspace.sId,
    },
    "[SkillSearchBackfill] Workspace complete"
  );

  return counts;
}

makeScript(
  {
    wId: {
      type: "string",
      describe: "Workspace sId to backfill (omit to run on all workspaces).",
    },
    fromWorkspaceModelId: {
      type: "number",
      describe:
        "Skip workspaces with model id below this value (for resuming).",
    },
    fromSkillModelId: {
      type: "number",
      describe:
        "Skip skills through this model id in the selected or first workspace.",
    },
    batchSize: {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      describe: "Number of skills to fetch per database query.",
    },
    concurrency: {
      type: "number",
      default: DEFAULT_CONCURRENCY,
      describe: "Concurrent Temporal workflow launches per batch.",
    },
  },
  async (
    {
      batchSize,
      concurrency,
      execute,
      fromSkillModelId,
      fromWorkspaceModelId,
      wId,
    },
    logger
  ) => {
    assert(batchSize > 0, "--batchSize must be positive");
    assert(concurrency > 0, "--concurrency must be positive");
    assert(
      fromSkillModelId === undefined ||
        wId !== undefined ||
        fromWorkspaceModelId !== undefined,
      "--fromSkillModelId requires --wId or --fromWorkspaceModelId"
    );

    let totalCandidates = 0;
    let totalEnqueued = 0;
    let totalFailed = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const initialSkillModelId =
          wId !== undefined || workspace.id === fromWorkspaceModelId
            ? (fromSkillModelId ?? null)
            : null;
        const counts = await backfillWorkspace({
          batchSize,
          concurrency,
          execute,
          initialSkillModelId,
          logger,
          workspace,
        });

        totalCandidates += counts.candidates;
        totalEnqueued += counts.enqueued;
        totalFailed += counts.failed;
      },
      { wId, fromWorkspaceId: fromWorkspaceModelId }
    );

    logger.info(
      { execute, totalCandidates, totalEnqueued, totalFailed },
      execute
        ? "[SkillSearchBackfill] Enqueue complete"
        : "[SkillSearchBackfill] Dry run complete"
    );

    if (totalFailed > 0) {
      throw new Error(`${totalFailed} skill search workflow launches failed`);
    }
  }
);
