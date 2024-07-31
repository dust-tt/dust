// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type {
  DataSourceType,
  DataSourceViewType,
  LightWorkspaceType,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { VaultResource } from "@app/lib/resources/vault_resource";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DataSourceViewResource
  extends ReadonlyAttributesType<DataSourceViewModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DataSourceViewResource extends BaseResource<DataSourceViewModel> {
  static model: ModelStatic<DataSourceViewModel> = DataSourceViewModel;

  constructor(
    model: ModelStatic<DataSourceViewModel>,
    blob: Attributes<DataSourceViewModel>
  ) {
    super(DataSourceViewModel, blob);
  }

  // Creation.

  private static async makeNew(blob: CreationAttributes<DataSourceViewModel>) {
    const key = await DataSourceViewResource.model.create(blob);

    return new this(DataSourceViewResource.model, key.get());
  }

  static async createViewInVaultFromDataSource(
    vault: VaultResource,
    dataSource: DataSourceType,
    parentsIn: string[]
  ) {
    return this.makeNew({
      dataSourceId: dataSource.id,
      parentsIn,
      workspaceId: vault.workspaceId,
    });
  }

  // For now, we create a default view for all data sources in the global vault.
  // This view has access to all documents, which is represented by null.
  static async createViewInVaultFromDataSourceIncludingAllDocuments(
    vault: VaultResource,
    dataSource: DataSourceResource
  ) {
    return this.makeNew({
      dataSourceId: dataSource.id,
      parentsIn: null,
      vaultId: vault.id,
      workspaceId: vault.workspaceId,
    });
  }

  // Fetching.

  static async listByWorkspace(auth: Authenticator) {
    const blobs = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return blobs.map((b) => new this(this.model, b.get()));
  }

  static async listForDataSourcesInVault(
    owner: LightWorkspaceType,
    dataSources: DataSourceResource[],
    vault: VaultResource,
    { transaction }: { transaction?: Transaction } = {}
  ) {
    const blobs = await this.model.findAll({
      where: {
        workspaceId: owner.id,
        dataSourceId: dataSources.map((ds) => ds.id),
        vaultId: vault.id,
      },
      transaction,
    });

    return blobs.map((b) => new this(this.model, b.get()));
  }

  static async fetchById(auth: Authenticator, id: string) {
    const fileModelId = getResourceIdFromSId(id);
    if (!fileModelId) {
      return null;
    }

    const blob = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: fileModelId,
      },
    });
    if (!blob) {
      return null;
    }

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return new this(this.model, blob.get());
  }

  // Deletion.

  async delete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  static async deleteAllForWorkspace(
    auth: Authenticator,
    transaction?: Transaction
  ) {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });
  }

  static async deleteForDataSource(
    auth: Authenticator,
    dataSource: DataSourceResource
  ) {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        dataSourceId: dataSource.id,
      },
    });
  }

  get sId(): string {
    return DataSourceViewResource.modelIdToSId({
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
    return makeSId("data_source_view", {
      id,
      workspaceId,
    });
  }

  // Serialization logic.

  toJSON(): DataSourceViewType {
    return {
      createdAt: this.createdAt.getTime(),
      parentsIn: this.parentsIn,
      sId: this.sId,
      updatedAt: this.updatedAt.getTime(),
    };
  }
}
