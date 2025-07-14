import type { Attributes, CreationAttributes, ModelStatic } from "sequelize";
import type { Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { ResourceLogJSON } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelId, Result, WorkspaceSegmentationType } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceResource
  extends ReadonlyAttributesType<WorkspaceModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WorkspaceResource extends BaseResource<WorkspaceModel> {
  static model: ModelStatic<WorkspaceModel> = WorkspaceModel;

  readonly blob: Attributes<WorkspaceModel>;

  constructor(
    model: ModelStatic<WorkspaceModel>,
    blob: Attributes<WorkspaceModel>
  ) {
    super(WorkspaceModel, blob);
    this.blob = blob;
  }

  static async makeNew(
    blob: CreationAttributes<WorkspaceModel>
  ): Promise<WorkspaceResource> {
    const workspace = await this.model.create(blob);

    return new this(this.model, workspace.get());
  }

  static async fetchById(wId: string): Promise<WorkspaceResource | null> {
    const workspace = await this.model.findOne({
      where: {
        sId: wId,
      },
    });
    return workspace ? new this(this.model, workspace.get()) : null;
  }

  static async fetchByName(name: string): Promise<WorkspaceResource | null> {
    const workspace = await this.model.findOne({
      where: { name },
    });
    return workspace ? new this(this.model, workspace.get()) : null;
  }

  static async fetchByModelIds(ids: ModelId[]): Promise<WorkspaceResource[]> {
    const workspaces = await this.model.findAll({
      where: { id: ids },
    });
    return workspaces.map((workspace) => new this(this.model, workspace.get()));
  }

  static async fetchByWorkOSOrganizationId(
    workOSOrganizationId: string
  ): Promise<WorkspaceResource | null> {
    const workspace = await this.model.findOne({
      where: { workOSOrganizationId },
    });
    return workspace ? new this(this.model, workspace.get()) : null;
  }

  static async listAll(): Promise<WorkspaceResource[]> {
    const workspaces = await this.model.findAll();
    return workspaces.map((workspace) => new this(this.model, workspace.get()));
  }

  async updateSegmentation(segmentation: WorkspaceSegmentationType) {
    return this.update({ segmentation });
  }

  static async updateName(
    wId: string,
    newName: string
  ): Promise<Result<void, Error>> {
    const [affectedCount] = await WorkspaceModel.update(
      { name: newName },
      {
        where: {
          id: wId,
        },
      }
    );

    if (affectedCount === 0) {
      return new Err(new Error("Workspace not found."));
    }

    return new Ok(undefined);
  }

  static async updateConversationsRetention(
    wId: string,
    nbDays: number
  ): Promise<Result<void, Error>> {
    const [affectedCount] = await WorkspaceModel.update(
      { conversationsRetentionDays: nbDays === -1 ? null : nbDays },
      {
        where: {
          id: wId,
        },
      }
    );

    if (affectedCount === 0) {
      return new Err(new Error("Workspace not found."));
    }

    return new Ok(undefined);
  }

  static async disableSSOEnforcement(
    wId: string
  ): Promise<Result<void, Error>> {
    const [affectedCount] = await WorkspaceModel.update(
      { ssoEnforced: false },
      {
        where: {
          id: wId,
          ssoEnforced: true,
        },
      }
    );

    if (affectedCount === 0) {
      return new Err(new Error("SSO enforcement is already disabled."));
    }

    return new Ok(undefined);
  }

  static async updateMetadata(
    wId: string,
    metadata: Record<string, string | number | boolean | object>
  ): Promise<Result<void, Error>> {
    const [affectedCount] = await WorkspaceModel.update(
      { metadata: metadata },
      {
        where: {
          id: wId,
        },
      }
    );

    if (affectedCount === 0) {
      return new Err(new Error("Workspace not found."));
    }

    return new Ok(undefined);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<number | undefined, Error>> {
    try {
      const deletedCount = await this.model.destroy({
        where: { id: this.blob.id },
        transaction,
      });
      return new Ok(deletedCount);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  toLogJSON(): ResourceLogJSON {
    return {
      sId: this.blob.sId,
    };
  }
}
