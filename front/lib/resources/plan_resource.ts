import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { Subscription } from "@app/lib/resources/storage/models/plans";
import { PlanModel } from "@app/lib/resources/storage/models/plans";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface PlanResource extends ReadonlyAttributesType<PlanModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PlanResource extends BaseResource<PlanModel> {
  static model: ModelStatic<PlanModel> = PlanModel;
  //TODO : understand when to use this.model vs PlanModel

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
    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  // This function is used to set the message limits for a given plan.
  static async setMessageLimitsForPlanCode(
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
  async internalResetWithData(
    planData: Omit<Attributes<PlanModel>, "id" | "createdAt" | "updatedAt">
  ): Promise<Result<undefined, Error>> {
    try {
      // Ensure all required parameters are present
      const requiredParams = [
        "code",
        "name",
        "maxMessages",
        "maxMessagesTimeframe",
        "maxUsersInWorkspace",
        "maxVaultsInWorkspace",
        "isSlackbotAllowed",
        "isManagedConfluenceAllowed",
        "isManagedSlackAllowed",
        "isManagedNotionAllowed",
        "isManagedGoogleDriveAllowed",
        "isManagedGithubAllowed",
        "isManagedIntercomAllowed",
        "isManagedWebCrawlerAllowed",
        "isManagedSalesforceAllowed",
        "maxDataSourcesCount",
        "maxDataSourcesDocumentsCount",
        "maxDataSourcesDocumentsSizeMb",
        "trialPeriodDays",
        "canUseProduct",
      ];

      const missingParams = requiredParams.filter(
        (param) => !(param in planData)
      );
      if (missingParams.length > 0) {
        return new Err(
          new Error(`Missing required parameters: ${missingParams.join(", ")}`)
        );
      }

      await PlanModel.update(planData, {
        where: {
          code: planData.code,
        },
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }
}
