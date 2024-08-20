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
import { DataSource } from "@app/lib/models/data_source";
import { User } from "@app/lib/models/user";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { ResourceFindOptions } from "@app/lib/resources/resource_with_vault";
import { ResourceWithVault } from "@app/lib/resources/resource_with_vault";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { VaultResource } from "@app/lib/resources/vault_resource";

export type FetchDataSourceOptions = {
  includeEditedBy?: boolean;
  limit?: number;
  order?: [string, "ASC" | "DESC"][];
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface DataSourceResource
  extends ReadonlyAttributesType<DataSource> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DataSourceResource extends ResourceWithVault<DataSource> {
  static model: ModelStatic<DataSource> = DataSource;

  readonly editedByUser: Attributes<User> | undefined;

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

  static async fetchByName(
    auth: Authenticator,
    name: string,
    options?: Omit<FetchDataSourceOptions, "limit" | "order">
  ): Promise<DataSourceResource | null> {
    const [dataSource] = await this.baseFetchWithAuthorization(auth, {
      ...this.getOptions(options),
      where: {
        name,
      },
    });

    return dataSource ?? null;
  }

  static async fetchByModelIds(auth: Authenticator, ids: ModelId[]) {
    return this.baseFetchWithAuthorization(auth, {
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
    return this.baseFetchWithAuthorization(auth, {
      where: {
        vaultId: vault.id,
      },
    });
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

  isManaged(): boolean {
    return (
      this.name.startsWith("managed-") &&
      this.connectorProvider !== null &&
      this.connectorProvider !== "webcrawler"
    );
  }

  isFolder() {
    return !this.connectorProvider;
  }

  isWebcrawler() {
    return this.connectorProvider === "webcrawler";
  }

  getUsagesByAgents(auth: Authenticator) {
    return getDataSourceUsage({ auth, dataSource: this.toJSON() });
  }

  // Serialization.

  toJSON(): DataSourceType {
    return {
      id: this.id,
      sId: this.name, // TODO(thomas 20240812) Migrate to a real sId
      createdAt: this.createdAt.getTime(),
      name: this.name,
      description: this.description,
      dustAPIProjectId: this.dustAPIProjectId,
      connectorId: this.connectorId,
      connectorProvider: this.connectorProvider,
      assistantDefaultSelected: this.assistantDefaultSelected,
      ...this.makeEditedBy(this.editedByUser, this.editedAt),
    };
  }
}
