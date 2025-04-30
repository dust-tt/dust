import { Authenticator } from "@app/lib/auth";
import { createWorkspaceInternal } from "@app/lib/iam/workspaces";
import { Plan } from "@app/lib/models/plan";
import { FREE_UPGRADED_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import { createAndLogMembership } from "@app/pages/api/login";
import { makeScript } from "@app/scripts/helpers";

async function createTestWorkspaces(
  { userId, count }: { userId: number; count: number },
  execute: boolean,
  logger: Logger
) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("This script can only be run in development.");
  }

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
    const name = `${user.firstName} ${generateRandomModelSId()}`;
    const workspace = await createWorkspaceInternal({
      email: user.email,
      name: name,
      isVerified: true,
      isBusiness: false,
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

    await SubscriptionResource.pokeUpgradeWorkspaceToPlan({
      auth: authenticator,
      planCode: FREE_UPGRADED_PLAN_CODE,
      endDate: null,
    });
  }
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
