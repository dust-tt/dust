import { faker } from "@faker-js/faker";

import { Plan, Subscription } from "@app/lib/models/plan";
import { Workspace } from "@app/lib/models/workspace";
import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import { upsertProPlans } from "@app/lib/plans/pro_plans";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { WorkspaceType } from "@app/types";

export class WorkspaceFactory {
  static async basic(): Promise<WorkspaceType> {
    await upsertProPlans();
    const workspace = await Workspace.create({
      sId: generateRandomModelSId(),
      name: faker.company.name(),
      description: faker.company.catchPhrase(),
    });

    const newPlan = await Plan.findOne({
      where: { code: PRO_PLAN_SEAT_29_CODE },
    });
    const now = new Date();

    await Subscription.create({
      sId: generateRandomModelSId(),
      workspaceId: workspace.id,
      planId: newPlan?.id,
      status: "active",
      startDate: now,
      stripeSubscriptionId: null,
      endDate: null,
    });

    return {
      ...renderLightWorkspaceType({ workspace }),
      ssoEnforced: workspace.ssoEnforced,
    };
  }
}
