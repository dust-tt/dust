// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type {
  DataSourceViewCategory,
  DataSourceViewType,
  ModelId,
  PokeDataSourceViewType,
  Result,
} from "@dust-tt/types";
import { formatUserFullName, Ok, removeNulls } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import { getDataSourceViewUsage } from "@app/lib/api/agent_data_sources";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { User } from "@app/lib/models/user";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { ResourceWithVault } from "@app/lib/resources/resource_with_vault";
import { frontSequelize } from "@app/lib/resources/storage";
import type { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { VaultModel } from "@app/lib/resources/storage/models/vaults";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { VaultResource } from "@app/lib/resources/vault_resource";
import { getWorkspaceByModelId } from "@app/lib/workspace";

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
  includeDeleted?: boolean;
  includeEditedBy?: boolean;
  limit?: number;
  order?: [string, "ASC" | "DESC"][];
};

type AllowedSearchColumns = "vaultId" | "dataSourceId" | "kind" | "vaultKind";

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
    blob: Omit<
      CreationAttributes<DataSourceViewModel>,
      "editedAt" | "editedByUserId" | "vaultId"
    >,
    vault: VaultResource,
    dataSource: DataSourceResource,
    transaction?: Transaction
  ) {
    const dataSourceView = await DataSourceViewResource.model.create(
      {
        ...blob,
        editedByUserId: auth.getNonNullableUser().id,
        editedAt: new Date(),
        vaultId: vault.id,
      },
      { transaction }
    );

    const dsv = new this(
      DataSourceViewResource.model,
      dataSourceView.get(),
      vault
    );
    dsv.ds = dataSource;
    return dsv;
  }

  static async createDataSourceAndDefaultView(
    auth: Authenticator,
    blob: Omit<CreationAttributes<DataSourceModel>, "editedAt" | "vaultId">,
    vault: VaultResource
  ) {
    return frontSequelize.transaction(async (transaction) => {
      const dataSource = await DataSourceResource.makeNew(
        auth,
        blob,
        vault,
        transaction
      );
      return this.createDefaultViewInVaultFromDataSourceIncludingAllDocuments(
        auth,
        dataSource.vault,
        dataSource,
        transaction
      );
    });
  }

  static async createViewInVaultFromDataSource(
    auth: Authenticator,
    vault: VaultResource,
    dataSource: DataSourceResource,
    parentsIn: string[]
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
  private static async createDefaultViewInVaultFromDataSourceIncludingAllDocuments(
    auth: Authenticator,
    vault: VaultResource,
    dataSource: DataSourceResource,
    transaction?: Transaction
  ) {
    return this.makeNew(
      auth,
      {
        dataSourceId: dataSource.id,
        parentsIn: null,
        workspaceId: vault.workspaceId,
        kind: "default",
      },
      vault,
      dataSource,
      transaction
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
    const { includeDeleted } = fetchDataSourceViewOptions ?? {};

    const dataSourceViews = await this.baseFetchWithAuthorization(auth, {
      ...this.getOptions(fetchDataSourceViewOptions),
      ...options,
      includeDeleted,
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
      fetchDataSourceViewOptions,
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      }
    );

    return dataSourceViews.filter((dsv) => dsv.canList(auth));
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

  static async listForDataSources(
    auth: Authenticator,
    dataSources: DataSourceResource[],
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions
  ) {
    return this.baseFetch(auth, fetchDataSourceViewOptions, {
      where: {
        dataSourceId: dataSources.map((ds) => ds.id),
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

  static async search(
    auth: Authenticator,
    searchParams: {
      [key in AllowedSearchColumns]: string | number | undefined;
    }
  ): Promise<DataSourceViewResource[]> {
    const owner = auth.workspace();
    if (!owner) {
      return [];
    }

    const whereClause: WhereOptions = {
      workspaceId: owner.id,
    };

    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "vaultKind") {
        whereClause[key] = value;
      } else {
        whereClause["$vault.kind$"] = searchParams.vaultKind;
      }
    }

    return this.baseFetch(
      auth,
      {},
      {
        where: whereClause,
        order: [["updatedAt", "DESC"]],
        includes: [
          {
            model: VaultModel,
            as: "vault",
          },
        ],
      }
    );
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
    parentsToAdd: string[] = [],
    parentsToRemove: string[] = []
  ): Promise<Result<undefined, Error>> {
    const currentParents = this.parentsIn || [];

    // add new parents
    const newParents = [...new Set(currentParents), ...new Set(parentsToAdd)];

    // remove specified parents
    const updatedParents = newParents.filter(
      (parent) => !parentsToRemove.includes(parent)
    );

    await this.update({ parentsIn: updatedParents });

    return new Ok(undefined);
  }

  async setParents(
    parentsIn: string[] | null
  ): Promise<Result<undefined, Error>> {
    await this.update({ parentsIn });
    return new Ok(undefined);
  }

  // Deletion.

  protected async softDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    const deletedCount = await DataSourceViewModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
      hardDelete: false,
    });

    return new Ok(deletedCount);
  }

  async hardDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    // Delete agent configurations elements pointing to this data source view.
    await AgentDataSourceConfiguration.destroy({
      where: {
        dataSourceViewId: this.id,
      },
      transaction,
    });
    await AgentTablesQueryConfigurationTable.destroy({
      where: {
        dataSourceViewId: this.id,
      },
    });

    const deletedCount = await DataSourceViewModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: this.id,
      },
      transaction,
      // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
      // bypassing the soft deletion in place.
      hardDelete: true,
    });

    return new Ok(deletedCount);
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
    return getDataSourceViewUsage({ auth, dataSourceView: this });
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
      vaultId: this.vault.sId,
      ...this.makeEditedBy(this.editedByUser, this.editedAt),
    };
  }

  toTraceJSON() {
    return {
      id: this.id,
      sId: this.sId,
      kind: this.kind,
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

  async toPokeJSON(): Promise<PokeDataSourceViewType> {
    const workspace = await getWorkspaceByModelId(this.workspaceId);

    return {
      ...this.toJSON(),
      dataSource: await this.dataSource.toPokeJSON(),
      link: workspace
        ? `${config.getClientFacingUrl()}/poke/${workspace.sId}/vaults/${this.vault.sId}/data_source_views/${this.sId}`
        : null,
      name: `Data Source (${this.dataSource.name})`,
      vault: this.vault.toPokeJSON(),
    };
  }
}
