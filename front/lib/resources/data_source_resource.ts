import type {
  ACLType,
  ConnectorProvider,
  DataSourceType,
  Result,
} from "@dust-tt/types";
import { Err, formatUserFullName, Ok, removeNulls } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  FindOptions,
  Includeable,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { DataSource } from "@app/lib/models/data_source";
import { User } from "@app/lib/models/user";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { VaultResource } from "@app/lib/resources/vault_resource";

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
export class DataSourceResource extends BaseResource<DataSource> {
  static model: ModelStatic<DataSource> = DataSource;

  readonly editedByUser: Attributes<User> | undefined;
  readonly vault: VaultResource;

  constructor(
    model: ModelStatic<DataSource>,
    blob: Attributes<DataSource>,
    vault: VaultResource,
    editedByUser?: Attributes<User>
  ) {
    super(DataSourceResource.model, blob);
    this.editedByUser = editedByUser;
    this.vault = vault;
  }

  static async makeNew(
    blob: Omit<CreationAttributes<DataSource>, "vaultId">,
    vault: VaultResource
  ) {
    const datasource = await DataSource.create(blob);

    return new this(DataSourceResource.model, datasource.get(), vault);
  }

  // Fetching.

  private static getOptions(options?: FetchDataSourceOptions) {
    const result: FindOptions<DataSourceResource["model"]> = {};

    if (options?.includeEditedBy) {
      result.include = [
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
    where: WhereOptions<DataSource>,
    options?: FindOptions<typeof this.model>
  ): Promise<DataSourceResource[]> {
    const includeClauses: Includeable[] = [
      {
        model: VaultResource.model,
        as: "vault",
      },
    ];

    if (options?.include) {
      if (Array.isArray(options.include)) {
        includeClauses.push(...options.include);
      } else {
        includeClauses.push(options.include);
      }
    }

    const blobs = await this.model.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: includeClauses,
    });

    const dataSources = blobs.map((b) => {
      const vault = new VaultResource(VaultResource.model, b.vault.get());

      return new this(this.model, b.get(), vault, b.editedByUser?.get());
    });

    return removeNulls(dataSources);
  }

  static async fetchByName(
    auth: Authenticator,
    name: string,
    options?: Omit<FetchDataSourceOptions, "limit" | "order">
  ): Promise<DataSourceResource | null> {
    const [dataSource] = await this.baseFetch(
      auth,
      {
        name,
      },
      this.getOptions(options)
    );

    return dataSource ?? null;
  }

  static async listByWorkspace(
    auth: Authenticator,
    options?: FetchDataSourceOptions
  ): Promise<DataSourceResource[]> {
    return this.baseFetch(auth, {}, this.getOptions(options));
  }

  static async listByWorkspaceIdAndNames(
    auth: Authenticator,
    names: string[]
  ): Promise<DataSourceResource[]> {
    return this.baseFetch(auth, {
      name: {
        [Op.in]: names,
      },
    });
  }

  static async listByConnectorProvider(
    auth: Authenticator,
    connectorProvider: ConnectorProvider,
    options?: FetchDataSourceOptions
  ): Promise<DataSourceResource[]> {
    return this.baseFetch(
      auth,
      {
        connectorProvider,
      },
      this.getOptions(options)
    );
  }

  async delete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    if (this.isManaged()) {
      await DataSourceViewResource.deleteForDataSource(auth, this);
    }

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

  // Permissions.

  acl(): ACLType {
    return this.vault.acl();
  }

  // Serialization.

  toJSON(): DataSourceType {
    return {
      id: this.id,
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
