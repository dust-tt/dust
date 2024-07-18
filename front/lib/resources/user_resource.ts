import type {
  ModelId,
  Result,
  UserProviderType,
  UserType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { Attributes, ModelStatic, Transaction } from "sequelize";

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

  static async makeNew(
    blob: Omit<
      Attributes<User>,
      | "id"
      | "createdAt"
      | "updatedAt"
      | "isDustSuperUser"
      | "providerId"
      | "imageUrl"
    > &
      Partial<Pick<Attributes<User>, "providerId" | "imageUrl">>
  ): Promise<UserResource> {
    const user = await User.create(blob);
    return new this(User, user.get());
  }

  static async listByModelIds(ids: ModelId[]): Promise<UserResource[]> {
    const users = await User.findAll({
      where: {
        id: ids,
      },
    });

    return users.map((user) => new UserResource(User, user.get()));
  }

  static async listByUsername(username: string): Promise<UserResource[]> {
    const users = await User.findAll({
      where: {
        username,
      },
    });

    return users.map((user) => new UserResource(User, user.get()));
  }

  static async listByEmail(email: string): Promise<UserResource[]> {
    const users = await User.findAll({
      where: {
        email,
      },
    });

    return users.map((user) => new UserResource(User, user.get()));
  }

  static async fetchById(userId: string): Promise<UserResource | null> {
    const user = await User.findOne({
      where: {
        sId: userId,
      },
    });
    return user ? new UserResource(User, user.get()) : null;
  }

  static async fetchByAuth0Sub(sub: string): Promise<UserResource | null> {
    const user = await User.findOne({
      where: {
        auth0Sub: sub,
      },
    });
    return user ? new UserResource(User, user.get()) : null;
  }

  static async fetchByEmail(email: string): Promise<UserResource | null> {
    const user = await User.findOne({
      where: {
        email,
      },
    });

    return user ? new UserResource(User, user.get()) : null;
  }

  static async fetchByProvider(
    provider: UserProviderType,
    providerId: string
  ): Promise<UserResource | null> {
    const user = await User.findOne({
      where: {
        provider,
        providerId,
      },
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

  async updateAuth0Sub(sub: string): Promise<void> {
    await this.model.update(
      {
        auth0Sub: sub,
      },
      {
        where: {
          id: this.id,
        },
      }
    );
  }

  async updateName(
    firstName: string,
    lastName: string | null
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.update(
        {
          firstName,
          lastName,
        },
        {
          where: {
            id: this.id,
          },
          returning: true,
        }
      );

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async updateInfo(
    username: string,
    firstName: string,
    lastName: string | null,
    email: string
  ): Promise<void> {
    const [, affectedRows] = await this.model.update(
      { username, firstName, lastName, email },
      {
        where: {
          id: this.id,
        },
        returning: true,
      }
    );

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

  async unsafeDelete(
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

  fullName(): string {
    return [this.firstName, this.lastName].filter(Boolean).join(" ");
  }

  toJSON(): UserType {
    return {
      sId: this.sId,
      id: this.id,
      createdAt: this.createdAt.getTime(),
      provider: this.provider,
      username: this.username,
      email: this.email,
      firstName: this.firstName,
      lastName: this.lastName,
      fullName: this.fullName(),
      image: this.imageUrl,
    };
  }
}
