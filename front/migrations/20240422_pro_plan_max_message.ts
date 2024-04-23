import { Plan } from "@app/lib/models/plan";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const updateProMaxMessagesLimit = async (execute: boolean) => {
  if (execute) {
    const res = await Plan.update(
      {
        maxMessages: 100,
        maxMessagesTimeframe: "day",
      },
      {
        where: {
          code: "PRO_PLAN_SEAT_29",
        },
      }
    );

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
