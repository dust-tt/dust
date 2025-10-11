import type {
  Attributes,
  CreationAttributes,
  InferAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import {
  LabsTranscriptsConfigurationModel,
  LabsTranscriptsHistoryModel,
} from "@app/lib/resources/storage/models/labs_transcripts";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  LabsTranscriptsConfigurationType,
  LabsTranscriptsProviderType,
  LightWorkspaceType,
  ModelId,
  Result,
} from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

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

    return LabsTranscriptsConfigurationResource.findByWorkspaceId(owner.id);
  }

  static async findByWorkspaceId(
    workspaceId: number
  ): Promise<LabsTranscriptsConfigurationResource[]> {
    const configurations = await LabsTranscriptsConfigurationModel.findAll({
      where: { workspaceId },
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

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("transcripts_configuration", { id, workspaceId });
  }

  static async fetchById(
    sId: string,
    transaction?: Transaction
  ): Promise<LabsTranscriptsConfigurationResource | null> {
    if (!sId) {
      return null;
    }
    const resourceId = getResourceIdFromSId(sId);
    if (!resourceId) {
      return null;
    }
    return this.fetchByModelId(resourceId, transaction);
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

  async setDataSourceView(dataSourceView: DataSourceViewResource | null) {
    return this.update({ dataSourceViewId: dataSourceView?.id ?? null });
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
      await this.deleteHistory(auth, transaction);
      await this.model.destroy({
        where: {
          id: this.id,
        },
        transaction,
      });
      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  /**
   * History
   */
  async recordHistory({
    workspace,
    fileId,
    fileName,
    conversationId,
    stored,
  }: {
    workspace: LightWorkspaceType;
    fileId: string;
    fileName: string;
    conversationId?: string | null;
    stored?: boolean;
  }): Promise<InferAttributes<LabsTranscriptsHistoryModel>> {
    const history = await LabsTranscriptsHistoryModel.create({
      configurationId: this.id,
      workspaceId: workspace.id,
      fileId,
      fileName,
      conversationId: conversationId,
      stored: stored,
    });
    return history.get();
  }

  async setConversationHistory(
    auth: Authenticator,
    { conversationId, fileId }: { conversationId: string; fileId: string }
  ): Promise<InferAttributes<LabsTranscriptsHistoryModel> | null> {
    const history = await LabsTranscriptsHistoryModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
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

  async setStorageStatusForFileId(
    auth: Authenticator,
    { fileId, stored }: { fileId: string; stored: boolean }
  ) {
    const history = await LabsTranscriptsHistoryModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
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
    auth: Authenticator,
    fileId: LabsTranscriptsHistoryModel["fileId"]
  ): Promise<InferAttributes<LabsTranscriptsHistoryModel> | null> {
    const history = await LabsTranscriptsHistoryModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        configurationId: this.id,
        fileId,
      },
    });

    if (!history) {
      return null;
    }

    return history.get();
  }

  async hasAnyHistory(): Promise<boolean> {
    const count = await LabsTranscriptsHistoryModel.count({
      where: {
        configurationId: this.id,
      },
    });

    return count > 0;
  }

  async getMostRecentHistoryDate(): Promise<Date | null> {
    const history = await LabsTranscriptsHistoryModel.findOne({
      where: {
        configurationId: this.id,
      },
      order: [["createdAt", "DESC"]],
    });

    return history ? history.createdAt : null;
  }

  private async deleteHistory(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<Result<undefined, Error>> {
    try {
      await LabsTranscriptsHistoryModel.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          configurationId: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  toJSON(): LabsTranscriptsConfigurationType {
    return {
      id: this.id,
      sId: this.sId,
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

  get sId(): string {
    return LabsTranscriptsConfigurationResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }
}
