import type { ModelId, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import type { Workspace } from "@app/lib/models/workspace";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface GroupResource extends ReadonlyAttributesType<GroupModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class GroupResource extends BaseResource<GroupModel> {
  static model: ModelStatic<GroupModel> = GroupModel;

  private workspace?: Workspace;

  constructor(model: ModelStatic<GroupModel>, blob: Attributes<GroupModel>) {
    super(GroupModel, blob);
  }

  static async makeNew(blob: Attributes<GroupModel>) {
    const group = await GroupModel.create({
      ...blob,
    });

    return new this(GroupModel, group.get());
  }

  get sId(): string {
    return GroupResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("group", {
      id,
      workspaceId,
    });
  }

  async update(
    blob: Partial<Attributes<GroupModel>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    const [affectedCount, affectedRows] = await this.model.update(blob, {
      where: {
        id: this.id,
      },
      transaction,
      returning: true,
    });
    // Update the current instance with the new values to avoid stale data
    Object.assign(this, affectedRows[0].get());
    return [affectedCount];
  }

  async delete(
    auth: Authenticator,
    transaction?: Transaction
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

  static async fetchById(id: string): Promise<GroupResource | null> {
    // @todo daph we will probably want to add auth as a parameter to this function
    const groupModelId = getResourceIdFromSId(id);
    if (!groupModelId) {
      return null;
    }

    const blob = await this.model.findOne({
      where: {
        id: groupModelId,
      },
    });
    if (!blob) {
      return null;
    }

    // Use `.get` to extract model attributes, omitting Sequelize instance metadata.
    return new this(this.model, blob.get());
  }

  static async fetchByWorkspaceId(
    workspaceId: number,
    transaction?: Transaction
  ): Promise<GroupResource[]> {
    const groups = await this.model.findAll({
      where: {
        workspaceId,
      },
      transaction,
    });

    return groups.map((group) => new this(GroupModel, group.get()));
  }

  isWorkspaceGroup() {
    return this.isWorkspace;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      workspaceId: this.workspaceId,
      isWorkspace: this.isWorkspace,
    };
  }
}
