import type { ConnectorProvider, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic } from "sequelize";

import { BaseResource } from "@connectors/resources/base_resource";
import type { ConnectorProviderStrategy } from "@connectors/resources/connector/strategy";
import { getConnectorProviderStrategy } from "@connectors/resources/connector/strategy";
import { sequelizeConnection } from "@connectors/resources/storage";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConnectorResource
  extends ReadonlyAttributesType<ConnectorModel> {}
export class ConnectorResource extends BaseResource<ConnectorModel> {
  static model: ModelStatic<ConnectorModel> = ConnectorModel;

  readonly providerStrategy: ConnectorProviderStrategy;

  // TODO(2024-02-20 flav): Delete Model from the constructor, once `update` has been migrated.
  constructor(
    model: ModelStatic<ConnectorModel>,
    blob: Attributes<ConnectorModel>
  ) {
    super(ConnectorModel, blob);

    const { type } = blob;

    this.providerStrategy = getConnectorProviderStrategy(type);
  }

  static async listByType(type: ConnectorProvider) {
    const blobs = await ConnectorResource.model.findAll({
      where: {
        type,
      },
    });

    return blobs.map(
      // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
      (b: ConnectorModel) => new ConnectorResource(ConnectorModel, b.get())
    );
  }

  async delete(): Promise<Result<undefined, Error>> {
    return sequelizeConnection.transaction(async (transaction) => {
      try {
        await this.providerStrategy.delete(this, transaction);

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
