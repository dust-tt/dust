import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { BaseResource } from "@app/lib/resources/base_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";
import type {
  SkillConfiguration,
  SkillConfigurationWithAuthor,
} from "@app/types/skill_configuration";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface SkillConfigurationResource
  extends ReadonlyAttributesType<SkillConfigurationModel> {}

export type SkillConfigurationResourceWithAuthor =
  SkillConfigurationResource & {
    author: Attributes<UserModel>;
  };

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SkillConfigurationResource extends BaseResource<SkillConfigurationModel> {
  static model: ModelStatic<SkillConfigurationModel> = SkillConfigurationModel;

  readonly author?: Attributes<UserModel>;

  constructor(
    model: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    { author }: { author?: Attributes<UserModel> } = {}
  ) {
    super(SkillConfigurationModel, blob);

    this.author = author;
  }

  static async makeNew(
    blob: CreationAttributes<SkillConfigurationModel>,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<SkillConfigurationResource> {
    const skillConfiguration = await this.model.create(blob, {
      transaction,
    });

    return new this(this.model, skillConfiguration.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<SkillConfigurationModel>,
    config: { includeAuthor: true }
  ): Promise<SkillConfigurationResourceWithAuthor[]>;
  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<SkillConfigurationModel>,
    config?: { includeAuthor?: false }
  ): Promise<SkillConfigurationResource[]>;
  private static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<SkillConfigurationModel> = {},
    { includeAuthor = false }: { includeAuthor?: boolean } = {}
  ): Promise<SkillConfigurationResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const res = await this.model.findAll({
      where: {
        ...options.where,
        workspaceId: workspace.id,
      },
      limit: options.limit,
      offset: options.offset,
      order: options.order,
      include: includeAuthor
        ? [{ model: UserModel, as: "author", required: true }]
        : [],
    });

    return res.map(
      (c) =>
        new this(this.model, c.get(), {
          author: c.author?.get(),
        })
    );
  }

  static async fetchWithAuthor(
    auth: Authenticator,
    options: ResourceFindOptions<SkillConfigurationModel> = {}
  ): Promise<SkillConfigurationResourceWithAuthor[]> {
    return this.baseFetch(auth, options, {
      includeAuthor: true,
    });
  }

  static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId
  ): Promise<SkillConfigurationResource | null> {
    const resources = await this.baseFetch(auth, {
      where: {
        id,
      },
      limit: 1,
    });

    if (resources.length === 0) {
      return null;
    }

    return resources[0];
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined | number, Error>> {
    try {
      const workspace = auth.getNonNullableWorkspace();

      const affectedCount = await SkillConfigurationResource.model.destroy({
        where: {
          id: this.id,
          workspaceId: workspace.id,
        },
        transaction,
      });

      return new Ok(affectedCount);
    } catch (error) {
      return new Err(error as Error);
    }
  }

  toJSON(
    this: SkillConfigurationResourceWithAuthor
  ): SkillConfigurationWithAuthor;
  toJSON(this: SkillConfigurationResource): SkillConfiguration;
  toJSON(): SkillConfiguration | SkillConfigurationWithAuthor {
    if (this.author) {
      return {
        id: this.id,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        workspaceId: this.workspaceId,
        version: this.version,
        status: this.status,
        scope: this.scope,
        name: this.name,
        description: this.description,
        instructions: this.instructions,
        requestedSpaceIds: this.requestedSpaceIds,
        author: {
          id: this.author.id,
          sId: this.author.sId,
          createdAt: this.author.createdAt.getTime(),
          username: this.author.username,
          email: this.author.email,
          firstName: this.author.firstName,
          lastName: this.author.lastName,
          image: this.author.imageUrl,
        },
      };
    }

    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      workspaceId: this.workspaceId,
      version: this.version,
      status: this.status,
      scope: this.scope,
      name: this.name,
      description: this.description,
      instructions: this.instructions,
      authorId: this.authorId,
      requestedSpaceIds: this.requestedSpaceIds,
    };
  }
}
