// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type {
  DataSourceViewCategory,
  DataSourceViewKind,
  DataSourceViewType,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Err, formatUserFullName, Ok, removeNulls } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import { getDataSourceViewUsage } from "@app/lib/api/agent_data_sources";
import type { Authenticator } from "@app/lib/auth";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { User } from "@app/lib/models/user";
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

const getDataSourceCategory = (
  dataSourceResource: DataSourceResource
): DataSourceViewCategory => {
  if (isFolder(dataSourceResource)) {
    return "folder";
  }

  if (isWebsite(dataSourceResource)) {
    return "website";
  }

  return "managed";
};

export type FetchDataSourceViewOptions = {
  includeEditedBy?: boolean;
  limit?: number;
  order?: [string, "ASC" | "DESC"][];
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DataSourceViewResource
  extends ReadonlyAttributesType<DataSourceViewModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DataSourceViewResource extends ResourceWithVault<DataSourceViewModel> {
  static model: ModelStatic<DataSourceViewModel> = DataSourceViewModel;

  private ds?: DataSourceResource;
  readonly editedByUser?: Attributes<User>;

  constructor(
    model: ModelStatic<DataSourceViewModel>,
    blob: Attributes<DataSourceViewModel>,
    vault: VaultResource,
    { editedByUser }: { editedByUser?: Attributes<User> } = {}
  ) {
    super(DataSourceViewModel, blob, vault);

    this.editedByUser = editedByUser;
  }

  // Creation.

  private static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<DataSourceViewModel>, "vaultId">,
    vault: VaultResource,
    dataSource: DataSourceResource
  ) {
    const dataSourceView = await DataSourceViewResource.model.create({
      ...blob,
      editedByUserId: auth.getNonNullableUser().id,
      editedAt: new Date(),
      vaultId: vault.id,
    });

    const dsv = new this(
      DataSourceViewResource.model,
      dataSourceView.get(),
      vault
    );
    dsv.ds = dataSource;
    return dsv;
  }

  static async createViewInVaultFromDataSource(
    auth: Authenticator,
    vault: VaultResource,
    dataSource: DataSourceResource,
    parentsIn: string[] | null
  ) {
    return this.makeNew(
      auth,
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
    auth: Authenticator,
    vault: VaultResource,
    dataSource: DataSourceResource,
    kind: DataSourceViewKind = "default"
  ) {
    return this.makeNew(
      auth,
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

  private static getOptions(
    options?: FetchDataSourceViewOptions
  ): ResourceFindOptions<DataSourceViewModel> {
    const result: ResourceFindOptions<DataSourceViewModel> = {};

    if (options?.includeEditedBy) {
      result.includes = [
        {
          model: User,
          as: "editedByUser",
        },
      ];
    }

    if (options?.limit) {
      result.limit = options.limit;
    }

    if (options?.order) {
      result.order = options.order;
    }

    return result;
  }

  private static async baseFetch(
    auth: Authenticator,
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions,
    options?: ResourceFindOptions<DataSourceViewModel>
  ) {
    const dataSourceViews = await this.baseFetchWithAuthorization(auth, {
      ...this.getOptions(fetchDataSourceViewOptions),
      ...options,
    });

    const dataSourceIds = removeNulls(
      dataSourceViews.map((ds) => ds.dataSourceId)
    );

    const dataSources = await DataSourceResource.fetchByModelIds(
      auth,
      dataSourceIds,
      {
        includeEditedBy: fetchDataSourceViewOptions?.includeEditedBy,
      }
    );

    for (const dsv of dataSourceViews) {
      dsv.ds = dataSources.find((ds) => ds.id === dsv.dataSourceId);
    }

    return dataSourceViews;
  }

  static async listByWorkspace(
    auth: Authenticator,
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions
  ) {
    const dataSourceViews = await this.baseFetch(
      auth,
      fetchDataSourceViewOptions
    );

    return dataSourceViews.filter(
      (dsv) => auth.isAdmin() || auth.hasPermission([dsv.vault.acl()], "read")
    );
  }

  static async listByVault(
    auth: Authenticator,
    vault: VaultResource,
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions
  ) {
    return this.listByVaults(auth, [vault], fetchDataSourceViewOptions);
  }

  static async listByVaults(
    auth: Authenticator,
    vaults: VaultResource[],
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions
  ) {
    return this.baseFetch(auth, fetchDataSourceViewOptions, {
      where: {
        vaultId: vaults.map((v) => v.id),
      },
    });
  }

  static async listForDataSourcesInVault(
    auth: Authenticator,
    dataSources: DataSourceResource[],
    vault: VaultResource,
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions
  ) {
    return this.baseFetch(auth, fetchDataSourceViewOptions, {
      where: {
        dataSourceId: dataSources.map((ds) => ds.id),
        vaultId: vault.id,
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string,
    fetchDataSourceViewOptions?: Omit<
      FetchDataSourceViewOptions,
      "limit" | "order"
    >
  ) {
    const [dataSourceView] = await DataSourceViewResource.fetchByIds(
      auth,
      [id],
      fetchDataSourceViewOptions
    );

    return dataSourceView ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    fetchDataSourceViewOptions?: Omit<
      FetchDataSourceViewOptions,
      "limit" | "order"
    >
  ) {
    const dataSourceViewModelIds = removeNulls(ids.map(getResourceIdFromSId));

    const dataSourceViews = await this.baseFetch(
      auth,
      fetchDataSourceViewOptions,
      {
        where: {
          id: {
            [Op.in]: dataSourceViewModelIds,
          },
        },
      }
    );

    return dataSourceViews ?? null;
  }

  static async fetchByModelIds(auth: Authenticator, ids: ModelId[]) {
    const dataSourceViews = await this.baseFetch(
      auth,
      {},
      {
        where: {
          id: {
            [Op.in]: ids,
          },
        },
      }
    );

    return dataSourceViews ?? null;
  }

  // Updating.

  async setEditedBy(auth: Authenticator) {
    await this.update({
      editedByUserId: auth.getNonNullableUser().id,
      editedAt: new Date(),
    });
  }

  private makeEditedBy(
    editedByUser: Attributes<User> | undefined,
    editedAt: Date | undefined
  ) {
    if (!editedByUser || !editedAt) {
      return undefined;
    }

    return {
      editedByUser: {
        editedAt: editedAt.getTime(),
        fullName: formatUserFullName(editedByUser),
        imageUrl: editedByUser.imageUrl,
        email: editedByUser.email,
        userId: editedByUser.sId,
      },
    };
  }

  async updateParents(
    parentsIn: string[] | null
  ): Promise<Result<undefined, Error>> {
    await this.update({ parentsIn });

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
    // TODO(GROUPS_INFRA) Delete agent_data_source_configuration and agent_tables_query_configuration.
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
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
      ...this.makeEditedBy(this.editedByUser, this.editedAt),
    };
  }

  toViewFilter() {
    return {
      parents: {
        in: this.parentsIn,
        not: null,
      },
      tags: null,
      timestamp: null,
    };
  }
}
