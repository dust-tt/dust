import type { ConnectorProvider } from "@dust-tt/types";
import type { ModelStatic } from "sequelize";

import { BaseResource } from "@connectors/resources/base_res";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

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
