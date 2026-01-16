import { faker } from "@faker-js/faker";
import { expect } from "vitest";

import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { WorkspaceType } from "@app/types";

export class WorkspaceFactory {
  static async basic(): Promise<WorkspaceType> {
    // Plans are seeded once in admin/db.ts during test setup, no need to call upsertProPlans here.
    const workspace = await WorkspaceModel.create({
      sId: generateRandomModelSId(),
      name: faker.company.name(),
      description: `[DEBUG] Created for the test: ${expect.getState().currentTestName}\n\n${faker.company.catchPhrase()}`,
      workOSOrganizationId: faker.string.alpha(10),
    });

    const newPlan = await PlanModel.findOne({
      where: { code: PRO_PLAN_SEAT_29_CODE },
    });
    const now = new Date();

    await SubscriptionModel.create({
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
      workOSOrganizationId: workspace.workOSOrganizationId,
    };
  }
}
