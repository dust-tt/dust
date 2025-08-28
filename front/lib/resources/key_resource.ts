// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
import { hash as blake3 } from "blake3";
import type { Attributes, CreationAttributes, Transaction } from "sequelize";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import type { KeyType, ModelId, RoleType } from "@app/types";
import type { LightWorkspaceType, Result } from "@app/types";
import { formatUserFullName, redactString } from "@app/types";

export interface KeyAuthType {
  id: ModelId;
  name: string | null;
  isSystem: boolean;
  role: RoleType;
}

export const SECRET_KEY_PREFIX = "sk-";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface KeyResource extends ReadonlyAttributesType<KeyModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class KeyResource extends BaseResource<KeyModel> {
  static model: ModelStaticWorkspaceAware<KeyModel> = KeyModel;

  private user?: UserModel;

  constructor(
    model: ModelStaticWorkspaceAware<KeyModel>,
    blob: Attributes<KeyModel>
  ) {
    super(KeyModel, blob);
  }

  static async makeNew(
    blob: Omit<CreationAttributes<KeyModel>, "secret" | "groupId" | "scope">,
    group: GroupResource
  ) {
    const secret = this.createNewSecret();
    const key = await KeyResource.model.create({
      ...blob,
      groupId: group.id,
      secret,
      scope: "default",
    });

    return new this(KeyResource.model, key.get());
  }

  static createNewSecret() {
    return `${SECRET_KEY_PREFIX}${Buffer.from(blake3(uuidv4())).toString("hex").slice(0, 32)}`;
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
      // WORKSPACE_ISOLATION_BYPASS: Used when a request is made from an API Key, at this point we
      // don't know the workspaceId.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
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

  static async fetchByName(auth: Authenticator, { name }: { name: string }) {
    const key = await this.model.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        name: name,
      },
    });

    if (!key) {
      return null;
    }

    return new this(KeyResource.model, key.get());
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
          model: UserModel,
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

  async rotateSecret(
    {
      dangerouslyRotateSecret,
    }: {
      dangerouslyRotateSecret: boolean;
    },
    transaction?: Transaction
  ) {
    if (!dangerouslyRotateSecret) {
      throw new Error("Cannot rotate secret without explicitly allowing it.");
    }

    const newSecret = KeyResource.createNewSecret();
    return this.update({ secret: newSecret }, transaction);
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

  static async deleteAllForWorkspace(auth: Authenticator) {
    return this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
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
      role: this.role,
      scope: this.scope,
    };
  }

  // Use to serialize a KeyResource in the Authenticator.
  toAuthJSON(): KeyAuthType {
    return {
      id: this.id,
      name: this.name,
      isSystem: this.isSystem,
      role: this.role,
    };
  }

  get isActive() {
    return this.status === "active";
  }

  async updateRole({ newRole }: { newRole: RoleType }) {
    await this.update({ role: newRole });
  }
}
