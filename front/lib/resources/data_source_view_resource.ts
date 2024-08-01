// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type {
  ACLType,
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
  WhereOptions,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import { VaultResource } from "@app/lib/resources/vault_resource";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DataSourceViewResource
  extends ReadonlyAttributesType<DataSourceViewModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DataSourceViewResource extends BaseResource<DataSourceViewModel> {
  static model: ModelStatic<DataSourceViewModel> = DataSourceViewModel;

  readonly vault: VaultResource;

  constructor(
    model: ModelStatic<DataSourceViewModel>,
    blob: Attributes<DataSourceViewModel>,
    vault: VaultResource
  ) {
    super(DataSourceViewModel, blob);

    this.vault = vault;
  }

  // Creation.

  private static async makeNew(
    blob: Omit<CreationAttributes<DataSourceViewModel>, "vaultId">,
    vault: VaultResource
  ) {
    const key = await DataSourceViewResource.model.create(blob);

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

  private static async baseFetch(
    auth: Authenticator,
    where: Omit<WhereOptions<DataSourceViewModel>, "workspaceId"> = {}
  ) {
    const blobs = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: [
        {
          model: VaultResource.model,
          as: "vault",
        },
      ],
    });

    return blobs.map((b) => {
      const vault = new VaultResource(VaultResource.model, b.vault.get());

      return new this(this.model, b.get(), vault);
    });
  }

  static async listByWorkspace(auth: Authenticator) {
    return this.baseFetch(auth);
  }

  static async listForDataSourcesInVault(
    auth: Authenticator,
    dataSources: DataSourceResource[],
    vault: VaultResource
  ) {
    return this.baseFetch(auth, {
      dataSourceId: dataSources.map((ds) => ds.id),
      vaultId: vault.id,
    });
  }

  static async fetchById(auth: Authenticator, id: string) {
    const fileModelId = getResourceIdFromSId(id);
    if (!fileModelId) {
      return null;
    }

    const [dataSource] = await this.baseFetch(auth, { id: fileModelId });

    return dataSource ?? null;
  }

  // Peer fetching.

  // async fetchDataSource(
  //   auth: Authenticator
  // ): Promise<DataSourceResource | null> {
  //   return DataSourceResource.fetchByModelId(auth, this.dataSourceId);
  // }

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

  // Permissions.

  acl(): ACLType {
    return this.vault.acl();
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
