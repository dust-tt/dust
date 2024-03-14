import { QueryTypes, Sequelize } from "sequelize";

import { internalSubscribeWorkspaceToFreeTestPlan } from "@app/lib/plans/subscription";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const { FRONT_DATABASE_URI } = process.env;

interface WorkspaceRow {
  id: number;
  sId: string;
  name: string;
}

makeScript({}, async ({ execute }) => {
  const front_sequelize = new Sequelize(FRONT_DATABASE_URI as string, {
    logging: false,
  });

  // Find all workspaces without subscriptions.
  const workspaces = await front_sequelize.query<WorkspaceRow>(
    `SELECT "workspaces"."id", "workspaces"."sId", "workspaces"."name"
       FROM "workspaces"
       LEFT JOIN "subscriptions" ON "workspaces"."id" = "subscriptions"."workspaceId"
       WHERE "subscriptions"."id" IS NULL`,
    { type: QueryTypes.SELECT }
  );

  const chunks: WorkspaceRow[][] = [];
  for (let i = 0; i < workspaces.length; i += 16) {
    chunks.push(workspaces.slice(i, i + 16));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((w) => {
        return (async () => {
          logger.info(
            `Subscribing workspace ${w.sId} to FREE_TEST_PLAN [execute: ${execute}]`
          );

          if (execute) {
            // This will create a new Subscription object for the FREE_TEST_PLAN.
            await internalSubscribeWorkspaceToFreeTestPlan({
              workspaceId: w.sId,
            });
          }
        })();
      })
    );
  }
});
