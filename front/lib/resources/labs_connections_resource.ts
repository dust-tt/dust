import type { CreationAttributes } from "sequelize";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { LabsConnectionsConfigurationModel } from "@app/lib/resources/storage/models/labs_connections";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId, Result, SyncStatus } from "@app/types";
import type { LabsConnectionType } from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface LabsConnectionsConfigurationResource
  extends ReadonlyAttributesType<LabsConnectionsConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LabsConnectionsConfigurationResource extends BaseResource<LabsConnectionsConfigurationModel> {
  static model: ModelStatic<LabsConnectionsConfigurationModel> =
    LabsConnectionsConfigurationModel;

  constructor(
    model: ModelStatic<LabsConnectionsConfigurationModel>,
    blob: Attributes<LabsConnectionsConfigurationModel>
  ) {
    super(LabsConnectionsConfigurationModel, blob);
  }

  static async makeNew(
    blob: Omit<
      CreationAttributes<LabsConnectionsConfigurationModel>,
      "isEnabled"
    >
  ): Promise<LabsConnectionsConfigurationResource> {
    const configuration = await LabsConnectionsConfigurationModel.create({
      ...blob,
      isEnabled: false,
    });

    return new LabsConnectionsConfigurationResource(
      LabsConnectionsConfigurationModel,
      configuration.get()
    );
  }

  static async fetchByModelId(
    id: ModelId
  ): Promise<LabsConnectionsConfigurationResource | null> {
    const configuration = await LabsConnectionsConfigurationModel.findByPk(id);

    return configuration
      ? new LabsConnectionsConfigurationResource(
          LabsConnectionsConfigurationModel,
          configuration.get()
        )
      : null;
  }

  static async findByUserAndWorkspace({
    auth,
    userId,
  }: {
    auth: Authenticator;
    userId: number;
  }): Promise<LabsConnectionsConfigurationResource | null> {
    const owner = auth.workspace();

    if (!owner) {
      return null;
    }

    const configuration = await LabsConnectionsConfigurationModel.findOne({
      where: {
        userId,
        workspaceId: owner.id,
      },
    });

    return configuration
      ? new LabsConnectionsConfigurationResource(
          LabsConnectionsConfigurationModel,
          configuration.get()
        )
      : null;
  }

  static async listByWorkspace({
    auth,
  }: {
    auth: Authenticator;
  }): Promise<LabsConnectionsConfigurationResource[]> {
    const owner = auth.workspace();

    if (!owner) {
      return [];
    }

    const configurations = await LabsConnectionsConfigurationModel.findAll({
      where: {
        workspaceId: owner.id,
      },
    });

    return configurations.map(
      (configuration) =>
        new LabsConnectionsConfigurationResource(
          LabsConnectionsConfigurationModel,
          configuration.get()
        )
    );
  }

  static async findByWorkspaceAndProvider({
    auth,
    provider,
  }: {
    auth: Authenticator;
    provider: LabsConnectionType;
  }): Promise<LabsConnectionsConfigurationResource | null> {
    const owner = auth.workspace();

    if (!owner) {
      return null;
    }

    const configuration = await LabsConnectionsConfigurationModel.findOne({
      where: {
        workspaceId: owner.id,
        provider,
      },
    });

    return configuration
      ? new LabsConnectionsConfigurationResource(
          LabsConnectionsConfigurationModel,
          configuration.get()
        )
      : null;
  }

  async getUser(): Promise<UserResource | null> {
    return UserResource.fetchByModelId(this.userId);
  }

  async setConnectionId(connectionId: string | null) {
    if (this.connectionId === connectionId) {
      return;
    }

    return this.update({ connectionId });
  }

  async setIsEnabled(isEnabled: boolean) {
    if (this.isEnabled === isEnabled) {
      return;
    }

    return this.update({ isEnabled });
  }

  async setDataSourceViewId(dataSourceViewId: number | null) {
    if (this.dataSourceViewId === dataSourceViewId) {
      return;
    }

    return this.update({ dataSourceViewId });
  }

  async setCredentialId(credentialId: string | null) {
    if (this.credentialId === credentialId) {
      return;
    }

    return this.update({ credentialId });
  }

  async setSyncStatus(syncStatus: SyncStatus) {
    if (this.syncStatus === syncStatus) {
      return;
    }

    return this.update({ syncStatus });
  }

  async setLastSyncStartedAt(lastSyncStartedAt: Date | null) {
    if (this.lastSyncStartedAt === lastSyncStartedAt) {
      return;
    }

    return this.update({ lastSyncStartedAt });
  }

  async setLastSyncCompletedAt(lastSyncCompletedAt: Date | null) {
    if (this.lastSyncCompletedAt === lastSyncCompletedAt) {
      return;
    }

    return this.update({ lastSyncCompletedAt });
  }

  async setLastSyncError(lastSyncError: string | null) {
    if (this.lastSyncError === lastSyncError) {
      return;
    }

    return this.update({ lastSyncError });
  }

  async setLastSyncCursor(lastSyncCursor: string | null) {
    if (this.lastSyncCursor === lastSyncCursor) {
      return;
    }

    return this.update({ lastSyncCursor });
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

  toJSON() {
    return {
      id: this.id,
      workspaceId: this.workspaceId,
      name: this.name,
      provider: this.provider,
      isEnabled: this.isEnabled,
      connectionId: this.connectionId,
      credentialId: this.credentialId,
      dataSourceViewId: this.dataSourceViewId,
      syncStatus: this.syncStatus,
      lastSyncStartedAt: this.lastSyncStartedAt,
      lastSyncCompletedAt: this.lastSyncCompletedAt,
      lastSyncError: this.lastSyncError,
      lastSyncCursor: this.lastSyncCursor,
    };
  }
}
