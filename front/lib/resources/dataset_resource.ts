import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { AppResource } from "@app/lib/resources/app_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DatasetModel } from "@app/lib/resources/storage/models/apps";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { DatasetType, Result } from "@app/types";
import { Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface DatasetResource extends ReadonlyAttributesType<DatasetModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DatasetResource extends BaseResource<DatasetModel> {
  static model: ModelStatic<DatasetModel> = DatasetModel;

  constructor(
    model: ModelStatic<DatasetModel>,
    blob: Attributes<DatasetModel>
  ) {
    super(DatasetModel, blob);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<DatasetModel>, "appId">,
    app: AppResource
  ) {
    const dataset = await DatasetModel.create({
      ...blob,
      appId: app.id,
    });

    return new this(DatasetModel, dataset.get());
  }

  // Deletion.

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    await DatasetModel.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
    return new Ok(undefined);
  }

  static async deleteForApp(
    auth: Authenticator,
    app: AppResource,
    t?: Transaction
  ): Promise<Result<undefined, Error>> {
    await DatasetModel.destroy({
      where: {
        appId: app.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction: t,
    });
    return new Ok(undefined);
  }

  static async listForApp(auth: Authenticator, app: AppResource) {
    const datasets = await DatasetModel.findAll({
      where: {
        appId: app.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return datasets.map((dataset) => new this(DatasetModel, dataset.get()));
  }

  // Serialization.

  toJSON(): DatasetType {
    return {
      name: this.name,
      description: this.description,
      schema: this.schema,
      data: null,
    };
  }
}
