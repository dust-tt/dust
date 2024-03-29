import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import { SlackConfigurationModel } from "@connectors/lib/models/slack";
import { BaseResource } from "@connectors/resources/base_resource";
import { sequelizeConnection } from "@connectors/resources/storage";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SlackConfigurationResource
  extends ReadonlyAttributesType<SlackConfigurationModel> {}
export class SlackConfigurationResource extends BaseResource<SlackConfigurationModel> {
  static model: ModelStatic<SlackConfigurationModel> = SlackConfigurationModel;

  constructor(
    model: ModelStatic<SlackConfigurationModel>,
    blob: Attributes<SlackConfigurationModel>
  ) {
    super(SlackConfigurationModel, blob);
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

  static async fetchByConnectorId(id: ModelId) {
    const blob = await this.model.findOne({
      where: {
        connectorId: id,
      },
    });
    if (!blob) {
      return null;
    }

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return new this(this.model, blob.get());
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

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return new this(this.model, blob.get());
  }

  static async listAll() {
    const blobs = await SlackConfigurationResource.model.findAll({});

    return blobs.map(
      // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
      (b) => new SlackConfigurationResource(this.model, b.get())
    );
  }

  static async listForTeamId(slackTeamId: string) {
    const blobs = await this.model.findAll({
      where: {
        slackTeamId,
        botEnabled: true,
      },
    });

    return blobs.map(
      (b) => new SlackConfigurationResource(this.model, b.get())
    );
  }

  async delete(): Promise<Result<undefined, Error>> {
    return sequelizeConnection.transaction(async (transaction) => {
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
    });
  }
}
