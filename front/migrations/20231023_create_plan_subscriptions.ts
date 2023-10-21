import { Plan, Subscription, Workspace } from "@app/lib/models";
import {
  FREE_TRIAL_PLAN_CODE,
  TEST_PLAN_CODE,
} from "@app/lib/plans/free_plans";
import { generateModelSId } from "@app/lib/utils";

async function main() {
  const workspaces = await Workspace.findAll();

  console.log(`Found ${workspaces.length} workspaces to update`);

  const chunks = [];
  for (let i = 0; i < workspaces.length; i += 16) {
    chunks.push(workspaces.slice(i, i + 16));
  }

  const testPlan = await Plan.findOne({
    where: {
      code: TEST_PLAN_CODE,
    },
  });
  const freeTrialPlan = await Plan.findOne({
    where: {
      code: FREE_TRIAL_PLAN_CODE,
    },
  });

  if (!testPlan || !freeTrialPlan) {
    console.error(`Cannot find test or free plan. Aborting.`);
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
          const startDate = workspace.upgradedAt;
          startDate.setHours(0, 0, 0, 0);
          await Subscription.create({
            sId: generateModelSId(),
            workspaceId: workspace.id,
            planId: freeTrialPlan.id,
            status: "active",
            startDate: startDate,
          });
        } else {
          // We subscribe to Test plan
          const startDate = workspace.createdAt;
          startDate.setHours(0, 0, 0, 0);
          await Subscription.create({
            sId: generateModelSId(),
            workspaceId: workspace.id,
            planId: testPlan.id,
            status: "active",
            startDate: startDate,
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
