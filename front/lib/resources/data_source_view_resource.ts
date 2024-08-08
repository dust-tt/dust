// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type {
  DataSourceType,
  DataSourceViewType,
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
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { ResourceWithVault } from "@app/lib/resources/resource_with_vault";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { VaultResource } from "@app/lib/resources/vault_resource";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DataSourceViewResource
  extends ReadonlyAttributesType<DataSourceViewModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DataSourceViewResource extends ResourceWithVault<DataSourceViewModel> {
  static model: ModelStatic<DataSourceViewModel> = DataSourceViewModel;

  constructor(
    model: ModelStatic<DataSourceViewModel>,
    blob: Attributes<DataSourceViewModel>,
    vault: VaultResource
  ) {
    super(DataSourceViewModel, blob, vault);
  }

  // Creation.

  private static async makeNew(
    blob: Omit<CreationAttributes<DataSourceViewModel>, "vaultId">,
    vault: VaultResource
  ) {
    const key = await DataSourceViewResource.model.create({
      ...blob,
      vaultId: vault.id,
    });

    return new this(DataSourceViewResource.model, key.get(), vault);
  }

  static async createViewInVaultFromDataSource(
    vault: VaultResource,
    dataSource: DataSourceType,
    parentsIn: string[]
  ) {
    return this.makeNew(
      {
        dataSourceId: dataSource.id,
        parentsIn,
        workspaceId: vault.workspaceId,
      },
      vault
    );
  }

  // For now, we create a default view for all data sources in the global vault.
  // This view has access to all documents, which is represented by null.
  static async createViewInVaultFromDataSourceIncludingAllDocuments(
    vault: VaultResource,
    dataSource: DataSourceResource
  ) {
    return this.makeNew(
      {
        dataSourceId: dataSource.id,
        parentsIn: null,
        workspaceId: vault.workspaceId,
      },
      vault
    );
  }

  // Fetching.

  static async listByWorkspace(auth: Authenticator) {
    return this.baseFetchWithAuthorization(auth);
  }

  static async listForDataSourcesInVault(
    auth: Authenticator,
    dataSources: DataSourceResource[],
    vault: VaultResource
  ) {
    return this.baseFetchWithAuthorization(auth, {
      where: {
        dataSourceId: dataSources.map((ds) => ds.id),
        vaultId: vault.id,
      },
    });
  }

  static async listForDataSource(
    auth: Authenticator,
    dataSource: DataSourceResource
  ) {
    return this.baseFetchWithAuthorization(auth, {
      where: {
        dataSourceId: dataSource.id,
      },
    });
  }

  static async fetchById(auth: Authenticator, id: string) {
    const fileModelId = getResourceIdFromSId(id);
    if (!fileModelId) {
      return null;
    }

    const [dataSource] = await this.baseFetchWithAuthorization(auth, {
      where: {
        id: fileModelId,
      },
    });

    return dataSource ?? null;
  }

  // Peer fetching.

  async fetchDataSource(
    auth: Authenticator
  ): Promise<DataSourceResource | null> {
    return DataSourceResource.fetchByModelIdWithAuth(auth, this.dataSourceId);
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
    dataSource: DataSourceResource,
    transaction?: Transaction
  ) {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        dataSourceId: dataSource.id,
      },
      transaction,
    });
  }

  // sId logic.

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

  static isDataSourceViewSId(sId: string): boolean {
    return isResourceSId("data_source_view", sId);
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
