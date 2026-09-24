import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { TagModel } from "@app/lib/models/tags";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { TagKind, TagTypeWithUsage } from "@app/types/tag";
import groupBy from "lodash/groupBy";
import keyBy from "lodash/keyBy";
import mapValues from "lodash/mapValues";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import sequelize from "sequelize/lib/sequelize";

export type GetTagsUsageResponseBody = {
  tags: TagTypeWithUsage[];
};

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.

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
    const workspaceId = auth.getNonNullableWorkspace().id;

    // Recreating a tag whose name was previously soft-deleted restores that row (undelete) rather
    // than inserting a duplicate.
    const existing = await TagModel.findOne({
      where: {
        workspaceId,
        name: blob.name,
      },
      includeDeleted: true,
    });
    if (existing?.deletedAt) {
      await existing.update({ deletedAt: null, kind: blob.kind });
      return new this(TagModel, existing.get());
    }

    const tag = await TagModel.create({
      ...blob,
      workspaceId,
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

  static async findByNames(
    auth: Authenticator,
    names: string[]
  ): Promise<TagResource[]> {
    return this.baseFetch(auth, {
      where: {
        name: names,
      },
    });
  }

  static async findAll(auth: Authenticator, { kind }: { kind?: TagKind } = {}) {
    return this.baseFetch(auth, {
      where: {
        ...(kind ? { kind } : {}),
      },
      order: [["name", "ASC"]],
    });
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
        "kind",
        "createdAt",
        "updatedAt",
        [
          sequelize.literal(`
            (
              SELECT COUNT(DISTINCT ac."sId")
              FROM tag_agents ta
              JOIN agent_configurations ac ON ac.id = ta."agentConfigurationId" 
              WHERE ta."tagId" = tags.id AND ac.status = 'active'
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
        kind: tag.kind,
      };
    });
  }

  static async listForAgent(
    auth: Authenticator,
    agentConfigurationId: number
  ): Promise<TagResource[]> {
    const tags = await TagAgentModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
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
    const tagIds = [...new Set(tagAgents.map((t) => t.tagId))];
    if (tagIds.length === 0) {
      return {};
    }
    const tags = await this.baseFetch(auth, {
      where: {
        id: tagIds,
      },
    });

    const tagsMap = keyBy(tags, "id");
    return mapValues(groupBy(tagAgents, "agentConfigurationId"), (group) =>
      removeNulls(group.map((tagAgent) => tagsMap[tagAgent.tagId]))
    );
  }

  /**
   * List the tags attached to a specific agent configuration version, identified
   * by its sId and version.
   */
  static async listForAgentVersion(
    auth: Authenticator,
    agentConfigurationId: string,
    agentConfigurationVersion: number
  ): Promise<TagResource[]> {
    const tagAgents = await TagAgentModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: [
        {
          model: AgentConfigurationModel,
          required: true,
          attributes: [],
          where: {
            sId: agentConfigurationId,
            version: agentConfigurationVersion,
          },
        },
      ],
    });

    if (tagAgents.length === 0) {
      return [];
    }

    return this.baseFetch(auth, {
      where: {
        id: tagAgents.map((tagAgent) => tagAgent.tagId),
      },
    });
  }

  async updateTag({ name, kind }: { name: string; kind: TagKind }) {
    await this.update({ name, kind });
  }

  /**
   * @cc [owner:tdraier,label:backend;architecture] tag-delete-is-soft-delete
   * Deleting a tag only soft-deletes it (see `SoftDeletableWorkspaceAwareModel`): its row is kept so
   * historical `tag_agents` links stay FK-valid and the name can be restored on recreation.
   */
  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  // Hard-deletes every tag of the workspace (and its `tag_agents` links) for workspace scrub/deletion,
  // so no soft-deleted row is left behind (see `SoftDeletableWorkspaceAwareModel`).
  static async deleteAllForWorkspace(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    await TagAgentModel.destroy({ where: { workspaceId }, transaction });
    await TagModel.destroy({
      where: { workspaceId },
      hardDelete: true,
      transaction,
    });
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

  toJSON() {
    return {
      sId: this.sId,
      name: this.name,
      kind: this.kind,
    };
  }
}
