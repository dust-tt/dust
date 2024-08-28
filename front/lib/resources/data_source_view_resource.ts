// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type {
  DataSourceViewKind,
  DataSourceViewType,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Err, Ok, removeNulls } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import { getDataSourceViewUsage } from "@app/lib/api/agent_data_sources";
import { getDataSourceCategory } from "@app/lib/api/vaults";
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
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { VaultResource } from "@app/lib/resources/vault_resource";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DataSourceViewResource
  extends ReadonlyAttributesType<DataSourceViewModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DataSourceViewResource extends ResourceWithVault<DataSourceViewModel> {
  static model: ModelStatic<DataSourceViewModel> = DataSourceViewModel;

  private ds?: DataSourceResource;

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
    vault: VaultResource,
    dataSource: DataSourceResource
  ) {
    const key = await DataSourceViewResource.model.create({
      ...blob,
      vaultId: vault.id,
    });
    const dsv = new this(DataSourceViewResource.model, key.get(), vault);
    dsv.ds = dataSource;
    return dsv;
  }

  static async createViewInVaultFromDataSource(
    vault: VaultResource,
    dataSource: DataSourceResource,
    parentsIn: string[] | null
  ) {
    return this.makeNew(
      {
        dataSourceId: dataSource.id,
        parentsIn,
        workspaceId: vault.workspaceId,
        kind: "custom",
      },
      vault,
      dataSource
    );
  }

  // This view has access to all documents, which is represented by null.
  static async createViewInVaultFromDataSourceIncludingAllDocuments(
    vault: VaultResource,
    dataSource: DataSourceResource,
    kind: DataSourceViewKind = "default"
  ) {
    return this.makeNew(
      {
        dataSourceId: dataSource.id,
        parentsIn: null,
        workspaceId: vault.workspaceId,
        kind,
      },
      vault,
      dataSource
    );
  }

  // Fetching.

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<DataSourceViewModel>
  ) {
    const dataSourceViews = await this.baseFetchWithAuthorization(
      auth,
      options
    );

    const dataSourceIds = removeNulls(
      dataSourceViews.map((ds) => ds.dataSourceId)
    );

    const dataSources = await DataSourceResource.fetchByModelIds(
      auth,
      dataSourceIds
    );

    for (const dsv of dataSourceViews) {
      dsv.ds = dataSources.find((ds) => ds.id === dsv.dataSourceId);
    }

    return dataSourceViews;
  }

  static async listByWorkspace(auth: Authenticator) {
    const dataSourceViews = await this.baseFetch(auth);

    return dataSourceViews.filter(
      (dsv) => auth.isAdmin() || auth.hasPermission([dsv.vault.acl()], "read")
    );
  }

  static async listByVault(auth: Authenticator, vault: VaultResource) {
    return this.listByVaults(auth, [vault]);
  }

  static async listByVaults(auth: Authenticator, vaults: VaultResource[]) {
    return this.baseFetch(auth, {
      where: {
        vaultId: vaults.map((v) => v.id),
      },
    });
  }

  static async listForDataSourcesInVault(
    auth: Authenticator,
    dataSources: DataSourceResource[],
    vault: VaultResource
  ) {
    return this.baseFetch(auth, {
      where: {
        dataSourceId: dataSources.map((ds) => ds.id),
        vaultId: vault.id,
      },
    });
  }

  static async fetchById(auth: Authenticator, id: string) {
    const fileModelId = getResourceIdFromSId(id);
    if (!fileModelId) {
      return null;
    }

    const [dataSource] = await this.baseFetch(auth, {
      where: {
        id: fileModelId,
      },
    });

    return dataSource ?? null;
  }

  // Updating.
  async updateParents(
    auth: Authenticator,
    parentsIn: string[] | null
  ): Promise<Result<undefined, Error>> {
    const [, affectedRows] = await this.model.update(
      {
        parentsIn,
      },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        returning: true,
      }
    );
    Object.assign(this, affectedRows[0].get());

    return new Ok(undefined);
  }

  // TODO(GROUPS_INFRA) Remove once backfilled.
  async updateKind(auth: Authenticator, kind: DataSourceViewKind) {
    await this.model.update(
      {
        kind,
      },
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
      }
    );

    return new Ok(undefined);
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

  // Getters.

  get dataSource(): DataSourceResource {
    return this.ds as DataSourceResource;
  }

  isDefault(): boolean {
    return this.kind === "default";
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

  getUsagesByAgents = async (auth: Authenticator) => {
    return getDataSourceViewUsage({ auth, dataSourceView: this.toJSON() });
  };

  // Permissions.

  canRead(auth: Authenticator) {
    return auth.isAdmin() || auth.hasPermission([this.vault.acl()], "read");
  }

  // Serialization.

  toJSON(): DataSourceViewType {
    return {
      category: getDataSourceCategory(this.dataSource),
      createdAt: this.createdAt.getTime(),
      dataSource: this.dataSource.toJSON(),
      id: this.id,
      kind: this.kind,
      parentsIn: this.parentsIn,
      sId: this.sId,
      updatedAt: this.updatedAt.getTime(),
      usage: 0,
      vaultId: this.vault.sId,
    };
  }
}
