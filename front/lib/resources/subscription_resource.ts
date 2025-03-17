import _ from "lodash";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { Subscription } from "@app/lib/models/plan";
import { Plan } from "@app/lib/models/plan";
import type { PlanAttributes } from "@app/lib/plans/free_plans";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import { getTrialVersionForPlan, isTrial } from "@app/lib/plans/trial";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";
import type {
  LightWorkspaceType,
  PlanType,
  Result,
  SubscriptionType,
} from "@app/types";
import { Ok } from "@app/types";

const DEFAULT_PLAN_WHEN_NO_SUBSCRIPTION: PlanAttributes = FREE_NO_PLAN_DATA;
const FREE_NO_PLAN_SUBSCRIPTION_ID = -1;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SubscriptionResource
  extends ReadonlyAttributesType<Subscription> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SubscriptionResource extends BaseResource<Subscription> {
  static model: ModelStatic<Subscription> = Subscription;
  private readonly plan: PlanType;

  constructor(
    model: ModelStatic<Subscription>,
    blob: Attributes<Subscription>,
    plan: PlanType
  ) {
    super(Subscription, blob);
    this.plan = plan;
  }

  static async makeNew(blob: CreationAttributes<Subscription>, plan: PlanType) {
    const subscription = await Subscription.create({ ...blob });
    return new SubscriptionResource(Subscription, subscription.get(), plan);
  }

  static async fetchActiveByWorkspace(
    workspace: LightWorkspaceType
  ): Promise<SubscriptionResource> {
    const res = await SubscriptionResource.fetchActiveByWorkspaces([workspace]);
    return res[workspace.sId];
  }

  static async fetchActiveByWorkspaces(
    workspaces: LightWorkspaceType[]
  ): Promise<{ [key: string]: SubscriptionResource }> {
    const workspaceModelBySid = _.keyBy(workspaces, "sId");

    const activeSubscriptionByWorkspaceId = _.keyBy(
      await Subscription.findAll({
        attributes: [
          "endDate",
          "id",
          "paymentFailingSince",
          "sId",
          "startDate",
          "status",
          "stripeSubscriptionId",
          "trialing",
          "workspaceId",
        ],
        where: {
          workspaceId: Object.values(workspaceModelBySid).map((w) => w.id),
          status: "active",
        },
        include: [
          {
            model: Plan,
            as: "plan",
            required: true,
          },
        ],
      }),
      "workspaceId"
    );

    const subscriptionResourceByWorkspaceSid: Record<
      string,
      SubscriptionResource
    > = {};

    for (const [sId, workspace] of Object.entries(workspaceModelBySid)) {
      const activeSubscription =
        activeSubscriptionByWorkspaceId[workspace.id.toString()];

      let plan: PlanAttributes = DEFAULT_PLAN_WHEN_NO_SUBSCRIPTION;

      if (activeSubscription) {
        // If the subscription is in trial, temporarily override the plan until the FREE_TEST_PLAN is phased out.
        if (isTrial(activeSubscription)) {
          plan = getTrialVersionForPlan(activeSubscription.plan);
        } else if (activeSubscription.plan) {
          plan = activeSubscription.plan;
        } else {
          logger.error(
            {
              workspaceId: sId,
              activeSubscription,
            },
            "Cannot find plan for active subscription. Will use limits of FREE_TEST_PLAN instead. Please check and fix."
          );
        }
      }
      subscriptionResourceByWorkspaceSid[sId] = new SubscriptionResource(
        Subscription,
        activeSubscription?.get() ||
          this.createFreeNoPlanSubscription(workspace.id),
        renderPlanFromModel({ plan })
      );
    }

    return subscriptionResourceByWorkspaceSid;
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  getPlan(): PlanType {
    return Object.freeze({ ...this.plan });
  }

  toJSON(): SubscriptionType {
    return {
      status: this.status ?? "active",
      trialing: this.trialing === true,
      sId: this.sId || null,
      stripeSubscriptionId: this.stripeSubscriptionId || null,
      startDate: this.startDate?.getTime() || null,
      endDate: this.endDate?.getTime() || null,
      paymentFailingSince: this.paymentFailingSince?.getTime() || null,
      plan: this.getPlan(),
      requestCancelAt: this.requestCancelAt?.getTime() ?? null,
    };
  }

  private static createFreeNoPlanSubscription(
    workspaceId: number
  ): Attributes<Subscription> {
    const now = new Date();
    return {
      id: FREE_NO_PLAN_SUBSCRIPTION_ID,
      sId: generateRandomModelSId(),
      status: "ended",
      workspaceId: workspaceId,
      createdAt: now,
      updatedAt: now,
      startDate: now,
      endDate: now,
      trialing: false,
      paymentFailingSince: null,
      planId: -1,
      stripeSubscriptionId: null,
      requestCancelAt: null,
    };
  }
}
