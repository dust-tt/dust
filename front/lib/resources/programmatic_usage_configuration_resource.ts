import type { Attributes, CreationAttributes, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { ProgrammaticUsageConfigurationModel } from "@app/lib/resources/storage/models/programmatic_usage_configurations";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";

import type { ModelStaticWorkspaceAware } from "./storage/wrappers/workspace_models";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProgrammaticUsageConfigurationResource
  extends ReadonlyAttributesType<ProgrammaticUsageConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProgrammaticUsageConfigurationResource extends BaseResource<ProgrammaticUsageConfigurationModel> {
  static model: ModelStaticWorkspaceAware<ProgrammaticUsageConfigurationModel> =
    ProgrammaticUsageConfigurationModel;

  constructor(
    _model: ModelStaticWorkspaceAware<ProgrammaticUsageConfigurationModel>,
    blob: Attributes<ProgrammaticUsageConfigurationModel>
  ) {
    super(ProgrammaticUsageConfigurationModel, blob);
  }

  get sId(): string {
    return ProgrammaticUsageConfigurationResource.modelIdToSId({
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
    return makeSId("programmatic_usage_configuration", {
      id,
      workspaceId,
    });
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<ProgrammaticUsageConfigurationModel>
  ): Promise<ProgrammaticUsageConfigurationResource[]> {
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
    blob: CreationAttributes<ProgrammaticUsageConfigurationModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<ProgrammaticUsageConfigurationResource, Error>> {
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
  ): Promise<ProgrammaticUsageConfigurationResource | null> {
    const rows = await this.baseFetch(auth, { limit: 1 });
    return rows[0] ?? null;
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<ProgrammaticUsageConfigurationResource | null> {
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
      freeCreditCents: number | null;
      defaultDiscountPercent: number;
      paygCapCents: number | null;
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

  toJSON() {
    return {
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      freeCreditCents: this.freeCreditCents,
      defaultDiscountPercent: this.defaultDiscountPercent,
      paygCapCents: this.paygCapCents,
    };
  }

  toLogJSON() {
    return {
      sId: this.sId,
      workspaceId: this.workspaceId,
      freeCreditCents: this.freeCreditCents,
      defaultDiscountPercent: this.defaultDiscountPercent,
      paygCapCents: this.paygCapCents,
    };
  }

  static async deleteAllForWorkspace(auth: Authenticator) {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }
}
