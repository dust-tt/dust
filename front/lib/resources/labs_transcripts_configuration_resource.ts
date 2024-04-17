import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";
import type { CreationAttributes } from "sequelize";

import type { LabsTranscriptsProviderType } from "@app/lib/labs/transcripts/utils/types";
import { BaseResource } from "@app/lib/resources/base_resource";
import { LabsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/labs_transcripts_configuration";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface LabsTranscriptsConfigurationResource
  extends ReadonlyAttributesType<LabsTranscriptsConfigurationModel> {}
export class LabsTranscriptsConfigurationResource extends BaseResource<LabsTranscriptsConfigurationModel> {
  static model: ModelStatic<LabsTranscriptsConfigurationModel> =
    LabsTranscriptsConfigurationModel;

  constructor(
    model: ModelStatic<LabsTranscriptsConfigurationModel>,
    blob: Attributes<LabsTranscriptsConfigurationModel>
  ) {
    super(LabsTranscriptsConfigurationModel, blob);
  }

  static async makeNew(blob: Omit<CreationAttributes<LabsTranscriptsConfigurationModel>, "isActive">): Promise<LabsTranscriptsConfigurationResource> {
    const { userId, connectionId, provider } = blob;
    const hasExistingConfiguration = await LabsTranscriptsConfigurationModel.count({
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

    return new LabsTranscriptsConfigurationResource(
      LabsTranscriptsConfigurationModel,
      configuration.get()
    );
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
      ? new LabsTranscriptsConfigurationResource(
          LabsTranscriptsConfigurationModel,
          configuration.get()
        )
      : null;
  }

  static async setAgentConfigurationId({
    agentConfigurationId,
    userId,
    provider,
  }: {
    agentConfigurationId: string | null;
    userId: ModelId;
    provider: LabsTranscriptsProviderType;
  }): Promise<
    Result<
      void,
      | {
          type: "not_found";
        }
      | Error
    >
  > {
    const configuration = await this.findByUserIdAndProvider({
      userId,
      provider,
    });
    if (!configuration) {
      return new Err({
        type: "not_found",
      });
    }

    if (configuration.agentConfigurationId === agentConfigurationId) {
      return new Ok(undefined);
    }

    try {
      await LabsTranscriptsConfigurationModel.update(
        { agentConfigurationId },
        {
          where: {
            id: configuration.id,
          },
        }
      );

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  static async setEmailToNotify({
    emailToNotify,
    userId,
    provider,
  }: {
    emailToNotify: string | null;
    userId: ModelId;
    provider: LabsTranscriptsProviderType;
  }): Promise<
    Result<
      void,
      | {
          type: "not_found";
        }
      | Error
    >
  > {
    const configuration = await this.findByUserIdAndProvider({
      userId,
      provider,
    });
    if (!configuration) {
      return new Err({
        type: "not_found",
      });
    }

    if (configuration.emailToNotify === emailToNotify) {
      return new Ok(undefined);
    }

    try {
      await LabsTranscriptsConfigurationModel.update(
        { emailToNotify },
        {
          where: {
            id: configuration.id,
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

  static async setIsActive({
    isActive,
    userId,
    provider,
  }: {
    isActive: boolean;
    userId: ModelId;
    provider: LabsTranscriptsProviderType;
  }): Promise<
    Result<
      void,
      | {
          type: "not_found";
        }
      | Error
    >
  > {
    const configuration = await this.findByUserIdAndProvider({
      userId,
      provider,
    });
    if (!configuration) {
      return new Err({
        type: "not_found",
      });
    }

    if (configuration.isActive === isActive) {
      return new Ok(undefined);
    }

    try {
      await LabsTranscriptsConfigurationModel.update(
        { isActive },
        {
          where: {
            id: configuration.id,
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
