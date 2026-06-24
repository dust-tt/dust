import { PlanModel } from "@app/lib/models/plan";
import { upsertFreePlans } from "@app/lib/plans/free_plans";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  CREDIT_PRICED_FREE_PLAN_CODE,
  FREE_BYOK_PLAN_CODE,
  FREE_TEST_PLAN_CODE,
  PRO_PLAN_SEAT_29_CODE,
} from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { PlanFactory } from "@app/tests/utils/PlanFactory";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { WorkspaceType } from "@app/types/user";
import { faker } from "@faker-js/faker";
import { expect } from "vitest";

interface WorkspaceOverrides {
  whiteListedProviders?: ModelProviderIdType[] | null;
  metronomeCustomerId?: string | null;
  regionalModelsOnly?: boolean;
}

export class WorkspaceFactory {
  static async basic(overrides?: WorkspaceOverrides): Promise<WorkspaceType> {
    return this.create(PRO_PLAN_SEAT_29_CODE, overrides);
  }

  static async byok(overrides?: WorkspaceOverrides): Promise<WorkspaceType> {
    return this.create(FREE_BYOK_PLAN_CODE, overrides);
  }

  static async enterprise(
    overrides?: WorkspaceOverrides
  ): Promise<WorkspaceType> {
    const plan = await PlanFactory.enterprise();

    return this.createWithPlan(plan, overrides);
  }

  static async freeNoProductAccess(
    overrides?: WorkspaceOverrides
  ): Promise<WorkspaceType> {
    await upsertFreePlans(FREE_TEST_PLAN_CODE);
    return this.create(FREE_TEST_PLAN_CODE, overrides);
  }

  static async metronome(
    overrides?: WorkspaceOverrides
  ): Promise<WorkspaceType> {
    return this.create(PRO_PLAN_SEAT_29_CODE, overrides, {
      metronomeContractId: "test-metronome-contract-id",
    });
  }

  // A Metronome credit-priced workspace (plan code prefixed `CP_`), used to
  // exercise credit-priced gating such as the per-user credit cap or the
  // `none`-seat message block.
  static async creditPriced(
    overrides?: WorkspaceOverrides
  ): Promise<WorkspaceType> {
    return this.create(
      CREDIT_PRICED_BUSINESS_PLAN_CODE,
      { metronomeCustomerId: "cus_test_credit_priced", ...overrides },
      { metronomeContractId: "test-metronome-contract-id" }
    );
  }

  static async creditPricedFree(
    overrides?: WorkspaceOverrides
  ): Promise<WorkspaceType> {
    return this.create(
      CREDIT_PRICED_FREE_PLAN_CODE,
      { metronomeCustomerId: "cus_test_credit_priced_free", ...overrides },
      { metronomeContractId: "test-metronome-contract-id" }
    );
  }

  // Whitelabel frames are gated by the `whitelabel_frames` feature flag.
  static async withWhitelabelFrames(
    overrides?: WorkspaceOverrides
  ): Promise<WorkspaceType> {
    const workspace = await this.basic(overrides);
    await FeatureFlagResource.enable(workspace, "whitelabel_frames");

    return workspace;
  }

  // Plans are seeded by the DB init script (admin/db.ts) to avoid deadlocks
  // from concurrent upserts in parallel test workers.
  private static async create(
    planCode: string,
    overrides?: WorkspaceOverrides,
    subscriptionOverrides?: { metronomeContractId?: string }
  ): Promise<WorkspaceType> {
    const plan = await PlanModel.findOne({ where: { code: planCode } });
    if (!plan) {
      throw new Error(`Plan ${planCode} not found`);
    }

    return this.createWithPlan(plan, overrides, subscriptionOverrides);
  }

  private static async createWithPlan(
    plan: PlanModel,
    overrides?: WorkspaceOverrides,
    subscriptionOverrides?: { metronomeContractId?: string }
  ): Promise<WorkspaceType> {
    const workspaceDescription =
      `[DEBUG] ${expect.getState().currentTestName}\n\n${faker.company.catchPhrase()}`.slice(
        0,
        255
      );

    const workspace = await WorkspaceModel.create({
      sId: generateRandomModelSId(),
      name: faker.company.name(),
      description: workspaceDescription,
      workOSOrganizationId: faker.string.alpha(10),
      metronomeCustomerId: overrides?.metronomeCustomerId ?? null,
      ...(overrides?.whiteListedProviders !== undefined && {
        whiteListedProviders: overrides.whiteListedProviders,
      }),
      ...(overrides?.regionalModelsOnly !== undefined && {
        regionalModelsOnly: overrides.regionalModelsOnly,
      }),
    });

    await SubscriptionResource.makeNew(
      {
        sId: generateRandomModelSId(),
        workspaceId: workspace.id,
        planId: plan.id,
        status: "active",
        startDate: new Date(),
        stripeSubscriptionId: null,
        endDate: null,
        ...subscriptionOverrides,
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
