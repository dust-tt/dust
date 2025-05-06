import type { CreationAttributes } from "sequelize";
import type {
  Attributes,
  InferAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { LabsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/labs_transcripts";
import { LabsTranscriptsHistoryModel } from "@app/lib/resources/storage/models/labs_transcripts";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  LabsTranscriptsConfigurationType,
  LabsTranscriptsProviderType,
  LightWorkspaceType,
  Result,
} from "@app/types";
import { Err, Ok } from "@app/types";

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
      "isActive"
    >
  ): Promise<LabsTranscriptsConfigurationResource> {
    const configuration = await LabsTranscriptsConfigurationModel.create({
      ...blob,
      isActive: false,
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

  static async listByWorkspace({
    auth,
  }: {
    auth: Authenticator;
  }): Promise<LabsTranscriptsConfigurationResource[]> {
    const owner = auth.workspace();

    if (!owner) {
      return [];
    }

    const configurations = await LabsTranscriptsConfigurationModel.findAll({
      where: {
        workspaceId: owner.id,
      },
    });

    return configurations.map(
      (configuration) =>
        new LabsTranscriptsConfigurationResource(
          LabsTranscriptsConfigurationModel,
          configuration.get()
        )
    );
  }

  static async findByWorkspaceAndProvider({
    auth,
    provider,
    isDefaultWorkspaceConfiguration,
  }: {
    auth: Authenticator;
    provider: LabsTranscriptsProviderType;
    isDefaultWorkspaceConfiguration?: boolean;
  }): Promise<LabsTranscriptsConfigurationResource | null> {
    const owner = auth.workspace();

    if (!owner) {
      return null;
    }

    const configuration = await LabsTranscriptsConfigurationModel.findOne({
      where: {
        workspaceId: owner.id,
        provider,
        ...(isDefaultWorkspaceConfiguration
          ? { isDefaultWorkspaceConfiguration: true }
          : {}),
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

  async setIsDefault(isDefault: boolean) {
    if (this.isDefaultWorkspaceConfiguration === isDefault) {
      return;
    }

    // Update all other configurations to be false.
    if (isDefault) {
      await LabsTranscriptsConfigurationModel.update(
        { isDefaultWorkspaceConfiguration: false },
        {
          where: {
            workspaceId: this.workspaceId,
          },
        }
      );
    }

    return this.update({ isDefaultWorkspaceConfiguration: isDefault });
  }

  async setDataSourceViewId(dataSourceViewId: number | null) {
    if (dataSourceViewId === undefined) {
      return;
    }

    return this.update({ dataSourceViewId });
  }

  static async fetchDefaultConfigurationForWorkspace(
    workspace: LightWorkspaceType
  ): Promise<LabsTranscriptsConfigurationResource | null> {
    const configuration = await LabsTranscriptsConfigurationModel.findOne({
      where: {
        workspaceId: workspace.id,
        isDefaultWorkspaceConfiguration: true,
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

  toJSON(): LabsTranscriptsConfigurationType {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      provider: this.provider,
      agentConfigurationId: this.agentConfigurationId,
      isActive: this.isActive,
      isDefaultWorkspaceConfiguration: this.isDefaultWorkspaceConfiguration,
      credentialId: this.credentialId,
      dataSourceViewId: this.dataSourceViewId,
      useConnectorConnection: this.useConnectorConnection,
    };
  }
}
