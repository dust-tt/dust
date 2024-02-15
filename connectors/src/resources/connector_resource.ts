import type { ConnectorProvider } from "@dust-tt/types";
import type { ModelStatic } from "sequelize";

import { BaseResource } from "@connectors/resources/base_resource";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConnectorResource
  extends ReadonlyAttributesType<ConnectorModel> {}
export class ConnectorResource extends BaseResource<ConnectorModel> {
  static model: ModelStatic<ConnectorModel> = ConnectorModel;

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
}
