import _ from "lodash";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";
import type Stripe from "stripe";

import { sendProactiveTrialCancelledEmail } from "@app/lib/api/email";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import { getWorkspaceInfos } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { Plan, Subscription } from "@app/lib/models/plan";
import type { PlanAttributes } from "@app/lib/plans/free_plans";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import {
  FREE_TEST_PLAN_CODE,
  isEntreprisePlan,
  isFreePlan,
  isProPlan,
  isUpgraded,
  PRO_PLAN_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import {
  cancelSubscriptionImmediately,
  createProPlanCheckoutSession,
  getProPlanStripeProductId,
  getStripeSubscription,
} from "@app/lib/plans/stripe";
import { getTrialVersionForPlan, isTrial } from "@app/lib/plans/trial";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import { REPORT_USAGE_METADATA_KEY } from "@app/lib/plans/usage/types";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { getWorkspaceFirstAdmin } from "@app/lib/workspace";
import { checkWorkspaceActivity } from "@app/lib/workspace_usage";
import logger from "@app/logger/logger";
import type {
  BillingPeriod,
  CheckoutUrlResult,
  EnterpriseUpgradeFormType,
  LightWorkspaceType,
  PlanType,
  Result,
  SubscriptionPerSeatPricing,
  SubscriptionType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Ok, sendUserOperationMessage } from "@app/types";

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
  static model: ModelStaticWorkspaceAware<Subscription> = Subscription;
  private readonly plan: PlanType;

  constructor(
    model: ModelStaticWorkspaceAware<Subscription>,
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
    workspace: LightWorkspaceType,
    transaction?: Transaction
  ): Promise<SubscriptionResource> {
    const res = await SubscriptionResource.fetchActiveByWorkspaces(
      [workspace],
      transaction
    );
    return res[workspace.sId];
  }

  static async fetchActiveByWorkspaces(
    workspaces: LightWorkspaceType[],
    transaction?: Transaction
  ): Promise<{ [key: string]: SubscriptionResource }> {
    const workspaceModelBySid = _.keyBy(workspaces, "sId");

    const activeSubscriptionByWorkspaceId = _.keyBy(
      await this.model.findAll({
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
        // WORKSPACE_ISOLATION_BYPASS: workspaceId is filtered just above, but the check is refusing more than 1 elements in the array. It's ok here to have more than 1 element.
        dangerouslyBypassWorkspaceIsolationSecurity: true,
        include: [
          {
            model: Plan,
            as: "plan",
            required: true,
          },
        ],
        transaction,
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
          this.createFreeNoPlanSubscription(workspace),
        renderPlanFromModel({ plan })
      );
    }

    return subscriptionResourceByWorkspaceSid;
  }

  static async fetchByAuthenticator(
    auth: Authenticator
  ): Promise<SubscriptionResource[]> {
    const owner = auth.getNonNullableWorkspace();

    const subscriptions = await Subscription.findAll({
      where: { workspaceId: owner.id },
      include: [Plan],
    });

    return subscriptions.map(
      (s) =>
        new SubscriptionResource(
          Subscription,
          s.get(),
          renderPlanFromModel({ plan: s.plan })
        )
    );
  }

  static async fetchByStripeId(
    stripeSubscriptionId: string
  ): Promise<SubscriptionResource | null> {
    const res = await this.model.findOne({
      where: { stripeSubscriptionId },
      include: [Plan],

      // WORKSPACE_ISOLATION_BYPASS: Used to check if a subscription is not attached to a workspace
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    if (!res) {
      return null;
    }

    return new SubscriptionResource(
      Subscription,
      res.get(),
      renderPlanFromModel({ plan: res.plan })
    );
  }

  /**
   * Get all active subscription that are not FREE_TEST_PLAN_CODE
   */
  static async internalListAllActiveNoFreeTestPlan(): Promise<
    SubscriptionResource[]
  > {
    const subscriptions = await this.model.findAll({
      where: {
        status: "active",
      },
      // WORKSPACE_ISOLATION_BYPASS: Internal use to actively down the callstack get the list
      // of workspaces that are active
      dangerouslyBypassWorkspaceIsolationSecurity: true,
      include: [
        {
          model: Plan,
          as: "plan",
          where: {
            code: {
              [Op.ne]: FREE_TEST_PLAN_CODE,
            },
          },
        },
      ],
    });

    return subscriptions.map(
      (sub) =>
        new SubscriptionResource(
          this.model,
          sub.get(),
          renderPlanFromModel({ plan: sub.plan })
        )
    );
  }

  /**
   * Internal function to subscribe to the FREE_NO_PLAN.
   * This is the only plan without a database entry: no need to create a subscription, we just end the active one if any.
   * @param params.workspaceId - The ID of the workspace to subscribe to the free plan
   * @returns The subscription resource
   * @throws Error if workspace not found
   */
  static async internalSubscribeWorkspaceToFreeNoPlan({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<SubscriptionResource> {
    const workspace = await this.findWorkspaceOrThrow(workspaceId);

    await this.endActiveSubscription(workspace);

    return new SubscriptionResource(
      Subscription,
      this.createFreeNoPlanSubscription(workspace),
      renderPlanFromModel({ plan: FREE_NO_PLAN_DATA })
    );
  }

  /**
   * Internal function to subscribe to a new Plan.
   * @param params.workspaceId - The ID of the workspace to subscribe to the plan
   * @param params.planCode - The code of the plan to subscribe to
   * @param params.stripeSubscriptionId - Optional Stripe subscription ID
   * @returns The subscription resource
   * @throws Error if workspace not found, plan not found, or already subscribed to the plan
   */
  static async internalSubscribeWorkspaceToFreePlan({
    workspaceId,
    planCode,
    stripeSubscriptionId,
    endDate,
  }: {
    workspaceId: string;
    planCode: string;
    stripeSubscriptionId?: string;
    endDate: Date | null;
  }): Promise<SubscriptionResource> {
    const workspace = await this.findWorkspaceOrThrow(workspaceId);
    const newPlan = await this.findPlanOrThrow(planCode);
    const now = new Date();

    // Find active subscription
    const activeSubscription = await Subscription.findOne({
      where: { workspaceId: workspace.id, status: "active" },
    });

    // Prevent subscribing to the same plan
    if (activeSubscription && activeSubscription.planId === newPlan.id) {
      throw new Error(
        `Cannot subscribe to plan ${planCode}: already subscribed.`
      );
    }

    // Prevent subscribing if the new plan has less users allowed then the current one on the workspace
    if (newPlan.maxUsersInWorkspace !== -1) {
      const activeSeats = await countActiveSeatsInWorkspace(workspace.sId);
      if (activeSeats > newPlan.maxUsersInWorkspace) {
        throw new Error(
          `Cannot subscribe to plan ${planCode}: new plan has less users allowed than currently in workspace.`
        );
      }
    }

    // Proceed to the termination of the active subscription (if any) and creation of the new one
    const newSubscription = await withTransaction(async (t) => {
      if (activeSubscription) {
        const endedStatus = activeSubscription.stripeSubscriptionId
          ? "ended_backend_only"
          : "ended";

        await activeSubscription.update(
          {
            status: endedStatus,
            endDate: now,
          },
          { transaction: t }
        );
      }

      return Subscription.create(
        {
          sId: generateRandomModelSId(),
          workspaceId: workspace.id,
          planId: newPlan.id,
          status: "active",
          startDate: now,
          stripeSubscriptionId: stripeSubscriptionId ?? null,
          endDate: endDate,
        },
        { transaction: t }
      );
    });

    // Check if the workspace is switching to a new Stripe subscription ID.
    const isNewStripeSubscriptionId =
      activeSubscription &&
      activeSubscription.stripeSubscriptionId !== stripeSubscriptionId;

    // If the workspace is switching to a new Stripe subscription ID and the
    // previous subscription was paid, notify Stripe to cancel the subscription
    // immediately.
    if (activeSubscription?.stripeSubscriptionId && isNewStripeSubscriptionId) {
      await cancelSubscriptionImmediately({
        stripeSubscriptionId: activeSubscription.stripeSubscriptionId,
      });
    }

    return new SubscriptionResource(
      Subscription,
      newSubscription.get(),
      renderPlanFromModel({ plan: newPlan })
    );
  }

  static async pokeUpgradeWorkspaceToEnterprise(
    auth: Authenticator,
    enterpriseDetails: EnterpriseUpgradeFormType
  ) {
    const owner = auth.getNonNullableWorkspace();

    if (!auth.isDustSuperUser()) {
      throw new Error("Cannot upgrade workspace to plan: not allowed.");
    }

    const plan = await this.findPlanOrThrow(enterpriseDetails.planCode);
    // End the current subscription if any.
    await this.internalSubscribeWorkspaceToFreePlan({
      workspaceId: owner.sId,
      planCode: plan.code,
      stripeSubscriptionId: enterpriseDetails.stripeSubscriptionId,
      endDate: null,
    });
  }

  /**
   * Internal function to create a PlanInvitation for the workspace.
   */
  static async pokeUpgradeWorkspaceToPlan({
    auth,
    planCode,
    endDate,
  }: {
    auth: Authenticator;
    planCode: string;
    endDate: Date | null;
  }) {
    const owner = auth.getNonNullableWorkspace();

    if (!auth.isDustSuperUser()) {
      throw new Error("Cannot upgrade workspace to plan: not allowed.");
    }

    const newPlan = await this.findPlanOrThrow(planCode);

    // We search for an active subscription for this workspace
    const activeSubscription = auth.subscriptionResource();
    if (activeSubscription && activeSubscription.plan.code === newPlan.code) {
      // If you are already on this free plan and you want to change the end date, we let you do it.
      if (isFreePlan(newPlan.code) && activeSubscription.endDate !== endDate) {
        await Subscription.update(
          { endDate },
          {
            where: { sId: activeSubscription.sId },
          }
        );
        return;
      }
      throw new Error(
        `Cannot subscribe to plan ${planCode}: already subscribed.`
      );
    }

    // Ugrade to Enterprise is not allowed through this function.
    if (isEntreprisePlan(newPlan.code)) {
      throw new Error(
        `Cannot subscribe to plan ${planCode}: Enterprise Plans requires a special process.`
      );
    }

    // Upgrade to Pro is allowed only if the workspace is already subscribed to a Pro plan.
    // This is a way to change the plan limitations but stay on Pro.
    if (isProPlan(newPlan.code)) {
      if (
        !activeSubscription ||
        !activeSubscription.sId ||
        !activeSubscription.stripeSubscriptionId
      ) {
        throw new Error(
          `Cannot subscribe to ${planCode}: Workspace has no subscription. It needs to be on Pro Plan already (stripe checkout session must be done on the product).`
        );
      }

      const isAlreadyOnProPlan =
        await activeSubscription.isSubscriptionOnProPlan(owner);

      if (!isAlreadyOnProPlan) {
        throw new Error(
          `Cannot subscribe to ${planCode}: Workspace has a subscription but it's not a Pro Plan.`
        );
      }

      await Subscription.update(
        { planId: newPlan.id },
        {
          where: {
            sId: activeSubscription.sId,
          },
        }
      );
      return;
    }

    const newSubscription = await this.internalSubscribeWorkspaceToFreePlan({
      workspaceId: owner.sId,
      planCode: newPlan.code,
      endDate,
    });

    if (isUpgraded(newSubscription.getPlan())) {
      await getOrCreateWorkOSOrganization(owner);
    }
  }

  static async maybeCancelInactiveTrials(
    auth: Authenticator,
    eventStripeSubscription: Stripe.Subscription
  ) {
    const { id: stripeSubscriptionId } = eventStripeSubscription;

    const subscription = await Subscription.findOne({
      where: { stripeSubscriptionId },
      include: [WorkspaceModel],
    });

    // Bail early if the DB subscription is not in trial mode.
    if (!subscription || !subscription.trialing) {
      return;
    }

    const { workspace } = subscription;

    // This function can get called if the subscription is upgraded before the end of the trial.
    // Ensure that the Stripe subscription still has a status set to `trialing`.
    const stripeSubscription =
      await getStripeSubscription(stripeSubscriptionId);
    if (!stripeSubscription || stripeSubscription.status !== "trialing") {
      logger.info(
        { action: "cancelling-trial", workspaceId: workspace.sId },
        "Proactive trial cancellation skipped due to active subscription."
      );

      return;
    }

    const isWorkspaceActive = await checkWorkspaceActivity(auth);

    if (!isWorkspaceActive) {
      logger.info(
        { action: "cancelling-trial", workspaceId: workspace.sId },
        "Cancelling inactive trial."
      );

      await cancelSubscriptionImmediately({
        stripeSubscriptionId,
      });

      const firstAdmin = await getWorkspaceFirstAdmin(workspace);
      if (!firstAdmin) {
        logger.info(
          { action: "cancelling-trial", workspaceId: auth.workspace()?.sId },
          "No first adming found -- skipping email."
        );

        return;
      } else {
        await sendProactiveTrialCancelledEmail(firstAdmin.email);
      }

      await sendUserOperationMessage({
        logger,
        message: `Trial for workspace ${workspace.sId} cancelled proactively!`,
      });
    }
  }

  async getCheckoutUrlForUpgrade(
    owner: WorkspaceType,
    user: UserType,
    billingPeriod: BillingPeriod
  ): Promise<CheckoutUrlResult> {
    const planCode = owner.metadata?.isBusiness
      ? PRO_PLAN_SEAT_39_CODE
      : PRO_PLAN_SEAT_29_CODE;

    const proPlan = await SubscriptionResource.findPlanOrThrow(planCode);

    // We verify that the workspace is not already subscribed to the Pro plan product.
    const isAlreadyOnProPlan = await this.isSubscriptionOnProPlan(owner);
    if (isAlreadyOnProPlan) {
      throw new Error(
        `Cannot subscribe to plan ${planCode}: already subscribed to a Pro plan.`
      );
    }

    // We enter Stripe Checkout flow.
    const checkoutUrl = await createProPlanCheckoutSession({
      owner,
      user,
      billingPeriod,
      planCode,
      allowedPaymentMethods:
        owner.metadata?.isBusiness && planCode === PRO_PLAN_SEAT_39_CODE
          ? ["card", "sepa_debit"]
          : ["card"],
    });

    if (!checkoutUrl) {
      throw new Error(
        `Cannot subscribe to plan ${planCode}: error while creating Stripe Checkout session (URL is null).`
      );
    }

    return {
      checkoutUrl,
      plan: renderPlanFromModel({ plan: proPlan }),
    };
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

  async getPerSeatPricing(): Promise<SubscriptionPerSeatPricing | null> {
    if (!this.stripeSubscriptionId) {
      return null;
    }

    const stripeSubscription = await getStripeSubscription(
      this.stripeSubscriptionId,
      { expandPriceCurrencyOptions: true }
    );
    if (!stripeSubscription) {
      return null;
    }

    const { items, currency } = stripeSubscription;
    if (!items) {
      return null;
    }

    const [item] = items.data;
    if (!item || !item.price) {
      return null;
    }
    const { recurring, metadata } = item.price;

    if (
      !item.price.currency_options ||
      !item.price.currency_options[currency]
    ) {
      return null;
    }
    const { unit_amount: unitAmount } = item.price.currency_options[currency];

    const isPricedPerSeat = unitAmount !== null;
    if (!isPricedPerSeat) {
      return null;
    }

    if (
      !item.quantity ||
      !recurring ||
      (metadata && metadata[REPORT_USAGE_METADATA_KEY] !== "PER_SEAT")
    ) {
      return null;
    }

    return {
      seatPrice: unitAmount,
      seatCurrency: currency,
      billingPeriod: recurring.interval === "year" ? "yearly" : "monthly",
      quantity: item.quantity,
    };
  }

  getPlan(): PlanType {
    return Object.freeze({ ...this.plan });
  }

  isLegacyFreeNoPlan(): boolean {
    return this.id === FREE_NO_PLAN_SUBSCRIPTION_ID;
  }

  toJSON(): SubscriptionType {
    return {
      status: this.status ?? "active",
      trialing: this.trialing === true,
      sId: this.sId || null,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      stripeSubscriptionId: this.stripeSubscriptionId || null,
      startDate: this.startDate?.getTime() || null,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      endDate: this.endDate?.getTime() || null,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      paymentFailingSince: this.paymentFailingSince?.getTime() || null,
      plan: this.getPlan(),
      requestCancelAt: this.requestCancelAt?.getTime() ?? null,
    };
  }

  private static createFreeNoPlanSubscription(
    workspace: LightWorkspaceType
  ): Attributes<Subscription> {
    const now = new Date();
    return {
      id: FREE_NO_PLAN_SUBSCRIPTION_ID,
      sId: generateRandomModelSId(),
      status: "ended",
      workspaceId: workspace.id,
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

  private static async isStripeSubscriptionOnProPlan(
    owner: LightWorkspaceType,
    stripeSubscription: Stripe.Subscription
  ): Promise<boolean> {
    const { data: subscriptionItems } = stripeSubscription.items;
    const proPlanStripeProductId = getProPlanStripeProductId(owner);

    return subscriptionItems.some(
      (item) => item.plan.product === proPlanStripeProductId
    );
  }

  private static async findWorkspaceOrThrow(
    workspaceId: string
  ): Promise<LightWorkspaceType> {
    const workspace = await getWorkspaceInfos(workspaceId);

    if (!workspace) {
      throw new Error(`Cannot find workspace ${workspaceId}`);
    }

    return workspace;
  }

  private static async findPlanOrThrow(planCode: string): Promise<Plan> {
    const newPlan = await Plan.findOne({
      where: { code: planCode },
    });
    if (!newPlan) {
      throw new Error(`Cannot subscribe to plan ${planCode}: not found.`);
    }

    return newPlan;
  }

  /**
   * Helper method to end an active subscription if it exists
   * @param workspaceId The ID of the workspace
   * @returns The active subscription that was ended, or null if none existed
   */
  private static async endActiveSubscription(
    workspace: LightWorkspaceType
  ): Promise<Subscription | null> {
    const now = new Date();

    // Find active subscription
    const activeSubscription = await Subscription.findOne({
      where: { workspaceId: workspace.id, status: "active" },
    });

    if (activeSubscription) {
      await withTransaction(async (t) => {
        // End the subscription
        const endedStatus = activeSubscription.stripeSubscriptionId
          ? "ended_backend_only"
          : "ended";

        await activeSubscription.update(
          {
            status: endedStatus,
            endDate: now,
          },
          { transaction: t }
        );
      });

      // Notify Stripe that we ended the subscription if the subscription was a paid one
      if (activeSubscription?.stripeSubscriptionId) {
        await cancelSubscriptionImmediately({
          stripeSubscriptionId: activeSubscription.stripeSubscriptionId,
        });
      }
    }

    return activeSubscription;
  }

  private async isSubscriptionOnProPlan(
    owner: WorkspaceType
  ): Promise<boolean> {
    if (!this.stripeSubscriptionId) {
      return false;
    }
    const stripeSubscription = await getStripeSubscription(
      this.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      return false;
    }

    return SubscriptionResource.isStripeSubscriptionOnProPlan(
      owner,
      stripeSubscription
    );
  }
}
