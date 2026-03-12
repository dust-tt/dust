import { PlanModel } from "@app/lib/models/plan";
import {
  FREE_BYOK_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { GroupResource } from "@app/lib/resources/group_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { WorkspaceType } from "@app/types/user";
import { faker } from "@faker-js/faker";
import { expect } from "vitest";

export class WorkspaceFactory {
  static async basic(): Promise<WorkspaceType> {
    return this.create(PRO_PLAN_SEAT_29_CODE);
  }

  static async byok(): Promise<WorkspaceType> {
    return this.create(FREE_BYOK_PLAN_CODE);
  }

  // Plans are seeded by the DB init script (admin/db.ts) to avoid deadlocks
  // from concurrent upserts in parallel test workers.
  private static async create(planCode: string): Promise<WorkspaceType> {
    const workspace = await WorkspaceModel.create({
      sId: generateRandomModelSId(),
      name: faker.company.name(),
      description: `[DEBUG] ${expect.getState().currentTestName}\n\n${faker.company.catchPhrase()}`,
      workOSOrganizationId: faker.string.alpha(10),
    });

    const plan = await PlanModel.findOne({ where: { code: planCode } });
    if (!plan) {
      throw new Error(`Plan ${planCode} not found`);
    }

    await SubscriptionResource.makeNew(
      {
        sId: generateRandomModelSId(),
        workspaceId: workspace.id,
        planId: plan.id,
        status: "active",
        startDate: new Date(),
        stripeSubscriptionId: null,
        endDate: null,
      },
      renderPlanFromModel({ plan })
    );

    const workspaceType: WorkspaceType = {
      ...renderLightWorkspaceType({ workspace }),
      ssoEnforced: workspace.ssoEnforced,
      workOSOrganizationId: workspace.workOSOrganizationId,
    };

    // Create default groups (global, system) so tests don't need to call
    // GroupFactory.defaults() manually. Idempotent if already created.
    await GroupResource.makeDefaultsForWorkspace(workspaceType);

    return workspaceType;
  }
}
