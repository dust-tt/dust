import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { CreditUsageConfigurationModel } from "@app/lib/resources/storage/models/credit_usage_configurations";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";

import type { ModelStaticWorkspaceAware } from "./storage/wrappers/workspace_models";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface CreditUsageConfigurationResource
  extends ReadonlyAttributesType<CreditUsageConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class CreditUsageConfigurationResource extends BaseResource<CreditUsageConfigurationModel> {
  static model: ModelStaticWorkspaceAware<CreditUsageConfigurationModel> =
    CreditUsageConfigurationModel;

  constructor(
    _model: ModelStaticWorkspaceAware<CreditUsageConfigurationModel>,
    blob: Attributes<CreditUsageConfigurationModel>
  ) {
    super(CreditUsageConfigurationModel, blob);
  }

  get sId(): string {
    return CreditUsageConfigurationResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("credit_usage_configuration", {
      id,
      workspaceId,
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<CreditUsageConfigurationModel>
  ): Promise<CreditUsageConfigurationResource[]> {
    const { where, ...rest } = options ?? {};
    const rows = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...rest,
    });
    return rows.map((r) => new this(this.model, r.get()));
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<CreditUsageConfigurationModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<CreditUsageConfigurationResource, Error>> {
    const configuration = await this.model.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new Ok(new this(this.model, configuration.get()));
  }

  static async fetchByWorkspaceId(
    auth: Authenticator
  ): Promise<CreditUsageConfigurationResource | null> {
    const rows = await this.baseFetch(auth, { limit: 1 });
    return rows[0] ?? null;
  }

  /**
   * Internal, auth-less fetch by workspace model id. For system flows (Temporal
   * activities, Metronome webhook dispatchers, reconcile) that operate on a
   * workspace they don't have an `Authenticator` for. Request-scoped code should
   * prefer `fetchByWorkspaceId(auth)`.
   */
  static async fetchByWorkspaceModelId(
    workspaceModelId: ModelId
  ): Promise<CreditUsageConfigurationResource | null> {
    const row = await this.model.findOne({
      where: { workspaceId: workspaceModelId },
    });
    return row ? new this(this.model, row.get()) : null;
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<CreditUsageConfigurationResource | null> {
    const modelId = getResourceIdFromSId(sId);
    if (!modelId) {
      return null;
    }

    const rows = await this.baseFetch(auth, {
      where: { id: modelId },
    });

    return rows[0] ?? null;
  }

  async updateConfiguration(
    auth: Authenticator,
    blob: Partial<{
      defaultDiscountPercent: number;
      paygEnabled: boolean;
      usageCapCredits: number | null;
      allowMemberUpgradeRequests: boolean;
      upgradeRequestEmailEnabled: boolean;
      defaultPoolCapAwuCredits: number | null;
      programmaticMonthlyCapAwuCredits: number | null;
      autoSeatUpgradeEnabled: boolean;
      balanceThresholdAwuCredits: number | null;
      topUpEnabled: boolean;
      autoInvoiceFinalizationEnabled: boolean;
    }>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    const [_affectedCount, affectedRows] = await this.model.update(blob, {
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
      returning: true,
    });

    if (affectedRows[0]) {
      Object.assign(this, affectedRows[0].get());
      return new Ok(undefined);
    } else {
      return new Err(
        new Error("Configuration not found or not authorized to update")
      );
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(undefined);
  }

  /**
   * Delete all credit-usage-configuration rows for a workspace. Called during
   * workspace deletion/scrubbing to satisfy the `ON DELETE RESTRICT` FK before
   * the workspace row itself is removed.
   */
  static async deleteAllForWorkspace(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await this.model.destroy({
      where: { workspaceId: auth.getNonNullableWorkspace().id },
      transaction,
    });
  }

  toJSON() {
    return {
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      defaultDiscountPercent: this.defaultDiscountPercent,
      paygEnabled: this.paygEnabled,
      usageCapCredits: this.usageCapCredits,
      allowMemberUpgradeRequests: this.allowMemberUpgradeRequests,
      upgradeRequestEmailEnabled: this.upgradeRequestEmailEnabled,
      defaultPoolCapAwuCredits: this.defaultPoolCapAwuCredits,
      programmaticMonthlyCapAwuCredits: this.programmaticMonthlyCapAwuCredits,
      balanceThresholdAwuCredits: this.balanceThresholdAwuCredits,
      topUpEnabled: this.topUpEnabled,
    };
  }

  toLogJSON() {
    return {
      sId: this.sId,
      workspaceId: this.workspaceId,
      defaultDiscountPercent: this.defaultDiscountPercent,
      paygEnabled: String(this.paygEnabled),
      usageCapCredits: this.usageCapCredits,
      allowMemberUpgradeRequests: String(this.allowMemberUpgradeRequests),
      upgradeRequestEmailEnabled: String(this.upgradeRequestEmailEnabled),
      defaultPoolCapAwuCredits: this.defaultPoolCapAwuCredits,
      programmaticMonthlyCapAwuCredits: this.programmaticMonthlyCapAwuCredits,
      balanceThresholdAwuCredits: this.balanceThresholdAwuCredits,
      topUpEnabled: String(this.topUpEnabled),
      autoInvoiceFinalizationEnabled: String(
        this.autoInvoiceFinalizationEnabled
      ),
    };
  }
}
