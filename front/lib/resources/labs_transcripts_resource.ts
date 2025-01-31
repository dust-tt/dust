import type { LabsTranscriptsProviderType, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { CreationAttributes } from "sequelize";
import type {
  Attributes,
  InferAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { LabsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/labs_transcripts";
import { LabsTranscriptsHistoryModel } from "@app/lib/resources/storage/models/labs_transcripts";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { UserResource } from "@app/lib/resources/user_resource";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface LabsTranscriptsConfigurationResource
  extends ReadonlyAttributesType<LabsTranscriptsConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LabsTranscriptsConfigurationResource extends BaseResource<LabsTranscriptsConfigurationModel> {
  static model: ModelStatic<LabsTranscriptsConfigurationModel> =
    LabsTranscriptsConfigurationModel;

  constructor(
    model: ModelStatic<LabsTranscriptsConfigurationModel>,
    blob: Attributes<LabsTranscriptsConfigurationModel>
  ) {
    super(LabsTranscriptsConfigurationModel, blob);
  }

  static async makeNew(
    blob: Omit<
      CreationAttributes<LabsTranscriptsConfigurationModel>,
      "isActive" | "isDefaultFullStorage"
    >
  ): Promise<LabsTranscriptsConfigurationResource> {
    const configuration = await LabsTranscriptsConfigurationModel.create({
      ...blob,
      isActive: false,
      isDefaultFullStorage: false,
    });

    return new LabsTranscriptsConfigurationResource(
      LabsTranscriptsConfigurationModel,
      configuration.get()
    );
  }

  static async findByUserAndWorkspace({
    auth,
    userId,
  }: {
    auth: Authenticator;
    userId: number;
  }): Promise<LabsTranscriptsConfigurationResource | null> {
    const owner = auth.workspace();

    if (!owner) {
      return null;
    }

    const configuration = await LabsTranscriptsConfigurationModel.findOne({
      where: {
        userId,
        workspaceId: owner.id,
      },
    });

    return configuration
      ? new LabsTranscriptsConfigurationResource(
          LabsTranscriptsConfigurationModel,
          configuration.get()
        )
      : null;
  }

  static async findByWorkspaceAndProvider({
    auth,
    provider,
  }: {
    auth: Authenticator;
    provider: LabsTranscriptsProviderType;
  }): Promise<LabsTranscriptsConfigurationResource | null> {
    const owner = auth.workspace();

    if (!owner) {
      return null;
    }

    const configuration = await LabsTranscriptsConfigurationModel.findOne({
      where: {
        workspaceId: owner.id,
        provider,
      },
    });

    return configuration
      ? new LabsTranscriptsConfigurationResource(
          LabsTranscriptsConfigurationModel,
          configuration.get()
        )
      : null;
  }

  async getUser(): Promise<UserResource | null> {
    return UserResource.fetchByModelId(this.userId);
  }

  async setAgentConfigurationId({
    agentConfigurationId,
  }: {
    agentConfigurationId: string | null;
  }) {
    if (this.agentConfigurationId === agentConfigurationId) {
      return;
    }

    return this.update({ agentConfigurationId });
  }

  async setIsActive(isActive: boolean) {
    if (this.isActive === isActive) {
      return;
    }

    return this.update({ isActive });
  }

  async setIsDefaultFullStorage(isDefaultFullStorage: boolean) {
    if (this.isDefaultFullStorage === isDefaultFullStorage) {
      return;
    }

    // Update all other configurations to be false.
    if (isDefaultFullStorage) {
      await LabsTranscriptsConfigurationModel.update(
        { isDefaultFullStorage: false },
        {
          where: {
            workspaceId: this.workspaceId,
          },
        }
      );
    }

    return this.update({ isDefaultFullStorage });
  }

  async setDataSourceViewId(
    auth: Authenticator,
    dataSourceViewId: string | null
  ) {
    if (dataSourceViewId === undefined) {
      return;
    }

    if (dataSourceViewId === null) {
      return this.update({ dataSourceViewId: null });
    }

    const dataSourceView = await DataSourceViewResource.fetchById(
      auth,
      dataSourceViewId
    );

    if (!dataSourceView || this.dataSourceViewId === dataSourceView.id) {
      return;
    }

    return this.update({ dataSourceViewId: dataSourceView.id });
  }

  static async fetchDefaultFullStorageConfigurationForWorkspace(
    auth: Authenticator
  ): Promise<LabsTranscriptsConfigurationResource | null> {
    const configuration = await LabsTranscriptsConfigurationModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        isDefaultFullStorage: true,
      },
    });

    if (!configuration) {
      return null;
    }

    return new LabsTranscriptsConfigurationResource(
      LabsTranscriptsConfigurationModel,
      configuration.get()
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await this.deleteHistory(transaction);
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

  /**
   * History
   */

  async recordHistory(
    blob: Omit<CreationAttributes<LabsTranscriptsHistoryModel>, "id">
  ): Promise<InferAttributes<LabsTranscriptsHistoryModel>> {
    const history = await LabsTranscriptsHistoryModel.create(blob);

    return history.get();
  }

  async setConversationHistory(
    fileId: string,
    conversationId: string
  ): Promise<InferAttributes<LabsTranscriptsHistoryModel> | null> {
    const history = await LabsTranscriptsHistoryModel.findOne({
      where: {
        configurationId: this.id,
        fileId,
      },
    });

    if (!history) {
      return null;
    }

    await history?.update({ conversationId });

    return history.get();
  }

  async setStorageStatusForFileId(fileId: string, stored: boolean) {
    const history = await LabsTranscriptsHistoryModel.findOne({
      where: {
        configurationId: this.id,
        fileId,
      },
    });

    if (!history) {
      return null;
    }
    await history.update({ stored });
  }

  async fetchHistoryForFileId(
    fileId: LabsTranscriptsHistoryModel["fileId"]
  ): Promise<InferAttributes<LabsTranscriptsHistoryModel> | null> {
    const history = await LabsTranscriptsHistoryModel.findOne({
      where: {
        configurationId: this.id,
        fileId,
      },
    });

    if (!history) {
      return null;
    }

    return history.get();
  }

  async listHistory({
    limit = 20,
    sort = "DESC",
  }: {
    limit: number;
    sort: "ASC" | "DESC";
  }): Promise<InferAttributes<LabsTranscriptsHistoryModel>[]> {
    const histories = await LabsTranscriptsHistoryModel.findAll({
      where: {
        configurationId: this.id,
      },
      limit,
      order: [["createdAt", sort]],
    });

    return histories.map((history) => history.get());
  }

  private async deleteHistory(
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    try {
      await LabsTranscriptsHistoryModel.destroy({
        where: {
          configurationId: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }
}
