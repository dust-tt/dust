// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import type { KeyType, ModelId } from "@dust-tt/types";
import type { LightWorkspaceType, Result } from "@dust-tt/types";
import { formatUserFullName, redactString } from "@dust-tt/types";
import { hash as blake3 } from "blake3";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import type { Authenticator } from "@app/lib/auth";
import { User } from "@app/lib/models/user";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

export interface KeyAuthType {
  id: ModelId;
  name: string | null;
  isSystem: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface KeyResource extends ReadonlyAttributesType<KeyModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class KeyResource extends BaseResource<KeyModel> {
  static model: ModelStatic<KeyModel> = KeyModel;

  private user?: User;

  constructor(model: ModelStatic<KeyModel>, blob: Attributes<KeyModel>) {
    super(KeyModel, blob);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<KeyModel>, "secret" | "groupId">,
    group: GroupResource
  ) {
    const new_id = Buffer.from(blake3(uuidv4())).toString("hex");
    const secret = `sk-${new_id.slice(0, 32)}`;

    const key = await KeyResource.model.create({
      ...blob,
      groupId: group.id,
      secret,
    });

    return new this(KeyResource.model, key.get());
  }

  static async fetchSystemKeyForWorkspace(workspace: LightWorkspaceType) {
    const key = await this.model.findOne({
      where: {
        workspaceId: workspace.id,
        isSystem: true,
      },
    });

    if (!key) {
      return null;
    }

    return new this(KeyResource.model, key.get());
  }

  static async fetchBySecret(secret: string) {
    const key = await this.model.findOne({
      where: {
        secret,
      },
    });

    if (!key) {
      return null;
    }

    return new this(KeyResource.model, key.get());
  }

  static async fetchByWorkspaceAndId(
    workspace: LightWorkspaceType,
    id: ModelId | string
  ) {
    const key = await this.fetchByModelId(id);

    if (!key) {
      return null;
    }

    if (key.workspaceId !== workspace.id) {
      return null;
    }

    return key;
  }

  static async listNonSystemKeysByWorkspace(workspace: LightWorkspaceType) {
    const keys = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        isSystem: false,
      },
      order: [["createdAt", "DESC"]],
      include: [
        {
          as: "user",
          attributes: ["firstName", "lastName"],
          model: User,
          required: false,
        },
      ],
    });

    return keys.map((key) => new this(KeyResource.model, key.get()));
  }

  async markAsUsed() {
    return this.model.update(
      { lastUsedAt: new Date() },
      {
        where: {
          id: this.id,
        },
      }
    );
  }

  async setIsDisabled() {
    return this.model.update(
      { status: "disabled" },
      {
        where: {
          id: this.id,
        },
      }
    );
  }

  static async countActiveForGroups(
    auth: Authenticator,
    groups: GroupResource[]
  ) {
    return this.model.count({
      where: {
        groupId: {
          [Op.in]: groups.map((g) => g.id),
        },
        status: "active",
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  // Deletion.

  delete(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  static async deleteAllForWorkspace(
    workspace: LightWorkspaceType,
    transaction?: Transaction
  ) {
    return this.model.destroy({
      where: {
        workspaceId: workspace.id,
      },
      transaction,
    });
  }

  toJSON(): KeyType {
    // We only display the full secret key for the first 10 minutes after creation.
    const currentTime = new Date();
    const createdAt = new Date(this.createdAt);
    const timeDifference = Math.abs(
      currentTime.getTime() - createdAt.getTime()
    );
    const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
    const secret =
      differenceInMinutes > 10 ? redactString(this.secret, 4) : this.secret;

    return {
      id: this.id,
      createdAt: this.createdAt.getTime(),
      lastUsedAt: this.lastUsedAt?.getTime() ?? null,
      creator: formatUserFullName(this.user),
      name: this.name,
      secret,
      status: this.status,
      groupId: this.groupId,
    };
  }

  // Use to serialize a KeyResource in the Authenticator.
  toAuthJSON(): KeyAuthType {
    return {
      id: this.id,
      name: this.name,
      isSystem: this.isSystem,
    };
  }

  get isActive() {
    return this.status === "active";
  }
}
