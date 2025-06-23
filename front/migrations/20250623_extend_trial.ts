import { Subscription } from "@app/lib/models/plan";
import { Workspace } from "@app/lib/models/workspace";
import { extendStripeSubscriptionTrial } from "@app/lib/plans/stripe";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

interface ExtensionResult {
  workspaceId: string;
  success: boolean;
  error?: string;
  newTrialEnd?: string;
}

async function extendWorkspaceTrial(
  workspaceId: string,
  execute: boolean,
  logger: any
): Promise<ExtensionResult> {
  const childLogger = logger.child({ workspaceId });

  try {
    // Find workspace
    const workspace = await Workspace.findOne({
      where: { sId: workspaceId },
    });

    if (!workspace) {
      childLogger.error("Workspace not found");
      return {
        workspaceId,
        success: false,
        error: "Workspace not found",
      };
    }

    // Get active subscription
    const subscription = await Subscription.findOne({
      where: {
        workspaceId: workspace.id,
        status: "active",
      },
    });

    if (!subscription) {
      childLogger.error("No active subscription found");
      return {
        workspaceId,
        success: false,
        error: "No active subscription found",
      };
    }

    if (!subscription.stripeSubscriptionId) {
      childLogger.error("No Stripe subscription ID found");
      return {
        workspaceId,
        success: false,
        error: "No Stripe subscription ID found",
      };
    }

    if (!subscription.trialing) {
      childLogger.error("Workspace is not in trial period");
      return {
        workspaceId,
        success: false,
        error: "Workspace is not in trial period",
      };
    }

    if (execute) {
      // Extend trial by 14 days (2 weeks) to reach 1 month total
      const result = await extendStripeSubscriptionTrial(
        subscription.stripeSubscriptionId,
        { days: 14 }
      );

      if (result.isErr()) {
        childLogger.error(
          { error: result.error.message },
          "Failed to extend trial"
        );
        return {
          workspaceId,
          success: false,
          error: result.error.message,
        };
      }

      const newTrialEnd = result.value.trialEnd
        ? new Date(result.value.trialEnd * 1000).toISOString()
        : undefined;

      childLogger.info(
        { newTrialEnd },
        "Successfully extended trial period by 14 days"
      );

      return {
        workspaceId,
        success: true,
        newTrialEnd,
      };
    } else {
      childLogger.info("Would extend trial period by 14 days");
      return {
        workspaceId,
        success: true,
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    childLogger.error({ error }, "Unexpected error extending trial");
    return {
      workspaceId,
      success: false,
      error: errorMessage,
    };
  }
}

makeScript(
  {
    workspaceIds: {
      type: "string",
      description: "Comma-separated list of workspace IDs to extend trials for",
      required: true,
    },
    concurrency: {
      type: "number",
      description: "Number of workspaces to process concurrently",
      default: 5,
    },
  },
  async ({ workspaceIds, concurrency, execute }, logger) => {
    if (!workspaceIds) {
      throw new Error("workspaceIds parameter is required");
    }

    const workspaceIdArray = workspaceIds
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (workspaceIdArray.length === 0) {
      throw new Error("No valid workspace IDs provided");
    }

    logger.info(
      {
        workspaceCount: workspaceIdArray.length,
        workspaceIds: workspaceIdArray,
        execute,
      },
      "Starting trial extension process"
    );

    const results = await concurrentExecutor(
      workspaceIdArray,
      async (workspaceId) => {
        return extendWorkspaceTrial(workspaceId, execute, logger);
      },
      { concurrency }
    );

    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    logger.info(
      {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        execute,
      },
      "Trial extension process completed"
    );

    if (successful.length > 0) {
      logger.info(
        {
          workspaces: successful.map((r) => ({
            workspaceId: r.workspaceId,
            newTrialEnd: r.newTrialEnd,
          })),
        },
        execute ? "Successfully extended trials" : "Would extend trials"
      );
    }

    if (failed.length > 0) {
      logger.error(
        {
          failures: failed.map((r) => ({
            workspaceId: r.workspaceId,
            error: r.error,
          })),
        },
        "Failed to extend some trials"
      );
    }
  }
);
