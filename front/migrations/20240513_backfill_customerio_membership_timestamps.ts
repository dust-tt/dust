import { removeNulls } from "@dust-tt/types";
import * as _ from "lodash";

import { Plan, Subscription } from "@app/lib/models/plan";
import { Workspace } from "@app/lib/models/workspace";
import {
  FREE_NO_PLAN_CODE,
  FREE_TEST_PLAN_CODE,
} from "@app/lib/plans/plan_codes";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { CustomerioServerSideTracking } from "@app/lib/tracking/customerio/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const backfillCustomerIo = async (execute: boolean) => {
  const allActiveSubscriptions = await Subscription.findAll({
    where: {
      status: "active",
    },
  });
  const planIds = removeNulls(allActiveSubscriptions.map((s) => s.planId));
  const planById = _.keyBy(
    planIds.length
      ? await Plan.findAll({
          where: {
            id: planIds,
          },
        })
      : [],
    (p) => p.id.toString()
  );
  const workpsaceIds = allActiveSubscriptions.map((s) => s.workspaceId);
  const workspaceById = _.keyBy(
    workpsaceIds.length
      ? await Workspace.findAll({
          where: {
            id: workpsaceIds,
          },
        })
      : [],
    (ws) => ws.id.toString()
  );

  for (const sub of allActiveSubscriptions) {
    const plan = planById[sub.planId.toString()];
    if (!plan || [FREE_TEST_PLAN_CODE, FREE_NO_PLAN_CODE].includes(plan.code)) {
      // Ignore free plans
      continue;
    }

    const workspace = workspaceById[sub.workspaceId.toString()];
    if (!workspace) {
      logger.error(
        { subscriptionId: sub.id },
        "Unreachable: subscription does not have a workspace"
      );
      continue;
    }

    const { memberships: workspaceMemberships } =
      await MembershipResource.getLatestMemberships({
        workspace: renderLightWorkspaceType({ workspace }),
      });
    const userIds = workspaceMemberships.map((m) => m.userId);
    const users = await UserResource.fetchByModelIds(userIds);

    logger.info(
      { workspaceId: workspace.sId, usersCount: users.length },
      "----------\nBackfilling users for workspace..."
    );

    for (const user of users) {
      logger.info(
        { userId: user.sId, workspaceId: workspace.sId },
        "Backfilling user..."
      );
      if (execute) {
        await CustomerioServerSideTracking.backfillUser({
          user: user.toJSON(),
        });
      }
    }
  }
};

makeScript({}, async ({ execute }) => {
  await backfillCustomerIo(execute);
});
