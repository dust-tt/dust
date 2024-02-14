import type { ConnectorProvider } from "@dust-tt/types";
import type { ModelStatic } from "sequelize";

import { BaseResource } from "@connectors/resources/base_res";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";
import type { ReadonlyAttributesType } from "@connectors/resources/storage/types";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConnectorResource
  extends ReadonlyAttributesType<ConnectorModel> {
  readonly id: number;
}
export class ConnectorResource extends BaseResource<ConnectorModel> {
  static model: ModelStatic<ConnectorModel> = ConnectorModel;

  static async listByType(type: ConnectorProvider) {
    const blobs = await ConnectorResource.model.findAll({
      where: {
        type,
      },
      raw: true,
    });

    return blobs.map((b) => new ConnectorResource(ConnectorModel, b));
  }
}
