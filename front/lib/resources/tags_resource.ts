import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { TagModel } from "@app/lib/models/tags";
import { AgentSearchIndexationResource } from "@app/lib/resources/agent/agent_search_indexation_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { TagKind, TagTypeWithUsage } from "@app/types/tag";
import assert from "assert";
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
/**
 * @cc [owner:aubin-tchoi,label:backend] tag-search-invalidation
 * Tag metadata, attachment and deletion writes refresh their workspace's linked logical agents
 * after commit; deletion retains the targets before removing links, and rollback never enqueues.
 */
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
    options?: ResourceFindOptions<TagModel>,
    transaction?: Transaction
  ) {
    const { where, ...otherOptions } = options ?? {};

    const tags = await TagModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
      transaction,
    });

    return tags.map((tag) => new this(TagModel, tag.get()));
  }

  static async fetchByIds(
    auth: Authenticator,
    ids: string[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<TagResource[]> {
    return this.baseFetch(
      auth,
      {
        where: {
          id: removeNulls(ids.map(getResourceIdFromSId)),
        },
      },
      transaction
    );
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
    agentConfigurationId: number,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<TagResource[]> {
    const tags = await TagAgentModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfigurationId,
      },
      transaction,
    });
    return this.baseFetch(
      auth,
      {
        where: {
          id: tags.map((t) => t.tagId),
        },
      },
      transaction
    );
  }

  static async listForAgents(
    auth: Authenticator,
    agentConfigurationIds: number[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Record<number, TagResource[]>> {
    const tagAgents = await TagAgentModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfigurationId: agentConfigurationIds,
      },
      transaction,
    });
    const tagIds = [...new Set(tagAgents.map((t) => t.tagId))];
    if (tagIds.length === 0) {
      return {};
    }
    const tags = await this.baseFetch(
      auth,
      { where: { id: tagIds } },
      transaction
    );

    const tagsMap = keyBy(tags, "id");
    return mapValues(groupBy(tagAgents, "agentConfigurationId"), (group) =>
      group.map((tagAgent) => tagsMap[tagAgent.tagId])
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

  async addToAgent(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType,
    { transaction }: { transaction?: Transaction } = {}
  ) {
    if (!agentConfiguration.canEdit && !auth.isAdmin()) {
      throw new Error("You are not allowed to add tags to this agent");
    }

    const workspace = auth.getNonNullableWorkspace();
    assert(this.workspaceId === workspace.id);
    await TagAgentModel.create(
      {
        workspaceId: workspace.id,
        tagId: this.id,
        agentConfigurationId: agentConfiguration.id,
      },
      { transaction }
    );
    await AgentSearchIndexationResource.launch(
      { workspaceId: workspace.sId, agentIds: [agentConfiguration.sId] },
      { transaction }
    );
  }

  static async addToAgents(
    auth: Authenticator,
    tags: TagResource[],
    agentConfigurations: LightAgentConfigurationType[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    if (
      !auth.isAdmin() &&
      agentConfigurations.some(
        (agentConfiguration) => !agentConfiguration.canEdit
      )
    ) {
      return new Err(
        new Error("You are not allowed to add tags to this agent")
      );
    }

    if (tags.length === 0 || agentConfigurations.length === 0) {
      return new Ok(undefined);
    }

    const workspace = auth.getNonNullableWorkspace();
    assert(tags.every((tag) => tag.workspaceId === workspace.id));
    await TagAgentModel.bulkCreate(
      agentConfigurations.flatMap((agentConfiguration) =>
        tags.map((tag) => ({
          workspaceId: auth.getNonNullableWorkspace().id,
          tagId: tag.id,
          agentConfigurationId: agentConfiguration.id,
        }))
      ),
      { ignoreDuplicates: true, transaction }
    );
    await AgentSearchIndexationResource.launch(
      {
        workspaceId: workspace.sId,
        agentIds: agentConfigurations.map((agent) => agent.sId),
      },
      { transaction }
    );
    return new Ok(undefined);
  }

  async removeFromAgent(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType,
    { transaction }: { transaction?: Transaction } = {}
  ) {
    if (!agentConfiguration.canEdit && !auth.isAdmin()) {
      throw new Error("You are not allowed to remove tags from this agent");
    }

    const workspace = auth.getNonNullableWorkspace();
    assert(this.workspaceId === workspace.id);
    await TagAgentModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        tagId: this.id,
        agentConfigurationId: agentConfiguration.id,
      },
      transaction,
    });
    await AgentSearchIndexationResource.launch(
      { workspaceId: workspace.sId, agentIds: [agentConfiguration.sId] },
      { transaction }
    );
  }

  static async removeFromAgents(
    auth: Authenticator,
    tags: TagResource[],
    agentConfigurations: LightAgentConfigurationType[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    if (
      !auth.isAdmin() &&
      agentConfigurations.some(
        (agentConfiguration) => !agentConfiguration.canEdit
      )
    ) {
      return new Err(
        new Error("You are not allowed to remove tags from this agent")
      );
    }

    if (tags.length === 0 || agentConfigurations.length === 0) {
      return new Ok(undefined);
    }

    const workspace = auth.getNonNullableWorkspace();
    assert(tags.every((tag) => tag.workspaceId === workspace.id));
    await TagAgentModel.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        tagId: tags.map((tag) => tag.id),
        agentConfigurationId: agentConfigurations.map(
          (agentConfiguration) => agentConfiguration.id
        ),
      },
      transaction,
    });
    await AgentSearchIndexationResource.launch(
      {
        workspaceId: workspace.sId,
        agentIds: agentConfigurations.map((agent) => agent.sId),
      },
      { transaction }
    );
    return new Ok(undefined);
  }

  private async fetchAgentIds(transaction: Transaction): Promise<string[]> {
    const agents = await AgentConfigurationModel.findAll({
      attributes: ["sId"],
      where: { workspaceId: this.workspaceId },
      include: [
        {
          model: TagAgentModel,
          as: "agentTagLinks",
          attributes: [],
          required: true,
          where: { workspaceId: this.workspaceId, tagId: this.id },
        },
      ],
      transaction,
    });
    return [...new Set(agents.map((agent) => agent.sId))];
  }

  async updateTag(
    { name, kind }: { name: string; kind: TagKind },
    { transaction }: { transaction?: Transaction } = {}
  ) {
    const agentIds = await withTransaction(async (t) => {
      await this.update({ name, kind }, t);
      return this.fetchAgentIds(t);
    }, transaction);
    await AgentSearchIndexationResource.launchForWorkspaceModelId(
      { workspaceModelId: this.workspaceId, agentIds },
      { transaction }
    );
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    assert(this.workspaceId === auth.getNonNullableWorkspace().id);
    const agentIds = await withTransaction(
      async (t) => {
        const affectedAgentIds = await this.fetchAgentIds(t);
        await TagAgentModel.destroy({
          where: {
            tagId: this.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          transaction: t,
        });

        await this.model.destroy({
          where: {
            workspaceId: auth.getNonNullableWorkspace().id,
            id: this.id,
          },
          transaction: t,
        });
        return affectedAgentIds;
      },
      transaction,
      { useSavepoint: true }
    );
    await AgentSearchIndexationResource.launch(
      { workspaceId: auth.getNonNullableWorkspace().sId, agentIds },
      { transaction }
    );
    return new Ok(undefined);
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
