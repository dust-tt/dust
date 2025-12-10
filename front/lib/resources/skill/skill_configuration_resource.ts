import type {
  Attributes,
  CreationAttributes,
  Model,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { AgentMessageSkillModel } from "@app/lib/models/skill/agent_message_skill";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import {
  GLOBAL_DUST_AUTHOR,
  GlobalSkillsRegistry,
} from "@app/lib/resources/skill/global/registry";
import type { SkillConfigurationFindOptions } from "@app/lib/resources/skill/types";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  ModelId,
  Result,
} from "@app/types";
import {
  Err,
  formatUserFullName,
  normalizeError,
  Ok,
  removeNulls,
} from "@app/types";
import type { AgentMessageSkillSource } from "@app/types/agent_message_skills";
import type {
  SkillConfigurationType,
  SkillConfigurationWithAuthorType,
} from "@app/types/skill_configuration";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SkillConfigurationResource
  extends ReadonlyAttributesType<SkillConfigurationModel> {}

export type SkillConfigurationResourceWithAuthor =
  SkillConfigurationResource & {
    author: Attributes<UserModel>;
  };

/**
 * SkillConfigurationResource handles both custom (database-backed) and global (code-defined)
 * skills in a single resource class.
 *
 * ## Architectural Trade-offs
 *
 * This design prioritizes convenience (single API for 90% of use cases) over perfect separation of
 * concerns. The alternative would be separate resource classes, which adds conceptual overhead and
 * forces most code to handle unions.
 *
 * ### What We Gain
 * - Single entry point: `fetchAll()`, `fetchById()` work for both types
 * - No new concepts: Just one resource class to understand
 * - Type-safe constraints: Sequelize operators only available with `onlyCustom: true`
 *
 * ### What We Pay
 * - Global skills use synthetic database fields (id: -1, authorId: -1)
 * - Mutations (update/delete) require runtime checks to reject global skills
 * - Mixed queries limited to simple equality filters (name, sId, status)
 * - Some internal complexity to distinguish types via `globalSId` presence
 *
 * ## Key Limitations
 *
 * 1. **Query Constraints**: Default queries (both types) only support string equality.
 *    Complex operators require `onlyCustom: true`.
 *
 * 2. **No Sequelize Features for Global Skills**: Pagination, ordering, and joins only work fully
 *    for custom skills. Global skills are in-memory filtered.
 *
 * 3. **Type Detection is Implicit**: Global skills identified by presence of `globalSId` field.
 *    No explicit type enum exposed externally.
 *
 * 4. **Synthetic Fields Never Exposed**: The fake `id: -1` is internal only.
 *    External code must use `sId` (string) for all operations.
 *
 * ## When This Breaks Down
 *
 * If you find yourself adding many special cases for global skills, or if the
 * synthetic fields cause bugs, consider refactoring to separate resource classes
 * with a thin coordination layer.
 *
 * @see GlobalSkillsRegistry for global skill definitions
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SkillConfigurationResource extends BaseResource<SkillConfigurationModel> {
  static model: ModelStatic<SkillConfigurationModel> = SkillConfigurationModel;

  readonly author?: Attributes<UserModel>;
  readonly canEdit: boolean;
  readonly mcpServerConfigurations: Attributes<SkillMCPServerConfigurationModel>[];

  private readonly globalSId?: string;

  private constructor(
    model: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    {
      author,
      canEdit = true,
      globalSId,
      mcpServerConfigurations,
    }: {
      author?: Attributes<UserModel>;
      canEdit?: boolean;
      globalSId?: string;
      mcpServerConfigurations?: Attributes<SkillMCPServerConfigurationModel>[];
    } = {}
  ) {
    super(SkillConfigurationModel, blob);

    this.author = author;
    this.canEdit = canEdit;
    this.globalSId = globalSId;
    this.mcpServerConfigurations = mcpServerConfigurations ?? [];
  }

  get sId(): string {
    if (this.globalSId) {
      return this.globalSId;
    }

    return SkillConfigurationResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
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

  static async fetchWithAuthor(
    auth: Authenticator
  ): Promise<SkillConfigurationResourceWithAuthor[]> {
    return this.baseFetch(auth, {
      includes: [{ model: UserModel, as: "author", required: true }],
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
      onlyCustom: true,
    });

    if (resources.length === 0) {
      return null;
    }

    return resources[0];
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<SkillConfigurationResource | null> {
    // Try global first.
    const globalSkill = GlobalSkillsRegistry.getById(sId);
    if (globalSkill) {
      return this.fromGlobalSkill(auth, globalSkill);
    }

    // Try as custom skill sId.
    if (!isResourceSId("skill", sId)) {
      return null;
    }

    const resourceId = getResourceIdFromSId(sId);
    if (resourceId === null) {
      return null;
    }

    return this.fetchByModelIdWithAuth(auth, resourceId);
  }

  static async fetchActiveByName(
    auth: Authenticator,
    name: string
  ): Promise<SkillConfigurationResource | null> {
    const resources = await this.baseFetch(auth, {
      where: {
        name,
        status: "active",
      },
      limit: 1,
    });

    if (resources.length === 0) {
      return null;
    }

    return resources[0];
  }

  static async fetchByAgentConfigurationId(
    auth: Authenticator,
    agentConfigurationId: ModelId
  ): Promise<SkillConfigurationResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const agentSkills = await AgentSkillModel.findAll({
      where: {
        agentConfigurationId,
        workspaceId: workspace.id,
      },
      include: [
        {
          model: SkillConfigurationModel,
          as: "customSkill",
          required: false,
        },
      ],
    });

    // TODO(SKILLS 2025-12-09): Use `baseFetch` to fetch global skills as well.
    const customSkills = removeNulls(agentSkills.map((as) => as.customSkill));
    return customSkills.map((skill) => new this(this.model, skill.get()));
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("skill", {
      id,
      workspaceId,
    });
  }

  private static async baseFetch<T extends Model, S extends string>(
    auth: Authenticator,
    options: SkillConfigurationFindOptions & {
      includes: [{ model: ModelStatic<T>; as: S; required: true }];
    }
  ): Promise<(SkillConfigurationResource & { [K in S]: Attributes<T> })[]>;

  private static async baseFetch(
    auth: Authenticator,
    options?: SkillConfigurationFindOptions
  ): Promise<SkillConfigurationResource[]>;

  private static async baseFetch(
    auth: Authenticator,
    options: SkillConfigurationFindOptions = {}
  ): Promise<SkillConfigurationResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const { where, includes, onlyCustom, ...otherOptions } = options;

    const customSkillConfigurations = await this.model.findAll({
      ...otherOptions,
      where: {
        ...where,
        workspaceId: workspace.id,
      },
      include: includes,
    });

    let customSkillConfigurationsRes: SkillConfigurationResource[] = [];

    if (customSkillConfigurations.length > 0) {
      const mcpServerConfigurations =
        await SkillMCPServerConfigurationModel.findAll({
          where: {
            workspaceId: workspace.id,
            skillConfigurationId: {
              [Op.in]: customSkillConfigurations.map((c) => c.id),
            },
          },
        });

      const mcpServerConfigsBySkillId = new Map<
        number,
        Attributes<SkillMCPServerConfigurationModel>[]
      >();
      for (const config of mcpServerConfigurations) {
        const existing = mcpServerConfigsBySkillId.get(
          config.skillConfigurationId
        );
        if (existing) {
          existing.push(config.get());
        } else {
          mcpServerConfigsBySkillId.set(config.skillConfigurationId, [
            config.get(),
          ]);
        }
      }

      // Compute canEdit for each skill
      const user = auth.user();
      const canEditMap = new Map<number, boolean>();

      if (user) {
        // Batch fetch all editor groups for all skills
        const editorGroupsRes = await GroupResource.findEditorGroupsForSkills(
          auth,
          customSkillConfigurations.map((s) => s.id)
        );

        if (editorGroupsRes.isOk()) {
          const editorGroups = editorGroupsRes.value;
          const uniqueGroups = Array.from(
            new Set(Object.values(editorGroups).map((g) => g.id))
          ).map((id) => Object.values(editorGroups).find((g) => g.id === id)!);

          // Batch fetch active members for all editor groups
          const groupMemberships =
            await GroupResource.getActiveMembershipsForGroups(
              auth,
              uniqueGroups
            );

          // Build canEdit map
          for (const skill of customSkillConfigurations) {
            const canEdit = this.computeCanEdit({
              skill,
              user,
              editorGroups,
              groupMemberships,
            });
            canEditMap.set(skill.id, canEdit);
          }
        } else {
          // If we can't fetch editor groups, fall back to no edit permissions
          for (const skill of customSkillConfigurations) {
            const canEdit = user && skill.authorId === user.id;
            canEditMap.set(skill.id, canEdit);
          }
        }
      } else {
        // No user, no edit permissions
        for (const skill of customSkillConfigurations) {
          canEditMap.set(skill.id, false);
        }
      }

      customSkillConfigurationsRes = customSkillConfigurations.map(
        (c) =>
          new this(this.model, c.get(), {
            author: c.author?.get(),
            canEdit: canEditMap.get(c.id) ?? false,
            mcpServerConfigurations: mcpServerConfigsBySkillId.get(c.id) ?? [],
          })
      );
    }

    // Only include global skills if onlyCustom is not true.
    if (onlyCustom === true) {
      return customSkillConfigurationsRes;
    }

    const globalSkillConfigurations: SkillConfigurationResource[] =
      GlobalSkillsRegistry.findAll(where).map((def) =>
        this.fromGlobalSkill(auth, def)
      );

    return [...customSkillConfigurationsRes, ...globalSkillConfigurations];
  }

  private static computeCanEdit({
    skill,
    user,
    editorGroups,
    groupMemberships,
  }: {
    skill: Attributes<SkillConfigurationModel>;
    user: Attributes<UserModel>;
    editorGroups: Record<ModelId, GroupResource>;
    groupMemberships: Record<ModelId, ModelId[]>;
  }): boolean {
    // Author can always edit
    if (skill.authorId === user.id) {
      return true;
    }

    // Check if user is in the editors group
    const editorGroup = editorGroups[skill.id];
    if (!editorGroup) {
      return false;
    }

    const memberIds = groupMemberships[editorGroup.id] || [];
    return memberIds.includes(user.id);
  }

  static async fetchAllAvailableSkills(
    auth: Authenticator,
    limit?: number
  ): Promise<SkillConfigurationResource[]> {
    return this.baseFetch(auth, {
      where: {
        status: "active",
      },
      ...(limit ? { limit } : {}),
    });
  }

  async archive(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<{ affectedCount: number }> {
    const workspace = auth.getNonNullableWorkspace();

    // Remove all agent skill links before archiving.
    await AgentSkillModel.destroy({
      where: {
        customSkillId: this.id,
        workspaceId: workspace.id,
      },
      transaction,
    });

    const [affectedCount] = await this.update(
      {
        status: "archived",
      },
      transaction
    );

    return { affectedCount };
  }

  async updateSkill(
    auth: Authenticator,
    {
      name,
      description,
      instructions,
    }: {
      name: string;
      description: string;
      instructions: string;
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<SkillConfigurationResource, Error>> {
    await this.update(
      {
        name,
        description,
        instructions,
        version: this.version + 1,
      },
      transaction
    );

    // Fetch the updated resource
    const updated = await SkillConfigurationResource.fetchByModelIdWithAuth(
      auth,
      this.id
    );

    if (!updated) {
      return new Err(new Error("Failed to fetch updated skill configuration"));
    }

    return new Ok(updated);
  }

  async updateTools(
    auth: Authenticator,
    {
      mcpServerViews,
    }: {
      mcpServerViews: MCPServerViewResource[];
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    // Delete existing tool associations.
    await SkillMCPServerConfigurationModel.destroy({
      where: {
        workspaceId: workspace.id,
        skillConfigurationId: this.id,
      },
      transaction,
    });

    // Create new tool associations.
    await SkillMCPServerConfigurationModel.bulkCreate(
      mcpServerViews.map((mcpServerView) => ({
        workspaceId: workspace.id,
        skillConfigurationId: this.id,
        mcpServerViewId: mcpServerView.id,
      })),
      { transaction }
    );
  }

  private get isGlobal(): boolean {
    return this.globalSId !== undefined;
  }

  async update(
    blob: Partial<Attributes<SkillConfigurationModel>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    if (this.isGlobal) {
      throw new Error("Cannot update a global skill configuration.");
    }

    return super.update(blob, transaction);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined | number, Error>> {
    if (this.isGlobal) {
      return new Err(new Error("Cannot delete a global skill configuration."));
    }

    try {
      const workspace = auth.getNonNullableWorkspace();

      const affectedCount = await this.model.destroy({
        where: {
          id: this.id,
          workspaceId: workspace.id,
        },
        transaction,
      });

      return new Ok(affectedCount);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  async enableForMessage(
    auth: Authenticator,
    {
      agentConfiguration,
      agentMessage,
      conversation,
      source,
    }: {
      agentConfiguration: AgentConfigurationType;
      agentMessage: AgentMessageType;
      conversation: ConversationType;
      source: AgentMessageSkillSource;
    }
  ): Promise<Result<void, Error>> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.user();
    if (!user && source === "conversation") {
      // If enabling from conversation and no user, we cannot track who enabled it.
      return new Err(
        new Error(
          "Cannot enable skill from conversation without an authenticated user"
        )
      );
    }

    await AgentMessageSkillModel.create({
      workspaceId: workspace.id,
      agentConfigurationId: agentConfiguration.id,
      isActive: true,
      customSkillId: this.id,
      globalSkillId: null,
      agentMessageId: agentMessage.id,
      conversationId: conversation.id,
      source,
      addedByUserId: user && source === "conversation" ? user.id : null,
    });

    return new Ok(undefined);
  }

  private static fromGlobalSkill(
    auth: Authenticator,
    def: GlobalSkillDefinition
  ): SkillConfigurationResource {
    return new SkillConfigurationResource(
      this.model,
      {
        authorId: -1,
        createdAt: new Date(),
        description: def.description,
        // We fake the id here. We should rely exclusively on sId for global skills.
        id: -1,
        instructions: def.instructions,
        name: def.name,
        requestedSpaceIds: [],
        status: "active",
        updatedAt: new Date(),
        version: def.version,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { author: GLOBAL_DUST_AUTHOR, globalSId: def.sId }
    );
  }

  toJSON(
    this: SkillConfigurationResourceWithAuthor
  ): SkillConfigurationWithAuthorType;
  toJSON(this: SkillConfigurationResource): SkillConfigurationType;
  toJSON(): SkillConfigurationType | SkillConfigurationWithAuthorType {
    const tools = this.mcpServerConfigurations.map((config) => ({
      mcpServerViewId: makeSId("mcp_server_view", {
        id: config.mcpServerViewId,
        workspaceId: this.workspaceId,
      }),
    }));
    if (this.author) {
      return {
        id: this.id,
        sId: this.sId,
        createdAt: this.createdAt.getTime(),
        updatedAt: this.updatedAt.getTime(),
        version: this.version,
        status: this.status,
        name: this.name,
        description: this.description,
        instructions: this.instructions,
        requestedSpaceIds: this.requestedSpaceIds,
        tools,
        author: {
          id: this.author.id,
          sId: this.author.sId,
          createdAt: this.author.createdAt.getTime(),
          username: this.author.username,
          fullName: formatUserFullName(this.author),
          email: this.author.email,
          firstName: this.author.firstName,
          lastName: this.author.lastName,
          image: this.author.imageUrl,
        },
      };
    }

    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      updatedAt: this.updatedAt.getTime(),
      version: this.version,
      status: this.status,
      name: this.name,
      description: this.description,
      instructions: this.instructions,
      requestedSpaceIds: this.requestedSpaceIds,
      tools,
    };
  }
}
