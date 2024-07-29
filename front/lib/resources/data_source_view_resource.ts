// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type { DataSourceViewType, ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { VaultResource } from "@app/lib/resources/vault_resource";

type AllDocumentsType = "*";
const ALL_DOCUMENTS_TYPE: AllDocumentsType = "*";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DataSourceViewResource
  extends ReadonlyAttributesType<DataSourceViewModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DataSourceViewResource extends BaseResource<DataSourceViewModel> {
  static model: ModelStatic<DataSourceViewModel> = DataSourceViewModel;

  constructor(
    model: ModelStatic<DataSourceViewModel>,
    blob: Attributes<DataSourceViewModel>
  ) {
    super(DataSourceViewModel, blob);
  }

  // Creation.

  private static async makeNew(blob: CreationAttributes<DataSourceViewModel>) {
    const key = await DataSourceViewResource.model.create(blob);

    return new this(DataSourceViewResource.model, key.get());
  }

  static async createViewInVaultFromDataSource(
    vault: VaultResource,
    { dataSourceId }: { dataSourceId: ModelId },
    parentsIn: string[]
  ) {
    return this.makeNew({
      dataSourceId,
      parentsIn,
      workspaceId: vault.workspaceId,
    });
  }

  // TODO(2024-07-29 flav) Replace dataSourceId by DataSourceResource once implemented.
  // For now, we create a default view for all managed connections.
  // This view has access to all documents, which is represented by the special value "*".
  static async createViewInVaultFromDataSourceIncludingAllDocuments(
    vault: VaultResource,
    { dataSourceId }: { dataSourceId: ModelId }
  ) {
    return this.makeNew({
      dataSourceId,
      parentsIn: [ALL_DOCUMENTS_TYPE],
      workspaceId: vault.workspaceId,
    });
  }

  // Fetching.

  static async listByWorkspace(auth: Authenticator) {
    const blobs = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    return blobs.map((b) => new this(this.model, b.get()));
  }

  static async fetchById(auth: Authenticator, id: string) {
    const fileModelId = getResourceIdFromSId(id);
    if (!fileModelId) {
      return null;
    }

    const blob = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        id: fileModelId,
      },
    });
    if (!blob) {
      return null;
    }

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return new this(this.model, blob.get());
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
