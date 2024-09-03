import type {
  ConnectorProvider,
  DataSourceType,
  ModelId,
  Result,
} from "@dust-tt/types";
import { Err, formatUserFullName, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import { getDataSourceUsage } from "@app/lib/api/agent_data_sources";
import type { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { User } from "@app/lib/models/user";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { ResourceWithVault } from "@app/lib/resources/resource_with_vault";
import { DataSource } from "@app/lib/resources/storage/models/data_source";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";

export type FetchDataSourceOrigin =
  | "labs_transcripts_resource"
  | "document_tracker"
  | "post_upsert_hook_helper"
  | "post_upsert_hook_activities"
  | "lib_api_get_data_source"
  | "lib_api_delete_data_source";

export type FetchDataSourceOptions = {
  includeEditedBy?: boolean;
  limit?: number;
  order?: [string, "ASC" | "DESC"][];
  origin?: FetchDataSourceOrigin;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface DataSourceResource
  extends ReadonlyAttributesType<DataSource> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DataSourceResource extends ResourceWithVault<DataSource> {
  static model: ModelStatic<DataSource> = DataSource;

  readonly editedByUser?: Attributes<User>;

  constructor(
    model: ModelStatic<DataSource>,
    blob: Attributes<DataSource>,
    vault: VaultResource,
    { editedByUser }: { editedByUser?: Attributes<User> } = {}
  ) {
    super(DataSourceResource.model, blob, vault);

    this.editedByUser = editedByUser;
  }

  static async makeNew(
    blob: Omit<CreationAttributes<DataSource>, "vaultId">,
    vault: VaultResource
  ) {
    const datasource = await DataSource.create({
      ...blob,
      vaultId: vault.id,
    });

    return new this(DataSourceResource.model, datasource.get(), vault);
  }

  // Fetching.

  private static getOptions(
    options?: FetchDataSourceOptions
  ): ResourceFindOptions<DataSource> {
    const result: ResourceFindOptions<DataSource> = {};

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

      logger.info(
        {
          nameOrId: nameOrId,
          type: "sid",
          sId: nameOrId,
          origin: options?.origin,
          success: true,
        },
        "fetchByNameOrId"
      );
      return dataSources[0];
    } else {
      // Fetch by name
      const dataSources = await this.fetchByNames(auth, [nameOrId], options);
      if (dataSources.length === 0) {
        logger.error(
          {
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

  static async fetchById(
    auth: Authenticator,
    id: string,
    options?: FetchDataSourceOptions
  ): Promise<DataSourceResource | null> {
    // Preparing the introduction of datasource sIds - fetchById for now points to fetchByName
    const dataSource = await this.fetchByName(auth, id, options);

    return dataSource ?? null;
  }

  static async fetchByName(
    auth: Authenticator,
    name: string,
    options?: Omit<FetchDataSourceOptions, "limit" | "order">
  ): Promise<DataSourceResource | null> {
    const dataSources = await this.fetchByNames(auth, [name], options);
    if (dataSources.length === 0) {
      return null;
    }

    return dataSources[0];
  }

  // TODO(DATASOURCE_SID): remove
  static async fetchByNames(
    auth: Authenticator,
    names: string[],
    options?: Omit<FetchDataSourceOptions, "limit" | "order">
  ): Promise<DataSourceResource[]> {
    const dataSources = await this.baseFetchWithAuthorization(auth, {
      ...this.getOptions(options),
      where: {
        name: {
          [Op.in]: names,
        },
      },
    });

    return dataSources;
  }

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[],
    options?: FetchDataSourceOptions
  ) {
    return this.baseFetchWithAuthorization(auth, {
      ...this.getOptions(options),
      where: {
        id: ids,
      },
    });
  }

  static async listByWorkspace(
    auth: Authenticator,
    options?: FetchDataSourceOptions
  ): Promise<DataSourceResource[]> {
    return this.baseFetchWithAuthorization(auth, this.getOptions(options));
  }

  static async listByWorkspaceIdAndNames(
    auth: Authenticator,
    names: string[]
  ): Promise<DataSourceResource[]> {
    return this.baseFetchWithAuthorization(auth, {
      where: {
        name: {
          [Op.in]: names,
        },
      },
    });
  }

  static async listByConnectorProvider(
    auth: Authenticator,
    connectorProvider: ConnectorProvider,
    options?: FetchDataSourceOptions
  ): Promise<DataSourceResource[]> {
    return this.baseFetchWithAuthorization(auth, {
      ...this.getOptions(options),
      where: {
        connectorProvider,
      },
    });
  }

  static async listByVault(auth: Authenticator, vault: VaultResource) {
    return this.listByVaults(auth, [vault]);
  }

  static async listByVaults(auth: Authenticator, vaults: VaultResource[]) {
    return this.baseFetchWithAuthorization(auth, {
      where: {
        vaultId: vaults.map((v) => v.id),
      },
    });
  }

  // TODO(20240801 flav): Refactor this to make auth required on all fetchers.
  static async fetchByModelIdWithAuth(auth: Authenticator, id: ModelId) {
    const [dataSource] = await this.baseFetchWithAuthorization(auth, {
      where: { id },
    });

    return dataSource ?? null;
  }

  async delete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    await AgentDataSourceConfiguration.destroy({
      where: {
        dataSourceId: this.id,
      },
      transaction,
    });

    await DataSourceViewResource.deleteForDataSource(auth, this, transaction);

    try {
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async update(
    blob: Partial<Attributes<DataSource>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    const [affectedCount, affectedRows] = await this.model.update(blob, {
      where: {
        id: this.id,
      },
      transaction,
      returning: true,
    });
    // Update the current instance with the new values to avoid stale data
    Object.assign(this, affectedRows[0].get());
    return [affectedCount];
  }

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

  getUsagesByAgents(auth: Authenticator) {
    return getDataSourceUsage({ auth, dataSource: this.toJSON() });
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
