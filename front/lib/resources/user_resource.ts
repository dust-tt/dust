import type { Result, UserProviderType, UserType } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

import { renderUserType } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { User } from "@app/lib/models/user";
import { BaseResource } from "@app/lib/resources/base_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface UserResource extends ReadonlyAttributesType<User> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UserResource extends BaseResource<User> {
  static model: ModelStatic<User> = User;

  constructor(model: ModelStatic<User>, blob: Attributes<User>) {
    super(User, blob);
  }

  static async findAllByUsername(username: string): Promise<UserResource[]> {
    const users = await User.findAll({
      where: {
        username,
      },
    });

    return users.map((user) => new UserResource(User, user.get()));
  }

  static async fetchByExternalId(
    sid: string,
    transaction?: Transaction
  ): Promise<UserResource | null> {
    const user = await User.findOne({
      where: {
        sId: sid,
      },
      transaction,
    });
    return user ? new UserResource(User, user.get()) : null;
  }

  static async fetchByAuth0Sub(
    sub: string,
    transaction?: Transaction
  ): Promise<UserResource | null> {
    const user = await User.findOne({
      where: {
        auth0Sub: sub,
      },
      transaction,
    });
    return user ? new UserResource(User, user.get()) : null;
  }

  static async fetchByEmail(
    email: string,
    transaction?: Transaction
  ): Promise<UserResource | null> {
    const user = await User.findOne({
      where: {
        email,
      },
      transaction,
    });

    return user ? new UserResource(User, user.get()) : null;
  }

  static async fetchByProvider(
    provider: UserProviderType,
    providerId: string,
    transaction?: Transaction
  ): Promise<UserResource | null> {
    const user = await User.findOne({
      where: {
        provider,
        providerId,
      },
      transaction,
    });

    return user ? new UserResource(User, user.get()) : null;
  }

  static async getWorkspaceFirstAdmin(
    workspaceId: number
  ): Promise<UserResource | null> {
    const user = await User.findOne({
      include: [
        {
          model: MembershipModel,
          where: {
            role: "admin",
            workspaceId,
          },
          required: true,
        },
      ],
      order: [["createdAt", "ASC"]],
    });

    return user ? new UserResource(User, user.get()) : null;
  }

  async update(blob: Partial<Attributes<User>>): Promise<void> {
    const [, affectedRows] = await this.model.update(blob, {
      where: {
        id: this.id,
      },
      returning: true,
    });

    // Update the resource to reflect the new status.
    Object.assign(this, affectedRows[0].get());
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

  toJSON(): User {
    return this.model.build(this);
  }

  toUserType(): UserType {
    return renderUserType(this.toJSON());
  }
}
