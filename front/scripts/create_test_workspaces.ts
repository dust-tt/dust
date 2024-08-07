import { Authenticator } from "@app/lib/auth";
import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { Plan } from "@app/lib/models/plan";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { pokeUpgradeWorkspaceToPlan } from "@app/lib/plans/subscription";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import { createAndLogMembership } from "@app/pages/api/login";
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

  const user = await UserResource.fetchByModelId(userId);
  if (!user) {
    throw new Error(`User with ID ${userId} not found.`);
  }

  if (!user.isDustSuperUser) {
    throw new Error(`User with ID ${userId} is not a super user.`);
  }

  if (!execute) {
    logger.info(
      `Would have created ${count} test workspaces for user ${user?.fullName()}.`
    );
    return;
  }

  logger.info(
    `About to create ${count} test workspaces for user ${user?.fullName()}.`
  );

  for (let i = 0; i < count; i++) {
    const name = `${user.firstName} ${generateLegacyModelSId()}`;
    const workspace = await createWorkspaceInternal({
      email: user.email,
      name: name,
      isVerified: true,
    });

    logger.info(`Workspace ${name} created.`);

    await createAndLogMembership({
      user,
      workspace,
      role: "admin",
    });

    const authenticator = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    await pokeUpgradeWorkspaceToPlan(authenticator, FREE_UPGRADED_PLAN_CODE);
  }
  /*
  workspaces.forEach(async (workspace) => {
    // Randomly select a plan
    const randomPlan = plans[Math.floor(Math.random() * plans.length)];

    // Create a subscription for the workspace
    await Subscription.create({
      sId: generateLegacyModelSId(),
      workspaceId: workspace.id,
      planId: randomPlan.id,
      status: "active",
      startDate: new Date(),
      stripeSubscriptionId: `test_stripe_sub_${workspace.sId}`,
    });

    // Create a new membership
    await MembershipModel.create({
      startAt: new Date(),
      userId: userId,
      workspaceId: workspace.id,
      role: "admin" as ActiveRoleType,
    });
  });
*/
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
