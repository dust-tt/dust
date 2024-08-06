import type { WorkspaceSegmentationType } from "@dust-tt/types";
import type { ActiveRoleType } from "@dust-tt/types";

import { Plan, Subscription } from "@app/lib/models/plan";
import { Workspace } from "@app/lib/models/workspace";
import { frontSequelize } from "@app/lib/resources/storage";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

async function createTestWorkspaces(
  { userId, count }: { userId: number; count: number },
  execute: boolean,
  logger: Logger
) {
  const plans = await Plan.findAll();
  if (plans.length === 0) {
    throw new Error(
      "No plans found in the database. Please create some plans first."
    );
  }

  if (!count || count <= 0) {
    throw new Error("Count must be greater than 0.");
  }

  if (!userId || userId <= 0) {
    throw new Error("User ID must be greater than 0.");
  }

  logger.info(`About to create ${count} test workspaces for user ${userId}.`);

  const workspaces: Workspace[] = [];

  await frontSequelize.transaction(async (t) => {
    for (let i = 0; i < count; i++) {
      const segmentations: WorkspaceSegmentationType[] = ["interesting", null];
      const workspace = await Workspace.create(
        {
          sId: generateLegacyModelSId(),
          name: `Test Workspace ${i + 1}`,
          description: `This is a test workspace ${i + 1}`,
          segmentation: segmentations[i % segmentations.length],
          whiteListedProviders: null,
          defaultEmbeddingProvider: null,
        },
        { transaction: t }
      );

      logger.info(`Workspace ${workspace.id} created.`);

      // Randomly select a plan
      const randomPlan = plans[Math.floor(Math.random() * plans.length)];

      // Create a subscription for the workspace
      await Subscription.create(
        {
          sId: generateLegacyModelSId(),
          workspaceId: workspace.id,
          planId: randomPlan.id,
          status: "active",
          startDate: new Date(),
          stripeSubscriptionId: `test_stripe_sub_${i}`,
        },
        { transaction: t }
      );

      // Create a new membership
      await MembershipModel.create(
        {
          startAt: new Date(),
          userId: userId,
          workspaceId: workspace.id,
          role: "admin" as ActiveRoleType,
        },
        { transaction: t }
      );
      workspaces.push(workspace);
    }
  });

  return workspaces;
}

makeScript(
  {
    userId: {
      type: "number",
      description: "The user ID to assign to the workspace",
    },
    count: {
      type: "number",
      description: "The number of workspaces to create",
    },
  },
  async ({ userId, count, execute }, logger) => {
    await createTestWorkspaces({ userId, count }, execute, logger);
  }
);
