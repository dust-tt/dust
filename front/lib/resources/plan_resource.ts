import assert from "assert";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { TRIAL_LIMITS } from "@app/lib/plans/trial";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { Subscription } from "@app/lib/resources/storage/models/plans";
import { PlanModel } from "@app/lib/resources/storage/models/plans";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { PlanType, Result } from "@app/types";
import { Ok } from "@app/types";

export type PlanAttributes = Omit<
  Attributes<PlanModel>,
  "id" | "createdAt" | "updatedAt"
>;

// This function is used to get the trial version of a plan.
export function getTrialVersionForPlan(plan: PlanModel): PlanModel {
  return PlanModel.build({
    ...plan.get(),
    ...TRIAL_LIMITS,
  });
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

  // Build a new plan resource from a given plan model. Not saved to the database.
  static fromModel(plan: PlanModel): PlanResource {
    return new PlanResource(PlanModel, plan.get());
  }

  // Build a new plan resource from a given set of attributes. Not saved to the database.
  static fromAttributes(planAttributes: PlanAttributes): PlanResource {
    return this.fromModel(PlanModel.build(planAttributes));
  }

  // Create a new plan resource in the database.
  static async makeNew(blob: CreationAttributes<PlanModel>) {
    const plan = await this.model.create(blob);
    return new this(this.model, plan.get());
  }

  // Upsert a new plan resource in the database.
  static async upsertByPlanCode(
    blob: CreationAttributes<PlanModel>
  ): Promise<Result<PlanResource, Error>> {
    const existing = await this.fetchByPlanCode(blob.code);

    if (existing) {
      await existing.update(blob);
      return new Ok(existing);
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

  // Fetch all plans associated to a given set of subscriptions
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

  static async listAll(
    auth: Authenticator,
    { limit, order }: ResourceFindOptions<PlanModel> = {}
  ): Promise<PlanResource[]> {
    assert(auth.isDustSuperUser(), "Cannot fetch all plans: not allowed");
    const plans = await this.model.findAll({
      limit,
      order,
    });
    return plans.map((plan) => new this(this.model, plan.get()));
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

  // Set the message limits for a given plan.
  async setMessageLimitsForPlan(
    data: Pick<Attributes<PlanModel>, "maxMessages" | "maxMessagesTimeframe">
  ): Promise<[affectedCount: number]> {
    return this.update(data);
  }

  // Update the plan with new data.
  async setPlanData(
    planData: Omit<Attributes<PlanModel>, "id" | "createdAt" | "updatedAt">
  ): Promise<[affectedCount: number]> {
    return this.update(planData);
  }

  // Serialization.
  toJSON(): PlanType {
    return {
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
  }
}
