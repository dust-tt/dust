import { getWorkspacePublicAPILimits } from "@app/lib/api/workspace";
import { runOnRedis } from "@app/lib/api/redis";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { LightWorkspaceType } from "@app/types";

// Redis key name kept for backward compatibility with programmatic_usage_tracking.ts.
const PROGRAMMATIC_USAGE_REMAINING_CREDITS_KEY = "public_api_remaining_credits";
const REDIS_ORIGIN = "public_api_limits";

function getRedisKey(workspace: LightWorkspaceType): string {
  return `${PROGRAMMATIC_USAGE_REMAINING_CREDITS_KEY}:${workspace.id}`;
}

async function fixWorkspaceCredits(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const workspaceLogger = logger.child({ workspaceId: workspace.sId });

  const publicApiLimits = getWorkspacePublicAPILimits(workspace);

  if (!publicApiLimits || !publicApiLimits.enabled) {
    workspaceLogger.info(
      { enabled: publicApiLimits?.enabled },
      "Skipping: publicApiLimits not enabled"
    );
    return;
  }

  const { monthlyLimit } = publicApiLimits;

  // monthlyLimit is in USD (e.g., 100 = $100), but remainingAmount was incorrectly
  // stored in cents before the fix. We need to add 100 * monthlyLimit to fix this.
  const creditsToAddCents = monthlyLimit * 100;

  await runOnRedis({ origin: REDIS_ORIGIN }, async (redis) => {
    const key = getRedisKey(workspace);
    const currentCredits = await redis.get(key);

    if (currentCredits === null) {
      workspaceLogger.info(
        "Skipping: no credits key in Redis (not initialized yet)"
      );
      return;
    }

    const currentCreditsValueCents = parseFloat(currentCredits);
    const newCreditsValueUSD = Math.min(
      monthlyLimit,
      (currentCreditsValueCents + creditsToAddCents) / 100
    );

    workspaceLogger.info(
      {
        monthlyLimit,
        creditsToAddCents: creditsToAddCents,
        currentCreditsCents: currentCreditsValueCents,
        newCreditsUSD: newCreditsValueUSD,
        execute,
      },
      execute
        ? "Fixing credits by adding 100 * monthlyLimit then convert to USD"
        : "Would fix credits by adding 100 * monthlyLimit (dry run) then convert to USD"
    );

    if (execute) {
      // Preserve the TTL of the key.
      await redis.set(key, newCreditsValueUSD.toString(), { KEEPTTL: true });
      workspaceLogger.info("Successfully updated credits");
    }
  });
}

makeScript(
  {
    wId: {
      type: "string",
      demandOption: false,
      describe:
        "Workspace sId to fix (optional, processes all workspaces with limits enabled if omitted)",
    },
  },
  async ({ wId, execute }, logger) => {
    logger.info(
      { execute, workspaceId: wId ?? "all" },
      "Starting programmatic credits fix migration"
    );

    if (wId) {
      const workspace = await WorkspaceModel.findOne({ where: { sId: wId } });

      if (!workspace) {
        throw new Error(`Workspace not found: ${wId}`);
      }

      await fixWorkspaceCredits(
        renderLightWorkspaceType({ workspace }),
        execute,
        logger
      );
    } else {
      const workspaces = await WorkspaceModel.findAll({
        where: {
          "metadata.publicApiLimits.enabled": true,
        },
      });

      logger.info({ count: workspaces.length }, "Found workspaces to process");

      await concurrentExecutor(
        workspaces,
        async (workspace) => {
          await fixWorkspaceCredits(
            renderLightWorkspaceType({ workspace }),
            execute,
            logger
          );
        },
        { concurrency: 8 }
      );
    }

    logger.info("Programmatic credits fix migration completed");
  }
);
