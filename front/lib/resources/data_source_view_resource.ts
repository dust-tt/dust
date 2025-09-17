// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import assert from "assert";
import keyBy from "lodash/keyBy";
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
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { ResourceWithSpace } from "@app/lib/resources/resource_with_space";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type {
  ConversationWithoutContentType,
  DataSourceViewCategory,
  DataSourceViewType,
  ModelId,
  Result,
  UserType,
} from "@app/types";
import { CoreAPI, Err, formatUserFullName, Ok, removeNulls } from "@app/types";

import type { UserResource } from "./user_resource";

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
export class DataSourceViewResource extends ResourceWithSpace<DataSourceViewModel> {
  static model: ModelStatic<DataSourceViewModel> = DataSourceViewModel;

  private ds?: DataSourceResource;
  readonly editedByUser?: Attributes<UserModel>;

  constructor(
    model: ModelStatic<DataSourceViewModel>,
    blob: Attributes<DataSourceViewModel>,
    space: SpaceResource,
    { editedByUser }: { editedByUser?: Attributes<UserModel> } = {}
  ) {
    super(DataSourceViewModel, blob, space);

    this.editedByUser = editedByUser;
  }

  // Creation.

  private static async makeNew(
    blob: Omit<
      CreationAttributes<DataSourceViewModel>,
      "editedAt" | "editedByUserId" | "vaultId"
    >,
    space: SpaceResource,
    dataSource: DataSourceResource,
    editedByUser?: UserType | null,
    transaction?: Transaction
  ) {
    const dataSourceView = await DataSourceViewResource.model.create(
      {
        ...blob,
        editedByUserId: editedByUser?.id ?? null,
        editedAt: new Date(),
        vaultId: space.id,
      },
      { transaction }
    );

    const dsv = new this(
      DataSourceViewResource.model,
      dataSourceView.get(),
      space
    );
    dsv.ds = dataSource;
    return dsv;
  }

  static async createDataSourceAndDefaultView(
    blob: Omit<CreationAttributes<DataSourceModel>, "editedAt" | "vaultId">,
    space: SpaceResource,
    editedByUser?: UserResource | null,
    transaction?: Transaction
  ) {
    return withTransaction(async (t: Transaction) => {
      const dataSource = await DataSourceResource.makeNew(
        blob,
        space,
        editedByUser?.toJSON(),
        t
      );
      return this.createDefaultViewInSpaceFromDataSourceIncludingAllDocuments(
        space,
        dataSource,
        editedByUser?.toJSON(),
        t
      );
    }, transaction);
  }

  static async createViewInSpaceFromDataSource(
    space: SpaceResource,
    dataSource: DataSourceResource,
    parentsIn: string[],
    editedByUser?: UserResource | null
  ) {
    return this.makeNew(
      {
        dataSourceId: dataSource.id,
        parentsIn,
        workspaceId: space.workspaceId,
        kind: "custom",
      },
      space,
      dataSource,
      editedByUser?.toJSON()
    );
  }

  // This view has access to all documents, which is represented by null.
  private static async createDefaultViewInSpaceFromDataSourceIncludingAllDocuments(
    space: SpaceResource,
    dataSource: DataSourceResource,
    editedByUser?: UserType | null,
    transaction?: Transaction
  ) {
    return this.makeNew(
      {
        dataSourceId: dataSource.id,
        parentsIn: null,
        workspaceId: space.workspaceId,
        kind: "default",
      },
      space,
      dataSource,
      editedByUser,
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
        includeDeleted,
      }
    );

    const dataSourceById = keyBy(dataSources, "id");

    for (const dsv of dataSourceViews) {
      dsv.ds = dataSourceById[dsv.dataSourceId];
    }

    return dataSourceViews;
  }

  static async listByWorkspace(
    auth: Authenticator,
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions,
    includeConversationDataSources?: boolean
  ) {
    const options: ResourceFindOptions<DataSourceViewModel> = {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    };

    if (!includeConversationDataSources) {
      // We make an extra request to fetch the conversation space first.
      // This allows early filtering of the data source views as there is no way to know
      // if a datasource view is related to a conversation from it's attributes alone.
      const conversationSpace =
        await SpaceResource.fetchWorkspaceConversationsSpace(auth);
      options.where = {
        ...options.where,
        vaultId: {
          [Op.notIn]: [conversationSpace.id],
        },
      };
    }

    const dataSourceViews = await this.baseFetch(
      auth,
      fetchDataSourceViewOptions,
      options
    );

    return dataSourceViews.filter((dsv) => dsv.canReadOrAdministrate(auth));
  }

  static async listBySpace(
    auth: Authenticator,
    space: SpaceResource,
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions
  ) {
    return this.listBySpaces(auth, [space], fetchDataSourceViewOptions);
  }

  static async listBySpaces(
    auth: Authenticator,
    spaces: SpaceResource[],
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions
  ) {
    // We inject the auth workspaceId to make sure we rely on the associated index as there is no
    // cross-workspace data source support at this stage.
    return this.baseFetch(auth, fetchDataSourceViewOptions, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: spaces.map((s) => s.id),
      },
    });
  }

  static async listAssistantDefaultSelected(auth: Authenticator) {
    const globalGroup = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    assert(globalGroup.isOk(), "Failed to fetch global group");

    const spaces = await SpaceResource.listForGroups(auth, [globalGroup.value]);

    return this.baseFetch(auth, undefined, {
      includes: [
        {
          model: DataSourceModel,
          as: "dataSourceForView",
          required: true,
          where: {
            assistantDefaultSelected: true,
          },
        },
      ],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: spaces.map((s) => s.id),
      },
    });
  }

  static async listAllInGlobalGroup(auth: Authenticator) {
    const globalGroup = await GroupResource.fetchWorkspaceGlobalGroup(auth);
    assert(globalGroup.isOk(), "Failed to fetch global group");

    const spaces = await SpaceResource.listForGroups(auth, [globalGroup.value]);

    return this.baseFetch(auth, undefined, {
      includes: [
        {
          model: DataSourceModel,
          as: "dataSourceForView",
          required: true,
        },
      ],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        vaultId: spaces.map((s) => s.id),
      },
    });
  }

  static async listForDataSourcesInSpace(
    auth: Authenticator,
    dataSources: DataSourceResource[],
    space: SpaceResource,
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions
  ) {
    // We inject the auth workspaceId to make sure we rely on the associated index as there is no
    // cross-workspace data source support at this stage.
    return this.baseFetch(auth, fetchDataSourceViewOptions, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        dataSourceId: dataSources.map((ds) => ds.id),
        vaultId: space.id,
      },
    });
  }

  static async listForDataSources(
    auth: Authenticator,
    dataSources: DataSourceResource[],
    fetchDataSourceViewOptions?: FetchDataSourceViewOptions
  ) {
    // We inject the auth workspaceId to make sure we rely on the associated index as there is no
    // cross-workspace data source support at this stage.
    return this.baseFetch(auth, fetchDataSourceViewOptions, {
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
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
  ): Promise<DataSourceViewResource | null> {
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

    return dataSourceViews ?? [];
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

    return dataSourceViews ?? [];
  }

  static async fetchByConversation(
    auth: Authenticator,
    conversation: ConversationWithoutContentType
  ): Promise<DataSourceViewResource | null> {
    // Fetch the data source view associated with the datasource that is associated with the conversation.
    const dataSource = await DataSourceResource.fetchByConversation(
      auth,
      conversation
    );
    if (!dataSource) {
      return null;
    }

    const dataSourceViews = await this.baseFetch(
      auth,
      {},
      {
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          kind: "default",
          dataSourceId: dataSource.id,
        },
      }
    );

    return dataSourceViews[0] ?? null;
  }

  static async search(
    auth: Authenticator,
    searchParams: {
      [key in AllowedSearchColumns]?: string;
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
      if (value) {
        switch (key) {
          case "dataSourceId":
          case "vaultId":
            const resourceModelId = getResourceIdFromSId(value);

            if (resourceModelId) {
              whereClause[key] = resourceModelId;
            } else {
              return [];
            }
            break;

          case "vaultKind":
            whereClause["$space.kind$"] = searchParams.vaultKind;
            break;

          default:
            whereClause[key] = value;
            break;
        }
      }
    }

    return this.baseFetch(
      auth,
      {},
      {
        where: whereClause,
        order: [["updatedAt", "DESC"]],
      }
    );
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

  async updateParents(
    parentsToAdd: string[] = [],
    parentsToRemove: string[] = []
  ): Promise<Result<undefined, Error>> {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const currentParents = this.parentsIn || [];

    if (this.kind === "default") {
      return new Err(
        new Error("`parentsIn` cannot be set for default data source view")
      );
    }

    // Check parentsToAdd exist in core as part of this data source view.
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    const allNodes = [];
    let nextPageCursor;

    do {
      const coreRes = await coreAPI.searchNodes({
        filter: {
          data_source_views: [
            {
              data_source_id: this.dataSource.dustAPIDataSourceId,
              view_filter: [],
            },
          ],
          node_ids: parentsToAdd,
        },
        options: {
          cursor: nextPageCursor,
        },
      });

      if (coreRes.isErr()) {
        return new Err(new Error(coreRes.error.message));
      }
      allNodes.push(...coreRes.value.nodes);
      nextPageCursor = coreRes.value.next_page_cursor;
    } while (nextPageCursor);

    // set to avoid O(n**2) complexity in check below
    const coreParents = new Set(allNodes.map((node) => node.node_id));
    if (parentsToAdd.some((parent) => !coreParents.has(parent))) {
      return new Err(
        new Error("Some parents do not exist in this data source view.")
      );
    }

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
    if (this.kind === "default") {
      return new Err(
        new Error("`parentsIn` cannot be set for default data source view")
      );
    }

    await this.update({ parentsIn });
    return new Ok(undefined);
  }

  // Deletion.

  protected async softDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    // Mark all content fragments that reference this data source view as expired.
    await this.expireContentFragments(auth, transaction);

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

  async expireContentFragments(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<void> {
    // Mark all content fragments that reference this data source view as expired.
    await ContentFragmentModel.update(
      {
        nodeId: null,
        nodeDataSourceViewId: null,
        expiredReason: "data_source_deleted",
      },
      {
        where: {
          nodeDataSourceViewId: this.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        transaction,
      }
    );
  }

  async hardDelete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<number, Error>> {
    // Mark all content fragments that reference this data source view as expired.
    await this.expireContentFragments(auth, transaction);

    const workspaceId = auth.getNonNullableWorkspace().id;

    const agentDataSourceConfigurations =
      await AgentDataSourceConfiguration.findAll({
        where: {
          dataSourceViewId: this.id,
          workspaceId,
        },
      });

    const agentTablesQueryConfigurations =
      await AgentTablesQueryConfigurationTable.findAll({
        where: {
          dataSourceViewId: this.id,
          workspaceId,
        },
      });

    const mcpServerConfigurationIds = removeNulls(
      [...agentDataSourceConfigurations, ...agentTablesQueryConfigurations].map(
        (a) => a.mcpServerConfigurationId
      )
    );

    await AgentDataSourceConfiguration.destroy({
      where: {
        dataSourceViewId: this.id,
        workspaceId,
      },
      transaction,
    });

    await AgentTablesQueryConfigurationTable.destroy({
      where: {
        dataSourceViewId: this.id,
        workspaceId,
      },
      transaction,
    });

    // Delete associated MCP server configurations.
    if (mcpServerConfigurationIds.length > 0) {
      await AgentMCPServerConfiguration.destroy({
        where: {
          id: {
            [Op.in]: mcpServerConfigurationIds,
          },
          workspaceId,
        },
        transaction,
      });
    }

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
      spaceId: this.space.sId,
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
}
