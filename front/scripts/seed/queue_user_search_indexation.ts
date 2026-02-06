import { makeScript } from "@app/scripts/helpers";
import { launchIndexUserSearchWorkflow } from "@app/temporal/es_indexation/client";

makeScript(
  {
    userSids: {
      type: "array",
      demandOption: true,
      description: "User sIds to queue for user search indexation",
    },
  },
  async ({ userSids, execute }, logger) => {
    const uniqueUserSids = [...new Set(userSids)];

    if (!execute) {
      logger.info(
        {
          userCount: uniqueUserSids.length,
        },
        "Would queue user search indexation workflows"
      );
      return;
    }

    for (const userSid of uniqueUserSids) {
      if (typeof userSid !== "string" || userSid.length === 0) {
        throw new Error("All --userSids values must be non-empty strings");
      }

      const workflowResult = await launchIndexUserSearchWorkflow({
        userId: userSid,
      });
      if (workflowResult.isErr()) {
        throw workflowResult.error;
      }

      logger.info(
        {
          userSid,
        },
        "Queued user search indexation workflow"
      );
    }
  }
);
