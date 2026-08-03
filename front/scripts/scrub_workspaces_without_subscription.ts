import { SubscriptionModel } from "@app/lib/models/plan";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { launchDeleteWorkspaceWorkflow } from "@app/poke/temporal/client";
import { makeScript } from "@app/scripts/helpers";
import { Op } from "sequelize";

const AGE_THRESHOLD_DAYS = 7;
const BATCH_SIZE = 1000;
const SCRUB_CONCURRENCY = 4;

async function scrubWorkspaceBatch(
  workspaces: WorkspaceModel[],
  execute: boolean,
  logger: Logger
): Promise<number> {
  if (workspaces.length === 0) {
    return 0;
  }

  // Scoped lookup: which of these workspaces have ever had a subscription
  // (any status, free trial, active, or past/expired). Indexed on workspaceId.
  const subscribedRows = await SubscriptionModel.findAll({
    where: { workspaceId: { [Op.in]: workspaces.map((w) => w.id) } },
    attributes: ["workspaceId"],
    group: ["workspaceId"],
  });
  const subscribedWorkspaceModelIds = new Set(
    subscribedRows.map((s) => s.workspaceId)
  );

  const toScrub = workspaces.filter(
    (w) => !subscribedWorkspaceModelIds.has(w.id)
  );

  if (!execute) {
    for (const workspace of toScrub) {
      logger.info(
        { workspaceId: workspace.sId, createdAt: workspace.createdAt },
        "[DRY RUN] Would scrub workspace."
      );
    }
    return toScrub.length;
  }

  await concurrentExecutor(
    toScrub,
    async (workspace) => {
      const res = await launchDeleteWorkspaceWorkflow({
        workspaceId: workspace.sId,
      });
      if (res.isErr()) {
        logger.error(
          { workspaceId: workspace.sId, error: res.error },
          "Failed to launch delete workspace workflow."
        );
        return;
      }
      logger.info(
        { workspaceId: workspace.sId },
        "Launched delete workspace workflow."
      );
    },
    { concurrency: SCRUB_CONCURRENCY }
  );

  return toScrub.length;
}

makeScript({}, async ({ execute }, logger) => {
  const cutoffDate = new Date(
    Date.now() - AGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
  );

  logger.info({ cutoffDate, batchSize: BATCH_SIZE }, "Starting scrub scan.");

  // Keyset pagination on the primary key to keep memory bounded: we never hold
  // more than BATCH_SIZE workspaces in memory, and the subscription lookup is
  // scoped to each batch instead of scanning the whole table.
  let lastSeenModelId = 0;
  let scannedCount = 0;
  let scrubbedCount = 0;

  for (;;) {
    const workspaces = await WorkspaceModel.findAll({
      where: {
        createdAt: { [Op.lt]: cutoffDate },
        id: { [Op.gt]: lastSeenModelId },
      },
      attributes: ["id", "sId", "createdAt"],
      order: [["id", "ASC"]],
      limit: BATCH_SIZE,
    });

    if (workspaces.length === 0) {
      break;
    }

    scannedCount += workspaces.length;
    lastSeenModelId = workspaces[workspaces.length - 1].id;

    scrubbedCount += await scrubWorkspaceBatch(workspaces, execute, logger);

    logger.info({ scannedCount, scrubbedCount, lastSeenModelId }, "Progress.");
  }

  logger.info(
    { scannedCount, scrubbedCount, execute },
    execute
      ? "Done launching scrub workflows."
      : "Dry run complete (use --execute to run)."
  );
});
