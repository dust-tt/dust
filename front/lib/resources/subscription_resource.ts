import type {
  LightWorkspaceType,
  Result,
  SubscriptionType,
} from "@dust-tt/types";
import { Ok } from "@dust-tt/types";
import * as _ from "lodash";
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
import { renderSubscriptionFromModels } from "@app/lib/plans/renderers";
import { getTrialVersionForPlan, isTrial } from "@app/lib/plans/trial";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import logger from "@app/logger/logger";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SubscriptionResource
  extends ReadonlyAttributesType<Subscription> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SubscriptionResource extends BaseResource<Subscription> {
  static model: ModelStatic<Subscription> = Subscription;

  constructor(
    model: ModelStatic<Subscription>,
    blob: Attributes<Subscription>
  ) {
    super(Subscription, blob);
  }

  static async makeNew(blob: CreationAttributes<Subscription>) {
    const subscription = await Subscription.create({ ...blob });
    return new SubscriptionResource(Subscription, subscription.get());
  }

  static async fetchByWorkspace(
    workspace: LightWorkspaceType
  ): Promise<SubscriptionType> {
    const res = await SubscriptionResource.fetchByWorkspaces([workspace]);

    const subscription = res[workspace.sId];
    if (!subscription) {
      throw new Error(
        `Could not find subscription for workspace ${workspace.sId}`
      );
    }

    return subscription;
  }

  static async fetchByWorkspaces(
    workspaces: LightWorkspaceType[]
  ): Promise<{ [key: string]: SubscriptionType }> {
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

    const renderedSubscriptionByWorkspaceSid: Record<string, SubscriptionType> =
      {};

    for (const [sId, workspace] of Object.entries(workspaceModelBySid)) {
      const activeSubscription =
        activeSubscriptionByWorkspaceId[workspace.id.toString()];

      // Default values when no subscription
      let plan: PlanAttributes = FREE_NO_PLAN_DATA;

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

      renderedSubscriptionByWorkspaceSid[sId] = renderSubscriptionFromModels({
        plan,
        activeSubscription,
      });
    }

    return renderedSubscriptionByWorkspaceSid;
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
}
