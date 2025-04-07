import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import {
  FREE_NO_PLAN_CODE,
  FREE_TEST_PLAN_CODE,
  FREE_UPGRADED_PLAN_CODE,
} from "@app/lib/plans/plan_codes";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { Subscription } from "@app/lib/resources/storage/models/plans";
import { PlanModel } from "@app/lib/resources/storage/models/plans";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { PlanType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

export type PlanAttributes = Omit<
  Attributes<PlanModel>,
  "id" | "createdAt" | "updatedAt"
>;

/**
 * We have 3 categories of plans:
 * - Free: plans with no paid subscription.
 * - Pro: plans with a paid subscription, not tailored. -> i.e. the same plan is used by all Pro
 *        workspaces.
 * - Entreprise: plans with a paid subscription, tailored to the needs of the entreprise.
 *               -> i.e. we will have one plan per "Entreprise".
 *
 * This file about Free plans.
 */

/**
 * FREE_NO_PLAN is the plan used for workspaces that are being created and have not yet subscribed
 * to a plan (card has not been entered yet for free trial). It prevents using the product entirely.
 */
export const FREE_NO_PLAN_DATA: PlanAttributes = {
  code: FREE_NO_PLAN_CODE,
  name: "No Plan",
  maxMessages: 0,
  maxMessagesTimeframe: "lifetime",
  maxUsersInWorkspace: 1,
  maxVaultsInWorkspace: 1,
  isSlackbotAllowed: false,
  isManagedConfluenceAllowed: false,
  isManagedSlackAllowed: false,
  isManagedNotionAllowed: false,
  isManagedGoogleDriveAllowed: false,
  isManagedGithubAllowed: false,
  isManagedIntercomAllowed: false,
  isManagedWebCrawlerAllowed: false,
  isManagedSalesforceAllowed: false,
  maxDataSourcesCount: 0,
  maxDataSourcesDocumentsCount: 0,
  maxDataSourcesDocumentsSizeMb: 0,
  trialPeriodDays: 0,
  canUseProduct: false,
};

export const FREE_NO_PLAN_SUBSCRIPTION_ID = -1;

/**
 * FREE plans are stored in the database.
 * We can update existing plans or add new one but never remove anything from this list.
 */
export const FREE_PLANS_DATA: PlanAttributes[] = [
  {
    code: FREE_TEST_PLAN_CODE,
    name: "Free",
    maxMessages: 50,
    maxMessagesTimeframe: "lifetime",
    maxUsersInWorkspace: 1,
    maxVaultsInWorkspace: 1,
    isSlackbotAllowed: false,
    isManagedConfluenceAllowed: false,
    isManagedSlackAllowed: false,
    isManagedNotionAllowed: false,
    isManagedGoogleDriveAllowed: false,
    isManagedGithubAllowed: false,
    isManagedIntercomAllowed: false,
    isManagedWebCrawlerAllowed: false,
    isManagedSalesforceAllowed: false,
    maxDataSourcesCount: 5,
    maxDataSourcesDocumentsCount: 10,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 0,
    canUseProduct: false,
  },
  {
    code: FREE_UPGRADED_PLAN_CODE,
    name: "Free Trial",
    maxMessages: -1,
    maxUsersInWorkspace: -1,
    maxVaultsInWorkspace: -1,
    maxMessagesTimeframe: "lifetime",
    isSlackbotAllowed: true,
    isManagedConfluenceAllowed: true,
    isManagedSlackAllowed: true,
    isManagedNotionAllowed: true,
    isManagedGoogleDriveAllowed: true,
    isManagedGithubAllowed: true,
    isManagedIntercomAllowed: true,
    isManagedWebCrawlerAllowed: true,
    isManagedSalesforceAllowed: true,
    maxDataSourcesCount: -1,
    maxDataSourcesDocumentsCount: -1,
    maxDataSourcesDocumentsSizeMb: 2,
    trialPeriodDays: 0,
    canUseProduct: true,
  },
];

// These limits are applied to all plans during the trial period.
export const TRIAL_LIMITS: Partial<PlanAttributes> = {
  maxUsersInWorkspace: 5,
  maxMessages: 100,
  maxMessagesTimeframe: "day",
};

export function getTrialVersionForPlan(plan: PlanModel): PlanAttributes {
  return {
    ...plan.get(),
    ...TRIAL_LIMITS,
  };
}

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface PlanResource extends ReadonlyAttributesType<PlanModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PlanResource extends BaseResource<PlanModel> {
  static model: ModelStatic<PlanModel> = PlanModel;

  constructor(model: ModelStatic<PlanModel>, blob: Attributes<PlanModel>) {
    super(PlanModel, blob);
  }

  static async makeNew(blob: CreationAttributes<PlanModel>) {
    const plan = await this.model.create(blob);
    return new this(this.model, plan.get());
  }

  static async upsertByPlanCode(blob: CreationAttributes<PlanModel>) {
    const existing = await this.model.findOne({
      where: { code: blob.code },
    });

    if (existing) {
      await existing.update(blob);
      return new Ok(new PlanResource(this.model, existing.get()));
    }
    const plan = await PlanResource.makeNew(blob);
    return new Ok(plan);
  }

  static async fetchByPlanCode(planCode: string): Promise<PlanResource | null> {
    const plan = await this.model.findOne({
      where: {
        code: planCode,
      },
    });
    return plan ? new this(this.model, plan.get()) : null;
  }

  // fetch all plans associated to a given set of subscriptions
  static async fetchBySubscriptionModels(
    subscriptions: Subscription[]
  ): Promise<PlanResource[] | null> {
    const plans = await this.model.findAll({
      where: {
        id: subscriptions.map((s) => s.planId),
      },
    });
    return plans.map((plan) => new this(this.model, plan.get()));
  }

  static async fetchAll(
    auth: Authenticator,
    { limit, order }: ResourceFindOptions<PlanModel> = {}
  ): Promise<PlanResource[]> {
    if (!auth.isDustSuperUser()) {
      throw new Error("Cannot fetch all plans : not allowed.");
    }

    const plans = await this.model.findAll({
      limit,
      order,
    });
    return plans.map((plan) => new this(this.model, plan.get()));
  }

  static async fetchFirst(): Promise<PlanResource | null> {
    const plan = await this.model.findOne({});
    return plan ? new this(this.model, plan.get()) : null;
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

  // This function is used to set the message limits for a given plan.
  static async setMessageLimitsForPlan(
    data: Pick<Attributes<PlanModel>, "maxMessages" | "maxMessagesTimeframe">,
    planCode: PlanModel["code"]
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.update(data, {
        where: { code: planCode },
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  // This function is used to reset the plan with new data.
  async updateByPlanCode(
    planCode: string,
    planData: Omit<Attributes<PlanModel>, "id" | "createdAt" | "updatedAt">
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.update(planData, {
        where: {
          code: planCode,
        },
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  // Serialization.

  toJSON(): PlanType {
    const blob: PlanType = {
      code: this.code,
      name: this.name,
      limits: {
        assistant: {
          isSlackBotAllowed: this.isSlackbotAllowed,
          maxMessages: this.maxMessages,
          maxMessagesTimeframe: this.maxMessagesTimeframe,
        },
        connections: {
          isConfluenceAllowed: this.isManagedConfluenceAllowed,
          isSlackAllowed: this.isManagedSlackAllowed,
          isNotionAllowed: this.isManagedNotionAllowed,
          isGoogleDriveAllowed: this.isManagedGoogleDriveAllowed,
          isGithubAllowed: this.isManagedGithubAllowed,
          isIntercomAllowed: this.isManagedIntercomAllowed,
          isWebCrawlerAllowed: this.isManagedWebCrawlerAllowed,
          isSalesforceAllowed: this.isManagedSalesforceAllowed,
        },
        dataSources: {
          count: this.maxDataSourcesCount,
          documents: {
            count: this.maxDataSourcesDocumentsCount,
            sizeMb: this.maxDataSourcesDocumentsSizeMb,
          },
        },
        users: {
          maxUsers: this.maxUsersInWorkspace,
        },
        vaults: {
          maxVaults: this.maxVaultsInWorkspace,
        },
        canUseProduct: this.canUseProduct,
      },
      trialPeriodDays: this.trialPeriodDays,
    };
    return blob;
  }
}
