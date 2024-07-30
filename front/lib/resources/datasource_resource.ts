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

import type { Authenticator } from "@app/lib/auth";
import { DataSource } from "@app/lib/models/data_source";
import { User } from "@app/lib/models/user";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

export type FetchDataSourceOptions = {
  includeEditedBy: boolean;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface DataSourceResource
  extends ReadonlyAttributesType<DataSource> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DataSourceResource extends BaseResource<DataSource> {
  static model: ModelStatic<DataSource> = DataSource;

  editedByUser: Attributes<User> | undefined;

  constructor(
    model: ModelStatic<DataSource>,
    blob: Attributes<DataSource>,
    editedByUser?: Attributes<User>
  ) {
    super(DataSource, blob);
    this.editedByUser = editedByUser;
  }

  static async makeNew(blob: CreationAttributes<DataSource>) {
    const datasource = await DataSource.create(blob);

    return new this(DataSource, datasource.get());
  }

  private static getIncludes(options?: FetchDataSourceOptions) {
    return options?.includeEditedBy
      ? {
          include: [
            {
              model: User,
              as: "editedByUser",
            },
          ],
        }
      : undefined;
  }

  static async fetchByName(
    auth: Authenticator,
    name: string,
    options?: FetchDataSourceOptions
  ): Promise<DataSourceResource | null> {
    const owner = await auth.getNonNullableWorkspace();
    const datasource = await this.model.findOne({
      where: {
        workspaceId: owner.id,
        name,
      },
      ...this.getIncludes(options),
    });

    if (!datasource) {
      return null;
    }
    return new this(
      DataSource,
      datasource.get(),
      datasource.editedByUser?.get()
    );
  }

  static async listByWorkspace(
    auth: Authenticator,
    options?: FetchDataSourceOptions
  ): Promise<DataSourceResource[]> {
    const owner = await auth.getNonNullableWorkspace();
    const datasources = await this.model.findAll({
      where: {
        workspaceId: owner.id,
      },
      ...this.getIncludes(options),
      order: [["updatedAt", "DESC"]],
    });

    return datasources.map(
      (datasource) =>
        new this(DataSource, datasource.get(), datasource.editedByUser?.get())
    );
  }

  static async listByWorkspaceIdAndNames(
    workspaceId: ModelId,
    names: string[]
  ): Promise<DataSourceResource[]> {
    const datasources = await this.model.findAll({
      where: {
        workspaceId,
        name: {
          [Op.in]: names,
        },
      },
      order: [["updatedAt", "DESC"]],
    });

    return datasources.map(
      (datasource) => new this(DataSource, datasource.get())
    );
  }

  static async listByConnectorProvider(
    auth: Authenticator,
    connectorProvider: ConnectorProvider
  ): Promise<DataSourceResource[]> {
    const owner = await auth.getNonNullableWorkspace();
    const datasources = await this.model.findAll({
      where: {
        workspaceId: owner.id,
        connectorProvider,
      },
    });

    return datasources.map(
      (datasource) => new this(DataSource, datasource.get())
    );
  }

  static async workspaceHasDatasources(auth: Authenticator) {
    const owner = await auth.getNonNullableWorkspace();
    const dataSources = await DataSource.findAll({
      where: {
        workspaceId: owner.id,
      },
      limit: 1,
    });
    return dataSources.length > 0;
  }

  async delete(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    await DataSourceViewResource.deleteForDataSource(auth, this.toJSON());

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
