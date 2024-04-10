import type { RequireAtLeastOne, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import { BaseResource } from "@app/lib/resources/base_resource";
import { SolutionsTranscriptsConfigurationModel } from "@app/lib/resources/storage/models/solutions_transcripts_configuration";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { SolutionProviderType } from "@app/lib/solutions/transcripts/utils/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SolutionsTranscriptsConfigurationResource
  extends ReadonlyAttributesType<SolutionsTranscriptsConfigurationModel> {}
export class SolutionsTranscriptsConfigurationResource extends BaseResource<SolutionsTranscriptsConfigurationModel> {
  static model: ModelStatic<SolutionsTranscriptsConfigurationModel> =
    SolutionsTranscriptsConfigurationModel;

  constructor(
    model: ModelStatic<SolutionsTranscriptsConfigurationModel>,
    blob: Attributes<SolutionsTranscriptsConfigurationModel>
  ) {
    super(SolutionsTranscriptsConfigurationModel, blob);
  }

  static async makeNew({
    userId,
    connectionId,
    provider,
  }: {
    userId: number;
    connectionId: string;
    provider: SolutionProviderType;
  }): Promise<SolutionsTranscriptsConfigurationResource> {
    if (
      await SolutionsTranscriptsConfigurationModel.count({
        where: {
          userId: userId,
          connectionId: connectionId,
          provider: provider,
        },
      })
    ) {
      throw new Error(
        `A Solution configuration already exists for user ${userId} with connectionId ${connectionId} and provider ${provider}`
      );
    }
    const configuration = await SolutionsTranscriptsConfigurationModel.create({
      userId,
      connectionId,
      provider,
    });

    return new SolutionsTranscriptsConfigurationResource(
      SolutionsTranscriptsConfigurationModel,
      configuration.get()
    );
  }

  static async findByUserIdAndProvider({
    attributes,
    where,
  }: {
    attributes: string[];
    where: RequireAtLeastOne<{
      userId: number;
      provider: SolutionProviderType;
    }>;
  }): Promise<SolutionsTranscriptsConfigurationResource | null> {
    const configuration = await SolutionsTranscriptsConfigurationModel.findOne({
      attributes,
      where,
    });

    return configuration
      ? new SolutionsTranscriptsConfigurationResource(
          SolutionsTranscriptsConfigurationModel,
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
    userId: number;
    provider: SolutionProviderType;
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
      // all attributes
      attributes: ["id", "agentConfigurationId"],
      where: {
        userId,
        provider,
      },
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
      await SolutionsTranscriptsConfigurationModel.update(
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
    userId: number;
    provider: SolutionProviderType;
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
      // all attributes
      attributes: ["id", "emailToNotify"],
      where: {
        userId,
        provider,
      },
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
      await SolutionsTranscriptsConfigurationModel.update(
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

  static async setIsActive({
    isActive,
    userId,
    provider,
  }: {
    isActive: boolean;
    userId: number;
    provider: SolutionProviderType;
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
      // all attributes
      attributes: ["id", "isActive"],
      where: {
        userId,
        provider,
      },
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
      await SolutionsTranscriptsConfigurationModel.update(
        { isActive },
        {
          where: {
            id: configuration.id,
          },
        }
      );

      return new Ok(undefined);
    }
    catch (err) {
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
