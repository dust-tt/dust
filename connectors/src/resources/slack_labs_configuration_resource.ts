import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { Attributes, Transaction } from "sequelize";

import { SlackLabsConfigurationModel } from "@connectors/lib/models/slack";
import { BaseResource } from "@connectors/resources/base_resource";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";
import type { ModelId } from "@connectors/types";
import type { SlackLabsConfigurationType } from "@connectors/types/slack_labs";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SlackLabsConfigurationResource
  extends ReadonlyAttributesType<SlackLabsConfigurationModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SlackLabsConfigurationResource extends BaseResource<SlackLabsConfigurationModel> {
  static model = SlackLabsConfigurationModel;

  constructor(
    model: typeof SlackLabsConfigurationModel,
    blob: Attributes<SlackLabsConfigurationModel>
  ) {
    super(SlackLabsConfigurationModel, blob);
  }

  async postFetchHook(): Promise<void> {
    // No additional data fetching needed for SlackLabsConfiguration
  }

  static async makeNew(blob: {
    slackTeamId: string;
    channelId: string;
    agentConfigurationId: string;
    isEnabled: boolean;
    connectorId: ModelId;
    transaction: Transaction;
  }) {
    const slackLabsConfiguration = await SlackLabsConfigurationModel.create(
      {
        slackTeamId: blob.slackTeamId,
        channelId: blob.channelId,
        agentConfigurationId: blob.agentConfigurationId,
        isEnabled: blob.isEnabled,
        connectorId: blob.connectorId,
      },
      { transaction: blob.transaction }
    );

    return new SlackLabsConfigurationResource(
      SlackLabsConfigurationModel,
      slackLabsConfiguration.get()
    );
  }

  static async fetchByConnectorId(connectorId: ModelId) {
    const slackLabsConfiguration = await SlackLabsConfigurationModel.findOne({
      where: {
        connectorId: connectorId,
      },
    });
    return slackLabsConfiguration
      ? new SlackLabsConfigurationResource(
          SlackLabsConfigurationModel,
          slackLabsConfiguration.get()
        )
      : null;
  }

  static async fetchByConnectorIds(connectorIds: ModelId[]) {
    const slackLabsConfigurations = await SlackLabsConfigurationModel.findAll({
      where: {
        connectorId: connectorIds,
      },
    });

    return slackLabsConfigurations.reduce(
      (acc, slackLabsConfiguration) => {
        acc[slackLabsConfiguration.connectorId] =
          new SlackLabsConfigurationResource(
            SlackLabsConfigurationModel,
            slackLabsConfiguration.get()
          );
        return acc;
      },
      {} as Record<ModelId, SlackLabsConfigurationResource>
    );
  }

  static async listForTeamId(
    slackTeamId: string
  ): Promise<SlackLabsConfigurationResource[]> {
    const blobs = await this.model.findAll({
      where: {
        slackTeamId,
      },
    });

    return blobs.map(
      (blob) => new SlackLabsConfigurationResource(this.model, blob.get())
    );
  }

  static async fetchByTeamIdAndChannel(
    slackTeamId: string,
    channelId: string
  ): Promise<SlackLabsConfigurationResource | null> {
    const blob = await this.model.findOne({
      where: {
        slackTeamId,
        channelId,
        isEnabled: true,
      },
    });

    return blob
      ? new SlackLabsConfigurationResource(this.model, blob.get())
      : null;
  }

  async delete(transaction?: Transaction): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: { id: this.id },
        transaction,
      });
      return new Ok(undefined);
    } catch (error) {
      return new Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async updateConfiguration({
    channelId,
    agentConfigurationId,
    isEnabled,
  }: {
    channelId: string;
    agentConfigurationId: string;
    isEnabled: boolean;
  }) {
    await this.update({
      channelId,
      agentConfigurationId,
      isEnabled,
    });
  }

  toJSON(): SlackLabsConfigurationType {
    return {
      channelId: this.channelId,
      agentConfigurationId: this.agentConfigurationId,
      isEnabled: this.isEnabled,
    };
  }
}
