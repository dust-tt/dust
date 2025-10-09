import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import { DiscordConfigurationModel } from "@connectors/lib/models/discord";
import logger from "@connectors/logger/logger";
import { BaseResource } from "@connectors/resources/base_resource";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import type { DiscordBotConfigurationType, ModelId } from "@connectors/types";
import { normalizeError } from "@connectors/types";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface DiscordConfigurationResource
  extends ReadonlyAttributesType<DiscordConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class DiscordConfigurationResource extends BaseResource<DiscordConfigurationModel> {
  static model: ModelStatic<DiscordConfigurationModel> =
    DiscordConfigurationModel;

  constructor(
    model: ModelStatic<DiscordConfigurationModel>,
    blob: Attributes<DiscordConfigurationModel>
  ) {
    super(DiscordConfigurationModel, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
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
    } catch (error) {
      logger.error(
        { error, configurationId: this.id },
        "Error deleting Discord configuration"
      );
      return new Err(normalizeError(error));
    }
  }

  toJSON(): DiscordBotConfigurationType {
    return {
      botEnabled: this.botEnabled,
    };
  }

  static async makeNew({
    guildId,
    connectorId,
    transaction,
  }: {
    guildId: string;
    connectorId: ModelId;
    transaction: Transaction;
  }) {
    // Only one configuration per guild can have the bot enabled at a time.
    const otherDiscordConfigurationWithBotEnabled =
      await DiscordConfigurationModel.findOne({
        where: {
          guildId,
          botEnabled: true,
        },
        transaction,
      });

    const model = await DiscordConfigurationModel.create(
      {
        guildId,
        connectorId,
        botEnabled: otherDiscordConfigurationWithBotEnabled ? false : true,
      },
      { transaction }
    );

    return new this(this.model, model.get());
  }

  static async fetchByConnectorId(connectorId: ModelId) {
    const blob = await this.model.findOne({
      where: { connectorId },
    });
    if (!blob) {
      return null;
    }
    return new this(this.model, blob.get());
  }

  static async listForGuildId(guildId: string) {
    const blobs = await this.model.findAll({
      where: { guildId },
    });
    return blobs.map((blob) => new this(this.model, blob.get()));
  }

  static async fetchByConnectorIds(
    connectorIds: ModelId[]
  ): Promise<Record<ModelId, DiscordConfigurationResource>> {
    const blobs = await this.model.findAll({
      where: {
        connectorId: connectorIds,
      },
    });

    return blobs.reduce(
      (acc, blob) => {
        acc[blob.connectorId] = new this(this.model, blob.get());
        return acc;
      },
      {} as Record<ModelId, DiscordConfigurationResource>
    );
  }

  async enableBot(): Promise<Result<void, Error>> {
    try {
      await this.model.update({ botEnabled: true }, { where: { id: this.id } });
      return new Ok(undefined);
    } catch (error) {
      logger.error(
        { error, connectorId: this.connectorId },
        "Error enabling Discord bot"
      );
      return new Err(normalizeError(error));
    }
  }

  async disableBot(): Promise<Result<void, Error>> {
    try {
      await this.model.update(
        { botEnabled: false },
        { where: { id: this.id } }
      );
      return new Ok(undefined);
    } catch (error) {
      logger.error(
        { error, connectorId: this.connectorId },
        "Error disabling Discord bot"
      );
      return new Err(normalizeError(error));
    }
  }
}
