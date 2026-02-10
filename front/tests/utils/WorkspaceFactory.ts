import { faker } from "@faker-js/faker";
import { expect } from "vitest";

import { PlanModel } from "@app/lib/models/plan";
import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { WorkspaceType } from "@app/types";

export class WorkspaceFactory {
  static async basic(): Promise<WorkspaceType> {
    // Plans are seeded by the DB init script (admin/db.ts) to avoid deadlocks
    // from concurrent upserts in parallel test workers.
    const workspace = await WorkspaceModel.create({
      sId: generateRandomModelSId(),
      name: faker.company.name(),
      description: `[DEBUG] Created for the test: ${expect.getState().currentTestName}\n\n${faker.company.catchPhrase()}`,
      workOSOrganizationId: faker.string.alpha(10),
    });

    const newPlan = await PlanModel.findOne({
      where: { code: PRO_PLAN_SEAT_29_CODE },
    });
    if (!newPlan) {
      throw new Error(`Plan ${PRO_PLAN_SEAT_29_CODE} not found`);
    }
    const now = new Date();

    await SubscriptionResource.makeNew(
      {
        sId: generateRandomModelSId(),
        workspaceId: workspace.id,
        planId: newPlan.id,
        status: "active",
        startDate: now,
        stripeSubscriptionId: null,
        endDate: null,
      },
      renderPlanFromModel({ plan: newPlan })
    );

    return {
      ...renderLightWorkspaceType({ workspace }),
      ssoEnforced: workspace.ssoEnforced,
      workOSOrganizationId: workspace.workOSOrganizationId,
    };
  }
}
