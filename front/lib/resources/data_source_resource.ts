import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import { getDataSourceUsage } from "@app/lib/api/agent_data_sources";
import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { ResourceWithSpace } from "@app/lib/resources/resource_with_space";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import logger from "@app/logger/logger";
import type {
  ConnectorProvider,
  ConversationWithoutContentType,
  DataSourceType,
  ModelId,
  Result,
  UserType,
} from "@app/types";
import { Err, formatUserFullName, Ok, removeNulls } from "@app/types";

import { DataSourceViewModel } from "./storage/models/data_source_view";

export type FetchDataSourceOrigin =
  | "registry_lookup"
  | "v1_data_sources_search"
  | "v1_data_sources_check_upsert_queue"
  | "v1_data_sources_documents"
  | "v1_data_sources_documents_document_get_or_upsert"
  | "v1_data_sources_documents_document_parents"
  | "v1_data_sources_tables_csv"
  | "v1_data_sources_tables"
  | "v1_data_sources_tables_table"
  | "v1_data_sources_tables_table_parents"
  | "v1_data_sources_tables_table_rows"
  | "v1_data_sources_tables_table_rows_row"
  | "v1_data_sources_tokenize";

export type FetchDataSourceOptions = {
  includeDeleted?: boolean;
  includeEditedBy?: boolean;
  limit?: number;
  order?: [string, "ASC" | "DESC"][];
  origin?: FetchDataSourceOrigin;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface DataSourceResource
  extends ReadonlyAttributesType<DataSourceModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DataSourceResource extends ResourceWithSpace<DataSourceModel> {
  static model: ModelStatic<DataSourceModel> = DataSourceModel;

  readonly editedByUser?: Attributes<UserModel>;

  constructor(
    model: ModelStatic<DataSourceModel>,
    blob: Attributes<DataSourceModel>,
    space: SpaceResource,
    { editedByUser }: { editedByUser?: Attributes<UserModel> } = {}
  ) {
    super(DataSourceResource.model, blob, space);

    this.editedByUser = editedByUser;
  }

  static async makeNew(
    blob: Omit<
      CreationAttributes<DataSourceModel>,
      "editedAt" | "editedByUserId" | "vaultId"
    >,
    space: SpaceResource,
    editedByUser?: UserType | null,
    transaction?: Transaction
  ) {
    const dataSource = await DataSourceModel.create(
      {
        ...blob,
        editedByUserId: editedByUser?.id ?? null,
        editedAt: new Date(),
        vaultId: space.id,
      },
      { transaction }
    );

    return new this(DataSourceResource.model, dataSource.get(), space);
  }

  // Fetching.

  private static getOptions(
    options?: FetchDataSourceOptions
  ): ResourceFindOptions<DataSourceModel> {
    const result: ResourceFindOptions<DataSourceModel> = {};

    if (options?.includeEditedBy) {
      result.includes = [
        {
          model: UserModel,
          as: "editedByUser",
          required: false,
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
    fetchDataSourceOptions?: FetchDataSourceOptions,
    options?: ResourceFindOptions<DataSourceModel>,
    transaction?: Transaction
  ) {
    const { includeDeleted } = fetchDataSourceOptions ?? {};

    return this.baseFetchWithAuthorization(
      auth,
      {
        ...this.getOptions(fetchDataSourceOptions),
        ...options,
        includeDeleted,
      },
      transaction
    );
  }

  static async fetchById(
    auth: Authenticator,
    id: string,
    options?: Omit<FetchDataSourceOptions, "limit" | "order">
  ): Promise<DataSourceResource | null> {
    const [dataSource] = await DataSourceResource.fetchByIds(
      auth,
      [id],
      options
    );

    return dataSource ?? null;
  }

  // TODO(DATASOURCE_SID): remove
  static async fetchByNameOrId(
    auth: Authenticator,
    nameOrId: string,
    options?: Omit<FetchDataSourceOptions, "limit" | "order">
  ): Promise<DataSourceResource | null> {
    if (DataSourceResource.isDataSourceSId(nameOrId)) {
      // Fetch by sId
      const dataSourceModelId = getResourceIdFromSId(nameOrId);
      if (!dataSourceModelId) {
        logger.error(
          {
            workspaceId: auth.workspace()?.sId,
            nameOrId: nameOrId,
            type: "sid",
            sId: nameOrId,
            origin: options?.origin,
            error: "invalid_sid",
            success: false,
          },
          "fetchByNameOrId"
        );
        return null;
      }

      const dataSources = await this.fetchByModelIds(
        auth,
        [dataSourceModelId],
        options
      );

      if (dataSources.length === 0) {
        logger.error(
          {
            workspaceId: auth.workspace()?.sId,
            nameOrId: nameOrId,
            type: "sid",
            sId: nameOrId,
            origin: options?.origin,
            error: "id_from_sid_not_found",
            success: false,
          },
          "fetchByNameOrId"
        );
        return null;
      }

      return dataSources[0];
    } else {
      // Fetch by name
      const dataSources = await this.fetchByNames(auth, [nameOrId], options);
      if (dataSources.length === 0) {
        logger.error(
          {
            workspaceId: auth.workspace()?.sId,
            nameOrId: nameOrId,
            type: "name",
            name: nameOrId,
            origin: options?.origin,
            error: "name_not_found",
            success: false,
          },
          "fetchByNameOrId"
        );
        return null;
      }

      logger.info(
        {
          workspaceId: auth.workspace()?.sId,
          nameOrId: nameOrId,
          type: "name",
          name: nameOrId,
          origin: options?.origin,
          success: true,
        },
        "fetchByNameOrId"
      );
      return dataSources[0];
    }
  }

  static async fetchByDustAPIDataSourceId(
    auth: Authenticator,
    dustAPIDataSourceId: string,
    options?: FetchDataSourceOptions
  ): Promise<DataSourceResource | null> {
    const [dataSource] = await this.fetchByDustAPIDataSourceIds(
      auth,
      [dustAPIDataSourceId],
      options
    );

    return dataSource ?? null;
  }

  static async fetchByConversation(
    auth: Authenticator,
    conversation: ConversationWithoutContentType,
    options?: FetchDataSourceOptions
  ): Promise<DataSourceResource | null> {
    const [dataSource] = await this.baseFetch(auth, options, {
      where: {
        conversationId: conversation.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return dataSource ?? null;
  }

  // TODO(DATASOURCE_SID): remove
  static async fetchByNames(
    auth: Authenticator,
    names: string[],
    options?: Omit<FetchDataSourceOptions, "limit" | "order">
  ): Promise<DataSourceResource[]> {
    const dataSources = await this.baseFetch(auth, options, {
      where: {
        name: {
          [Op.in]: names,
        },
        // /!\ Names being generic, we need to filter by workspace.
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return dataSources;
  }

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[],
    options?: FetchDataSourceOptions
  ) {
    return this.baseFetch(auth, options, {
      where: {
        id: ids,
      },
    });
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    options?: Omit<FetchDataSourceOptions, "limit" | "order">
  ) {
    return DataSourceResource.fetchByModelIds(
      auth,
      removeNulls(ids.map(getResourceIdFromSId)),
      options
    );
  }

  static async fetchByDustAPIDataSourceIds(
    auth: Authenticator,
    dustAPIDataSourceIds: string[],
    options?: FetchDataSourceOptions
  ) {
    return this.baseFetch(auth, options, {
      where: {
        dustAPIDataSourceId: dustAPIDataSourceIds,
      },
    });
  }

  static async listByWorkspace(
    auth: Authenticator,
    options?: FetchDataSourceOptions,
    includeConversationDataSources?: boolean,
    transaction?: Transaction
  ): Promise<DataSourceResource[]> {
    const where: WhereOptions<DataSourceModel> = {
      workspaceId: auth.getNonNullableWorkspace().id,
    };
    if (!includeConversationDataSources) {
      where["conversationId"] = {
        [Op.is]: undefined,
      };
    }
    return this.baseFetch(
      auth,
      options,
      {
        where,
      },
      transaction
    );
  }

  static async listByConnectorProvider(
    auth: Authenticator,
    connectorProvider: ConnectorProvider,
    options?: FetchDataSourceOptions
  ): Promise<DataSourceResource[]> {
    return this.baseFetch(auth, options, {
      where: {
        connectorProvider,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource,
    options?: FetchDataSourceOptions
  ) {
    return this.listBySpaces(auth, [space], options);
  }

  static async listBySpaces(
    auth: Authenticator,
    spaces: SpaceResource[],
    options?: FetchDataSourceOptions
  ) {
    return this.baseFetch(auth, options, {
      where: {
        vaultId: spaces.map((s) => s.id),
      },
    });
  }

  static async fetchByModelIdWithAuth(auth: Authenticator, id: ModelId) {
    const r = await this.baseFetch(auth, undefined, {
      where: { id },
    });

    return r.length > 0 ? r[0] : null;
  }

  protected async softDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    // We assume the data source views are already soft-deleted here.
    const dataSourceViews = await DataSourceViewModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        dataSourceId: this.id,
        deletedAt: {
          [Op.is]: null,
        },
      },
      transaction,
    });

    if (dataSourceViews.length > 0) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().id,
          dataSourceId: this.id,
          viewIds: dataSourceViews.map((v) => v.id),
          error: "data_source_views_still_exist",
        },
        "Can't delete data source with views"
      );
      return new Err(new Error("Data source views still exist"));
    }

    const deletedCount = await this.model.destroy({
      where: {
        id: this.id,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      transaction,
    });

    return new Ok(deletedCount);
  }

  protected async hardDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    await AgentDataSourceConfiguration.destroy({
      where: {
        dataSourceId: this.id,
      },
      transaction,
    });

    await AgentTablesQueryConfigurationTable.destroy({
      where: {
        dataSourceId: this.id,
      },
      transaction,
    });

    // Directly delete the DataSourceViewModel here to avoid a circular dependency.
    await DataSourceViewModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        dataSourceId: this.id,
      },
      transaction,
      // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
      // bypassing the soft deletion in place.
      hardDelete: true,
    });

    const deletedCount = await DataSourceModel.destroy({
      where: {
        id: this.id,
      },
      transaction,
      // Use 'hardDelete: true' to ensure the record is permanently deleted from the database,
      // bypassing the soft deletion in place.
      hardDelete: true,
    });

    return new Ok(deletedCount);
  }

  // Updating.

  async setEditedBy(auth: Authenticator) {
    await this.update({
      editedByUserId: auth.user()?.id ?? null,
      editedAt: new Date(),
    });
  }

  private makeEditedBy(
    editedByUser: Attributes<UserModel> | undefined,
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

  async setDefaultSelectedForAssistant(defaultSelected: boolean) {
    return this.update({
      assistantDefaultSelected: defaultSelected,
    });
  }

  async setDescription(description: string) {
    return this.update({
      description,
    });
  }

  async setConnectorId(connectorId: string) {
    return this.update({
      connectorId,
    });
  }

  getUsagesByAgents(auth: Authenticator) {
    return getDataSourceUsage({ auth, dataSource: this });
  }

  // sId logic.

  get sId(): string {
    return DataSourceResource.modelIdToSId({
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
    return makeSId("data_source", {
      id,
      workspaceId,
    });
  }

  static isDataSourceSId(sId: string): boolean {
    return isResourceSId("data_source", sId);
  }

  // Serialization.

  toJSON(): DataSourceType {
    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      name: this.name,
      description: this.description,
      dustAPIProjectId: this.dustAPIProjectId,
      dustAPIDataSourceId: this.dustAPIDataSourceId,
      connectorId: this.connectorId,
      connectorProvider: this.connectorProvider,
      assistantDefaultSelected: this.assistantDefaultSelected,
      ...this.makeEditedBy(this.editedByUser, this.editedAt),
    };
  }
}
