import _ from "lodash";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import sequelize from "sequelize/lib/sequelize";

import type { Authenticator } from "@app/lib/auth";
import { TagAgentModel } from "@app/lib/models/assistant/tag_agent";
import { TagModel } from "@app/lib/models/tags";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources//string_ids";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result } from "@app/types";
import { Err, Ok, removeNulls } from "@app/types";
import type { TagTypeWithUsage } from "@app/types/tag";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TagResource extends ReadonlyAttributesType<TagModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TagResource extends BaseResource<TagModel> {
  static model: ModelStatic<TagModel> = TagModel;

  constructor(model: ModelStatic<TagModel>, blob: Attributes<TagModel>) {
    super(TagModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<TagModel>
  ) {
    const tag = await TagModel.create({
      ...blob,
      workspaceId: auth.getNonNullableWorkspace().id,
    });

    return new this(TagModel, tag.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<TagModel>
  ) {
    const { where, ...otherOptions } = options ?? {};

    const tags = await TagModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
    });

    return tags.map((tag) => new this(TagModel, tag.get()));
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[]
  ): Promise<TagResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: removeNulls(ids.map(getResourceIdFromSId)),
      },
    });
  }

  static async fetchById(
    auth: Authenticator,
    id: string
  ): Promise<TagResource | null> {
    const [tag] = await this.fetchByIds(auth, [id]);
    return tag ?? null;
  }

  static async findByPk(
    auth: Authenticator,
    id: string,
    options?: ResourceFindOptions<TagModel>
  ): Promise<TagResource | null> {
    const tags = await this.baseFetch(auth, {
      where: {
        id,
      },
      ...options,
    });
    return tags.length > 0 ? tags[0] : null;
  }

  static async findByName(
    auth: Authenticator,
    name: string,
    options?: ResourceFindOptions<TagModel>
  ): Promise<TagResource | null> {
    const tags = await this.baseFetch(auth, {
      where: {
        name,
      },
      ...options,
    });
    return tags.length > 0 ? tags[0] : null;
  }

  static async findAll(
    auth: Authenticator,
    options?: ResourceFindOptions<TagModel>
  ) {
    return this.baseFetch(auth, options);
  }

  static async findAllWithUsage(
    auth: Authenticator
  ): Promise<TagTypeWithUsage[]> {
    const tags = await this.model.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      attributes: [
        "id",
        "name",
        "createdAt",
        "updatedAt",
        [
          sequelize.literal(`
            (
              SELECT COUNT(*)
              FROM tag_agents AS tag_agent
              WHERE tag_agent.id = tags.id
            )
          `),
          "usage",
        ],
      ],
      order: [[sequelize.literal("usage"), "DESC"]],
    });

    return tags.map((tag) => {
      return {
        sId: this.modelIdToSId({
          id: tag.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        }),
        name: tag.name,
        usage: (tag.get({ plain: true }) as any).usage as number,
      };
    });
  }

  static async listForAgent(
    auth: Authenticator,
    agentConfigurationId: number
  ): Promise<TagResource[]> {
    const tags = await TagAgentModel.findAll({
      where: {
        agentConfigurationId,
      },
    });
    return this.baseFetch(auth, {
      where: {
        id: tags.map((t) => t.tagId),
      },
    });
  }

  static async listForAgents(
    auth: Authenticator,
    agentConfigurationIds: number[]
  ): Promise<Record<number, TagResource[]>> {
    const tagAgents = await TagAgentModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfigurationId: agentConfigurationIds,
      },
    });
    const tags = await this.baseFetch(auth, {
      where: {
        id: [...new Set(tagAgents.map((t) => t.tagId))],
      },
    });

    const tagsMap = _.keyBy(tags, "id");
    return _.mapValues(_.groupBy(tagAgents, "agentConfigurationId"), (group) =>
      group.map((tagAgent) => tagsMap[tagAgent.tagId])
    );
  }

  async updateName(name: string) {
    await this.update({ name });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await TagAgentModel.destroy({
        where: {
          tagId: this.id,
        },
        transaction,
      });

      await this.model.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  get sId(): string {
    return TagResource.modelIdToSId({
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
    return makeSId("tag", {
      id,
      workspaceId,
    });
  }

  static isTagSId(sId: string): boolean {
    return isResourceSId("tag", sId);
  }

  toJSON() {
    return {
      sId: this.sId,
      name: this.name,
    };
  }
}
