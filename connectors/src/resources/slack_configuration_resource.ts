import type { ModelId, Result, SlackConfigurationType } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import {
  SlackBotWhitelistModel,
  SlackChannel,
  SlackConfigurationModel,
  SlackMessages,
} from "@connectors/lib/models/slack";
import logger from "@connectors/logger/logger";
import { BaseResource } from "@connectors/resources/base_resource";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SlackConfigurationResource
  extends ReadonlyAttributesType<SlackConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SlackConfigurationResource extends BaseResource<SlackConfigurationModel> {
  static model: ModelStatic<SlackConfigurationModel> = SlackConfigurationModel;

  constructor(
    model: ModelStatic<SlackConfigurationModel>,
    blob: Attributes<SlackConfigurationModel>
  ) {
    super(SlackConfigurationModel, blob);
  }

  async postFetchHook(): Promise<void> {
    return;
  }

  static async makeNew({
    slackTeamId,
    connectorId,
    transaction,
  }: {
    slackTeamId: string;
    connectorId: ModelId;
    transaction: Transaction;
  }) {
    const otherSlackConfigurationWithBotEnabled =
      await SlackConfigurationModel.findOne({
        where: {
          slackTeamId,
          botEnabled: true,
        },
        transaction,
      });

    await SlackConfigurationModel.create(
      {
        slackTeamId,
        botEnabled: otherSlackConfigurationWithBotEnabled ? false : true,
        connectorId: connectorId,
      },
      { transaction }
    );
  }

  static async fetchByConnectorId(connectorId: ModelId) {
    const blob = await this.model.findOne({
      where: {
        connectorId: connectorId,
      },
    });
    if (!blob) {
      return null;
    }

    return new this(this.model, blob.get());
  }

  static async fetchByConnectorIds(
    connectorIds: ModelId[]
  ): Promise<Record<ModelId, SlackConfigurationResource>> {
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
      {} as Record<ModelId, SlackConfigurationResource>
    );
  }

  static async fetchByActiveBot(slackTeamId: string) {
    const blob = await this.model.findOne({
      where: {
        slackTeamId,
        botEnabled: true,
      },
    });
    if (!blob) {
      return null;
    }

    return new this(this.model, blob.get());
  }

  async isBotWhitelisted(botName: string | string[]): Promise<boolean> {
    return !!(await SlackBotWhitelistModel.findOne({
      where: {
        connectorId: this.connectorId,
        botName: botName,
      },
    }));
  }

  async whitelistBot(
    botName: string,
    groupIds: string[]
  ): Promise<Result<undefined, Error>> {
    await SlackBotWhitelistModel.create({
      connectorId: this.connectorId,
      slackConfigurationId: this.id,
      botName,
      groupIds,
    });

    return new Ok(undefined);
  }

  static async listAll() {
    const blobs = await SlackConfigurationResource.model.findAll({});

    return blobs.map(
      (b) => new SlackConfigurationResource(this.model, b.get())
    );
  }

  static async listForTeamId(
    slackTeamId: string
  ): Promise<SlackConfigurationResource[]> {
    const blobs = await this.model.findAll({
      where: {
        slackTeamId,
      },
    });

    return blobs.map(
      (b) => new SlackConfigurationResource(this.model, b.get())
    );
  }

  async enableBot(): Promise<Result<undefined, Error>> {
    const otherSlackConfigurationWithBotEnabled =
      await SlackConfigurationModel.findOne({
        where: {
          slackTeamId: this.slackTeamId,
          botEnabled: true,
        },
      });
    if (
      otherSlackConfigurationWithBotEnabled &&
      otherSlackConfigurationWithBotEnabled.id !== this.id
    ) {
      logger.error(
        {
          slackTeamId: this.slackTeamId,
        },
        "Another Dust workspace has already enabled the slack bot for your Slack workspace."
      );
      return new Err(
        new Error(
          "Another Dust workspace has already enabled the slack bot for your Slack workspace."
        )
      );
    }
    await this.model.update(
      { botEnabled: true },
      {
        where: {
          id: this.id,
        },
      }
    );

    return new Ok(undefined);
  }

  async disableBot(): Promise<Result<undefined, Error>> {
    await this.model.update(
      { botEnabled: false },
      {
        where: {
          id: this.id,
        },
      }
    );

    return new Ok(undefined);
  }

  async setWhitelistedDomains(domain: string[]) {
    await this.model.update(
      { whitelistedDomains: domain },
      {
        where: {
          id: this.id,
        },
      }
    );

    return new Ok(undefined);
  }

  async setAutoReadChannelPattern(pattern: string | null) {
    await this.model.update(
      { autoReadChannelPattern: pattern },
      {
        where: {
          id: this.id,
        },
      }
    );
    return new Ok(undefined);
  }

  async delete(transaction: Transaction): Promise<Result<undefined, Error>> {
    try {
      await SlackChannel.destroy({
        where: {
          connectorId: this.connectorId,
        },
        transaction,
      });

      await SlackMessages.destroy({
        where: {
          connectorId: this.connectorId,
        },
        transaction,
      });

      await SlackBotWhitelistModel.destroy({
        where: {
          connectorId: this.connectorId,
        },
        transaction,
      });

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

  toJSON(): SlackConfigurationType {
    return {
      botEnabled: this.botEnabled,
      whitelistedDomains: this.whitelistedDomains?.map((d) => d),
      autoReadChannelPattern: this.autoReadChannelPattern,
    };
  }
}
