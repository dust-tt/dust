import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import type { CreationAttributes } from "sequelize";

import type { LabsTranscriptsProviderType } from "@app/lib/labs/transcripts/utils/types";
import { BaseResource } from "@app/lib/resources/base_resource";
import { LabsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/labs_transcripts";
import { LabsTranscriptsHistoryModel } from "@app/lib/resources/storage/models/labs_transcripts";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LabsTranscriptsConfigurationResource
  extends ReadonlyAttributesType<LabsTranscriptsConfigurationModel> {}
export class LabsTranscriptsConfigurationResource extends BaseResource<LabsTranscriptsConfigurationModel> {
  static model: ModelStatic<LabsTranscriptsConfigurationModel> =
    LabsTranscriptsConfigurationModel;

  constructor(blob: Attributes<LabsTranscriptsConfigurationModel>) {
    super(LabsTranscriptsConfigurationModel, blob);
  }

  static async makeNew(
    blob: Omit<
      CreationAttributes<LabsTranscriptsConfigurationModel>,
      "isActive"
    >
  ): Promise<LabsTranscriptsConfigurationResource> {
    const { userId, connectionId, provider } = blob;
    const hasExistingConfiguration =
      await LabsTranscriptsConfigurationModel.count({
        where: {
          userId,
          connectionId,
          provider,
        },
      });
    if (hasExistingConfiguration) {
      throw new Error(
        `A Solution configuration already exists for user ${userId} with connectionId ${connectionId} and provider ${provider}`
      );
    }
    const configuration = await LabsTranscriptsConfigurationModel.create({
      userId,
      connectionId,
      provider,
      isActive: false,
    });

    return new LabsTranscriptsConfigurationResource(configuration.get());
  }

  static async findByUserIdAndProvider({
    userId,
    provider,
  }: {
    userId: ModelId;
    provider: LabsTranscriptsProviderType;
  }): Promise<LabsTranscriptsConfigurationResource | null> {
    const configuration = await LabsTranscriptsConfigurationModel.findOne({
      where: {
        userId,
        provider,
      },
    });

    return configuration
      ? new LabsTranscriptsConfigurationResource(configuration.get())
      : null;
  }

  async setAgentConfigurationId({
    agentConfigurationId,
  }: {
    agentConfigurationId: string | null;
  }): Promise<
    Result<
      void,
      | {
          type: "not_found";
        }
      | Error
    >
  > {
    if (this.agentConfigurationId === agentConfigurationId) {
      return new Ok(undefined);
    }

    try {
      await LabsTranscriptsConfigurationModel.update(
        { agentConfigurationId },
        {
          where: {
            id: this.id,
          },
        }
      );

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async setEmailToNotify({
    emailToNotify,
  }: {
    emailToNotify: string | null;
  }): Promise<
    Result<
      void,
      | {
          type: "not_found";
        }
      | Error
    >
  > {
    if (this.emailToNotify === emailToNotify) {
      return new Ok(undefined);
    }

    try {
      await LabsTranscriptsConfigurationModel.update(
        { emailToNotify },
        {
          where: {
            id: this.id,
          },
        }
      );

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  static async getIsActive({
    userId,
    provider,
  }: {
    userId: ModelId;
    provider: LabsTranscriptsProviderType;
  }): Promise<boolean> {
    const configuration = await this.findByUserIdAndProvider({
      userId,
      provider,
    });
    if (!configuration) {
      return false;
    }
    return configuration.isActive;
  }

  async setIsActive({ isActive }: { isActive: boolean }): Promise<
    Result<
      void,
      | {
          type: "not_found";
        }
      | Error
    >
  > {
    if (this.isActive === isActive) {
      return new Ok(undefined);
    }

    try {
      await LabsTranscriptsConfigurationModel.update(
        { isActive },
        {
          where: {
            id: this.id,
          },
        }
      );

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
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
}

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LabsTranscriptsHistoryResource
  extends ReadonlyAttributesType<LabsTranscriptsHistoryModel> {}
export class LabsTranscriptsHistoryResource extends BaseResource<LabsTranscriptsHistoryModel> {
  static model: ModelStatic<LabsTranscriptsHistoryModel> =
    LabsTranscriptsHistoryModel;

  constructor(blob: Attributes<LabsTranscriptsHistoryModel>) {
    super(LabsTranscriptsHistoryModel, blob);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<LabsTranscriptsHistoryModel>, "id">
  ): Promise<LabsTranscriptsHistoryResource> {
    const { configurationId, fileId, fileName } = blob;

    const history = await LabsTranscriptsHistoryModel.create({
      configurationId,
      fileId,
      fileName,
    });

    return new LabsTranscriptsHistoryResource(history.get());
  }

  static async findByFileId({
    fileId,
  }: {
    fileId: LabsTranscriptsHistoryModel["fileId"];
  }): Promise<LabsTranscriptsHistoryResource | null> {
    const history = await LabsTranscriptsHistoryModel.findOne({
      where: {
        fileId,
      },
    });

    if (!history) {
      return null;
    }

    return new LabsTranscriptsHistoryResource(history.get());
  }

  static async listByConfigurationId({
    configurationId,
    limit = 20,
    sort = "DESC",
  }: {
    configurationId: LabsTranscriptsConfigurationModel["id"];
    limit: number;
    sort: "ASC" | "DESC";
  }): Promise<LabsTranscriptsHistoryResource[]> {
    const histories = await LabsTranscriptsHistoryModel.findAll({
      where: {
        configurationId,
      },
      limit,
      order: [["createdAt", sort]],
    });

    return histories.map(
      (history) => new LabsTranscriptsHistoryResource(history.get())
    );
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
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
}
