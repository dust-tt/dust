import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import { PlanResource } from "@app/lib/resources/plan_resource";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const updateProMaxMessagesLimit = async (execute: boolean) => {
  if (execute) {
    const plan = await PlanResource.fetchByPlanCode(PRO_PLAN_SEAT_29_CODE);
    const res = await plan?.setMessageLimitsForPlan({
      maxMessages: 100,
      maxMessagesTimeframe: "day",
    });

    logger.info(
      {
        affectedCount: res,
      },
      "Backfilled PRO plan max messages"
    );
  } else {
    logger.info("Dry run completed, no changes were made");
  }
};

makeScript({}, async ({ execute }) => {
  await updateProMaxMessagesLimit(execute);
});
