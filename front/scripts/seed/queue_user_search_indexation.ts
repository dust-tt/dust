import { makeScript } from "@app/scripts/helpers";
import { launchIndexUserSearchWorkflow } from "@app/temporal/es_indexation/client";

makeScript(
  {
    userIds: {
      type: "array",
      demandOption: true,
      description: "User sIds to queue for user search indexation",
    },
  },
  async ({ userIds, execute }, logger) => {
    const uniqueUserIds = [...new Set(userIds)];

    if (!execute) {
      logger.info(
        {
          userCount: uniqueUserIds.length,
        },
        "Would queue user search indexation workflows"
      );
      return;
    }

    for (const userId of uniqueUserIds) {
      if (typeof userId !== "string" || userId.length === 0) {
        throw new Error("All --userIds values must be non-empty strings");
      }

      const workflowResult = await launchIndexUserSearchWorkflow({
        userId,
      });
      if (workflowResult.isErr()) {
        throw workflowResult.error;
      }

      logger.info(
        {
          userId,
        },
        "Queued user search indexation workflow"
      );
    }
  }
);
