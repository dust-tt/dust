import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { LabsPersonalSalesforceConnection as LabsSalesforcePersonalConnection } from "@app/lib/models/labs_personal_salesforce_connection";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { DataSourceType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

export type LabsPersonalSalesforceConnectionType = {
  connectionId: string;
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface LabsSalesforcePersonalConnectionResource
  extends ReadonlyAttributesType<LabsSalesforcePersonalConnection> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LabsSalesforcePersonalConnectionResource extends BaseResource<LabsSalesforcePersonalConnection> {
  static model: ModelStatic<LabsSalesforcePersonalConnection> =
    LabsSalesforcePersonalConnection;

  constructor(
    model: ModelStatic<LabsSalesforcePersonalConnection>,
    blob: Attributes<LabsSalesforcePersonalConnection>
  ) {
    super(LabsSalesforcePersonalConnectionResource.model, blob);
  }

  static async fetchByDataSource(
    auth: Authenticator,
    { dataSource }: { dataSource: DataSourceType }
  ) {
    const conn = await LabsSalesforcePersonalConnection.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        dataSourceId: dataSource.id,
        userId: auth.getNonNullableUser().id,
      },
    });

    return conn
      ? new LabsSalesforcePersonalConnectionResource(
          LabsSalesforcePersonalConnectionResource.model,
          conn.get()
        )
      : null;
  }

  static async makeNew(
    auth: Authenticator,
    {
      dataSource,
      connectionId,
    }: {
      dataSource: DataSourceType;
      connectionId: string;
    }
  ) {
    const conn = await LabsSalesforcePersonalConnection.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      dataSourceId: dataSource.id,
      userId: auth.getNonNullableUser().id,
      connectionId,
    });

    return new LabsSalesforcePersonalConnectionResource(
      LabsSalesforcePersonalConnectionResource.model,
      conn.get()
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
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
  // Serialization.

  toJSON(): LabsPersonalSalesforceConnectionType {
    return {
      connectionId: this.connectionId,
    };
  }
}
