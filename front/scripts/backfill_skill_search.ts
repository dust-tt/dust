import { Authenticator } from "@app/lib/auth";
import { AgentSearchDocumentResource } from "@app/lib/resources/agent/agent_search_document_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import {
  launchIndexAgentSearchWorkflow,
  launchIndexSkillSearchWorkflow,
} from "@app/temporal/es_indexation/client";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_CONCURRENCY = 10;
type ResourceType = "skill" | "agent";

interface BackfillCounts {
  candidates: number;
  enqueued: number;
  failed: number;
}

async function enqueueSearchBatch({
  concurrency,
  logger,
  resourceIds,
  resourceType,
  workspaceId,
}: {
  concurrency: number;
  logger: Logger;
  resourceIds: readonly string[];
  resourceType: ResourceType;
  workspaceId: string;
}): Promise<Pick<BackfillCounts, "enqueued" | "failed">> {
  const results = await concurrentExecutor(
    resourceIds,
    async (resourceId) => {
      const result =
        resourceType === "skill"
          ? await launchIndexSkillSearchWorkflow({
              workspaceId,
              skillId: resourceId,
            })
          : await launchIndexAgentSearchWorkflow({
              workspaceId,
              agentId: resourceId,
            });
      if (result.isErr()) {
        logger.error(
          { error: result.error, resourceId, resourceType, workspaceId },
          "[SearchBackfill] Failed to enqueue workflow"
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
  initialResourceModelId,
  resourceType,
  logger,
  workspace,
}: {
  batchSize: number;
  concurrency: number;
  execute: boolean;
  initialResourceModelId: ModelId | null;
  resourceType: ResourceType;
  logger: Logger;
  workspace: LightWorkspaceType;
}): Promise<BackfillCounts> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  let lastResourceModelId = initialResourceModelId;
  const counts: BackfillCounts = {
    candidates: 0,
    enqueued: 0,
    failed: 0,
  };

  while (true) {
    const resources =
      resourceType === "skill"
        ? (
            await SkillSearchDocumentResource.listActiveSearchIndexSkillIds(
              auth,
              {
                afterSkillModelId: lastResourceModelId,
                limit: batchSize,
              }
            )
          ).map(({ skillId, skillModelId }) => ({
            resourceId: skillId,
            resourceModelId: skillModelId,
          }))
        : (
            await AgentSearchDocumentResource.listSearchIndexAgentIds(auth, {
              afterAgentModelId: lastResourceModelId,
              limit: batchSize,
            })
          ).map(({ agentId, agentModelId }) => ({
            resourceId: agentId,
            resourceModelId: agentModelId,
          }));
    if (resources.length === 0) {
      break;
    }

    lastResourceModelId = resources[resources.length - 1].resourceModelId;
    counts.candidates += resources.length;

    if (execute) {
      const batchCounts = await enqueueSearchBatch({
        concurrency,
        logger,
        resourceIds: resources.map((resource) => resource.resourceId),
        resourceType,
        workspaceId: workspace.sId,
      });
      counts.enqueued += batchCounts.enqueued;
      counts.failed += batchCounts.failed;
    }

    logger.info(
      {
        execute,
        lastResourceModelId,
        resourceType,
        workspaceCandidates: counts.candidates,
        workspaceEnqueued: counts.enqueued,
        workspaceFailed: counts.failed,
        workspaceId: workspace.sId,
      },
      "[SearchBackfill] Batch complete"
    );
  }

  logger.info(
    {
      execute,
      lastResourceModelId,
      resourceType,
      workspaceCandidates: counts.candidates,
      workspaceEnqueued: counts.enqueued,
      workspaceFailed: counts.failed,
      workspaceId: workspace.sId,
    },
    "[SearchBackfill] Workspace complete"
  );

  return counts;
}

makeScript(
  {
    resourceType: {
      type: "string",
      choices: ["skill", "agent"],
      default: "skill",
      describe:
        "Resource index to backfill (the legacy command defaults to skills).",
    },
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
    fromAgentModelId: {
      type: "number",
      describe:
        "Skip stable agent identities through this model id (requires --resourceType agent).",
    },
    batchSize: {
      type: "number",
      default: DEFAULT_BATCH_SIZE,
      describe: "Number of resources to fetch per database query.",
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
      fromAgentModelId,
      fromWorkspaceModelId,
      resourceType,
      wId,
    },
    logger
  ) => {
    assert(batchSize > 0, "--batchSize must be positive");
    assert(concurrency > 0, "--concurrency must be positive");
    assert(resourceType === "skill" || resourceType === "agent");
    assert(
      fromAgentModelId === undefined || resourceType === "agent",
      "--fromAgentModelId requires --resourceType agent"
    );
    assert(
      fromSkillModelId === undefined || resourceType === "skill",
      "--fromSkillModelId requires --resourceType skill"
    );
    const fromResourceModelId = fromSkillModelId ?? fromAgentModelId;
    assert(
      fromResourceModelId === undefined ||
        wId !== undefined ||
        fromWorkspaceModelId !== undefined,
      "Resuming a resource cursor requires --wId or --fromWorkspaceModelId"
    );

    let totalCandidates = 0;
    let totalEnqueued = 0;
    let totalFailed = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const initialResourceModelId =
          wId !== undefined || workspace.id === fromWorkspaceModelId
            ? (fromResourceModelId ?? null)
            : null;
        const counts = await backfillWorkspace({
          batchSize,
          concurrency,
          execute,
          initialResourceModelId,
          resourceType,
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
      { execute, resourceType, totalCandidates, totalEnqueued, totalFailed },
      execute
        ? "[SearchBackfill] Enqueue complete"
        : "[SearchBackfill] Dry run complete"
    );

    if (totalFailed > 0) {
      throw new Error(
        `${totalFailed} ${resourceType} search workflow launches failed`
      );
    }
  }
);
