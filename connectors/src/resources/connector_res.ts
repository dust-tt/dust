import type { ConnectorProvider } from "@dust-tt/types";
import type { ModelStatic } from "sequelize";

import { BaseResource } from "@connectors/resources/base_res";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { WithoutSequelizeAttributes } from "@connectors/resources/storage/types";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConnectorResource
  extends WithoutSequelizeAttributes<ConnectorModel> {}
export class ConnectorResource extends BaseResource<ConnectorModel> {
  static model: ModelStatic<ConnectorModel> = ConnectorModel;

  static async listByType(type: ConnectorProvider) {
    const blobs = await ConnectorResource.model.findAll({
      where: {
        type,
      },
    });

    return blobs.map((b) => new ConnectorResource(b));
  }

  async updateConnectionId(connectionId: string) {
    return ConnectorResource.model.update(
      {
        connectionId,
      },
      {
        where: {
          id: this.id,
        },
      }
    );
  }

  // Will be move to the `BaseResource` once away from Sequelize.
  async delete() {
    return ConnectorResource.model.destroy({
      where: {
        id: this.id,
      },
    });
  }

  async update(blob: Partial<ConnectorResource>) {
    return ConnectorResource.model.update(blob, {
      where: {
        id: this.id,
      },
    });
  }
}
