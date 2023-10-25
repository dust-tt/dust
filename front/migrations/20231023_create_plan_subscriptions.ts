import { Op } from "sequelize";

import { Plan, Subscription, Workspace } from "@app/lib/models";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/free_plans";
import { generateModelSId } from "@app/lib/utils";

async function main() {
  const workspaces = await Workspace.findAll({
    where: {
      upgradedAt: {
        [Op.not]: null,
      },
    },
  });

  console.log(`Found ${workspaces.length} workspaces to update`);

  const chunks = [];
  for (let i = 0; i < workspaces.length; i += 16) {
    chunks.push(workspaces.slice(i, i + 16));
  }

  const freeUpgradedPlan = await Plan.findOne({
    where: {
      code: FREE_UPGRADED_PLAN_CODE,
    },
  });

  if (!freeUpgradedPlan) {
    console.error(`Cannot find free upgraded plan. Aborting.`);
    return;
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map(async (workspace: Workspace) => {
        const activeSubscription = await Subscription.findOne({
          where: { workspaceId: workspace.id, status: "active" },
        });
        if (activeSubscription) {
          return;
        }

        if (workspace.upgradedAt) {
          // We subscribe to Free Trial plan
          await Subscription.create({
            sId: generateModelSId(),
            workspaceId: workspace.id,
            planId: freeUpgradedPlan.id,
            status: "active",
            startDate: workspace.upgradedAt,
          });
        }
      })
    );
  }
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
