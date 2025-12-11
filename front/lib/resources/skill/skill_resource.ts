import omit from "lodash/omit";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import { AgentMessageSkillModel } from "@app/lib/models/skill/agent_message_skill";
import { ConversationSkillModel } from "@app/lib/models/skill/conversation_skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/global/registry";
import type { SkillConfigurationFindOptions } from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  AgentConfigurationType,
  AgentMessageType,
  AgentsUsageType,
  ConversationType,
  LightAgentConfigurationType,
  ModelId,
  Result,
} from "@app/types";
import { Err, normalizeError, Ok, removeNulls } from "@app/types";
import type { ConversationSkillOrigin } from "@app/types/assistant/conversation_skills";
import type {
  SkillConfigurationType,
  SkillStatus,
} from "@app/types/assistant/skill_configuration";

type SkillResourceConstructorOptions =
  | {
      // For global skills, there is no editor group.
      editorGroup?: undefined;
      globalSId: string;
      mcpServerConfigurations?: Attributes<SkillMCPServerConfigurationModel>[];
    }
  | {
      editorGroup?: GroupResource;
      globalSId?: undefined;
      mcpServerConfigurations?: Attributes<SkillMCPServerConfigurationModel>[];
    };

type SkillVersionCreationAttributes =
  CreationAttributes<SkillConfigurationModel> & {
    skillConfigurationId: number;
    version: number;
    mcpServerConfigurationIds: number[];
  };

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SkillResource
  extends ReadonlyAttributesType<SkillConfigurationModel> {}

/**
 * SkillResource handles both custom (database-backed) and global (code-defined)
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
export class SkillResource extends BaseResource<SkillConfigurationModel> {
  static model: ModelStatic<SkillConfigurationModel> = SkillConfigurationModel;

  readonly editorGroup: GroupResource | null = null;
  readonly mcpServerConfigurations: Attributes<SkillMCPServerConfigurationModel>[];

  private readonly globalSId?: string;

  private constructor(
    model: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    options: SkillResourceConstructorOptions = {}
  ) {
    const { globalSId, mcpServerConfigurations, editorGroup } = options;
    super(SkillConfigurationModel, blob);

    this.editorGroup = editorGroup ?? null;
    this.globalSId = globalSId;
    this.mcpServerConfigurations = mcpServerConfigurations ?? [];
  }

  get sId(): string {
    if (this.globalSId) {
      return this.globalSId;
    }

    return SkillResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  // TODO(SKILLS 2025-12-11): Remove and hide behind canWrite.
  private get isGlobal(): boolean {
    return this.globalSId !== undefined;
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<SkillConfigurationModel>, "workspaceId">
  ): Promise<SkillResource> {
    // Use a transaction to ensure all creates succeed or all are rolled back.
    const skillResource = await withTransaction(async (transaction) => {
      const skill = await this.model.create(
        {
          ...blob,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
        {
          transaction,
        }
      );

      const editorGroup = await GroupResource.makeNewSkillEditorsGroup(
        auth,
        skill,
        {
          transaction,
        }
      );

      return new this(this.model, skill.get(), { editorGroup });
    });

    return skillResource;
  }

  static async fetchByModelIdWithAuth(
    auth: Authenticator,
    id: ModelId
  ): Promise<SkillResource | null> {
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
  ): Promise<SkillResource | null> {
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

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[]
  ): Promise<SkillResource[]> {
    if (sIds.length === 0) {
      return [];
    }

    // Extract valid custom skill model IDs from sIds.
    const customSkillIds = removeNulls(
      sIds
        .filter((sId) => isResourceSId("skill", sId))
        .map((sId) => getResourceIdFromSId(sId))
    );

    // Fetch custom skills in batch.
    const customSkills =
      customSkillIds.length > 0
        ? await this.baseFetch(auth, {
            where: {
              id: customSkillIds,
            },
            onlyCustom: true,
          })
        : [];

    // Find which sIds were not found as custom skills and fetch them from global skills.
    const foundCustomSIds = new Set(customSkills.map((s) => s.sId));
    const missingSIds = sIds.filter((sId) => !foundCustomSIds.has(sId));
    const globalSkills = removeNulls(
      missingSIds.map((sId) => {
        const globalSkill = GlobalSkillsRegistry.getById(sId);
        return globalSkill ? this.fromGlobalSkill(auth, globalSkill) : null;
      })
    );

    return [...customSkills, ...globalSkills];
  }

  static async fetchActiveByName(
    auth: Authenticator,
    name: string
  ): Promise<SkillResource | null> {
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

  static async listByAgentConfiguration(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType
  ): Promise<SkillResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const agentSkills = await AgentSkillModel.findAll({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId: workspace.id,
      },
    });

    const customSkillIds = removeNulls(
      agentSkills.map((as) => as.customSkillId)
    );
    const globalSkillIds = removeNulls(
      agentSkills.map((as) => as.globalSkillId)
    );

    return this.baseFetch(auth, {
      where: {
        id: customSkillIds,
        sId: globalSkillIds,
      },
    });
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

  static async fetchAllAvailableSkills(
    auth: Authenticator,
    limit?: number
  ): Promise<SkillResource[]> {
    return this.baseFetch(auth, {
      where: {
        status: "active",
      },
      ...(limit ? { limit } : {}),
    });
  }

  static async listSkills(
    auth: Authenticator,
    { status = "active", limit }: { status?: SkillStatus; limit?: number } = {}
  ): Promise<SkillResource[]> {
    return this.baseFetch(auth, {
      where: { status },
      ...(limit ? { limit } : {}),
    });
  }

  /**
   * List enabled skills for a given conversation and agent configuration.
   * Returns only active skills.
   */
  static async listEnabledForConversation(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
    }: {
      agentConfiguration: AgentConfigurationType;
      conversation: ConversationType;
    }
  ) {
    const workspace = auth.getNonNullableWorkspace();

    const conversationSkills = await ConversationSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        agentConfigurationId: agentConfiguration.id,
      },
    });

    const customSkillIds = removeNulls(
      conversationSkills.map((cs) =>
        cs.customSkillId
          ? SkillResource.modelIdToSId({
              id: cs.customSkillId,
              workspaceId: workspace.id,
            })
          : null
      )
    );

    const globalSkillIds = removeNulls(
      conversationSkills.map((cs) => cs.globalSkillId)
    );

    const allSkillIds = [...customSkillIds, ...globalSkillIds];

    if (allSkillIds.length === 0) {
      return [];
    }

    return SkillResource.fetchByIds(auth, allSkillIds);
  }

  private static async baseFetch(
    auth: Authenticator,
    options: SkillConfigurationFindOptions = {}
  ): Promise<SkillResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const { where, includes, onlyCustom, ...otherOptions } = options;

    const customSkills = await this.model.findAll({
      ...otherOptions,
      where: {
        ...omit(where, "sId"),
        workspaceId: workspace.id,
      },
      include: includes,
    });

    let customSkillsRes: SkillResource[] = [];
    if (customSkills.length > 0) {
      const mcpServerConfigurations =
        await SkillMCPServerConfigurationModel.findAll({
          where: {
            workspaceId: workspace.id,
            skillConfigurationId: {
              [Op.in]: customSkills.map((c) => c.id),
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

      // Fetch editor groups for all skills.
      const skillEditorGroupsMap = new Map<number, GroupResource>();

      // Batch fetch all editor groups for all skills.
      const editorGroupSkills = await GroupSkillModel.findAll({
        where: {
          skillConfigurationId: {
            [Op.in]: customSkills.map((s) => s.id),
          },
          workspaceId: workspace.id,
        },
        attributes: ["groupId", "skillConfigurationId"],
      });

      // TODO(SKILLS 2025-12-11): Ensure all skills have ONE group.

      if (editorGroupSkills.length > 0) {
        const uniqueGroupIds = Array.from(
          new Set(editorGroupSkills.map((eg) => eg.groupId))
        );
        const editorGroups = await GroupResource.fetchByModelIds(
          auth,
          uniqueGroupIds
        );

        // Build map from skill ID to editor group.
        for (const editorGroupSkill of editorGroupSkills) {
          const group = editorGroups.find(
            (g) => g.id === editorGroupSkill.groupId
          );
          if (group) {
            skillEditorGroupsMap.set(
              editorGroupSkill.skillConfigurationId,
              group
            );
          }
        }
      }

      customSkillsRes = customSkills.map(
        (c) =>
          new this(this.model, c.get(), {
            mcpServerConfigurations: mcpServerConfigsBySkillId.get(c.id) ?? [],
            editorGroup: skillEditorGroupsMap.get(c.id),
          })
      );
    }

    // Only include global skills if onlyCustom is not true.
    if (onlyCustom === true) {
      return customSkillsRes;
    }

    const globalSkills: SkillResource[] = GlobalSkillsRegistry.findAll(
      where
    ).map((def) => this.fromGlobalSkill(auth, def));

    return [...customSkillsRes, ...globalSkills];
  }

  private static fromGlobalSkill(
    auth: Authenticator,
    def: GlobalSkillDefinition
  ): SkillResource {
    return new SkillResource(
      this.model,
      {
        authorId: -1,
        createdAt: new Date(),
        agentFacingDescription: def.agentFacingDescription,
        userFacingDescription: def.userFacingDescription,
        // We fake the id here. We should rely exclusively on sId for global skills.
        id: -1,
        instructions: def.instructions,
        name: def.name,
        requestedSpaceIds: [],
        status: "active",
        updatedAt: new Date(),
        workspaceId: auth.getNonNullableWorkspace().id,
        icon: null,
      },
      { globalSId: def.sId }
    );
  }

  canWrite(auth: Authenticator): boolean {
    if (!this.editorGroup) {
      return false;
    }

    return this.editorGroup.canWrite(auth);
  }

  async fetchUsage(auth: Authenticator): Promise<AgentsUsageType> {
    const workspace = auth.getNonNullableWorkspace();

    // Fetch agent-skill links for this skill.
    // For global skills, we query by globalSkillId (sId string).
    // For custom skills, we query by customSkillId (numeric id).
    const agentSkills = await AgentSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        ...(this.globalSId
          ? { globalSkillId: this.globalSId }
          : { customSkillId: this.id }),
      },
    });

    if (agentSkills.length === 0) {
      return { count: 0, agents: [] };
    }

    const agentConfigIds = agentSkills.map((as) => as.agentConfigurationId);

    // Fetch related active agent configurations
    const agents = await AgentConfigurationModel.findAll({
      where: {
        id: { [Op.in]: agentConfigIds },
        workspaceId: workspace.id,
        status: "active",
      },
    });

    const sortedAgents = agents
      .map((agent) => ({ sId: agent.sId, name: agent.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      count: sortedAgents.length,
      agents: sortedAgents,
    };
  }

  async listEditors(auth: Authenticator): Promise<UserResource[] | null> {
    return this.editorGroup?.getActiveMembers(auth) ?? null;
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

  async restore(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<{ affectedCount: number }> {
    const [affectedCount] = await this.update(
      {
        status: "active",
      },
      transaction
    );

    return { affectedCount };
  }

  async updateSkill(
    auth: Authenticator,
    {
      name,
      agentFacingDescription,
      userFacingDescription,
      instructions,
      icon,
      requestedSpaceIds,
    }: {
      name: string;
      agentFacingDescription: string;
      userFacingDescription: string;
      instructions: string;
      icon: string | null;
      requestedSpaceIds: number[];
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<SkillResource, Error>> {
    // Save the current version before updating.
    await this.saveVersion(auth, { transaction });

    await this.update(
      {
        name,
        agentFacingDescription,
        userFacingDescription,
        instructions,
        icon,
        requestedSpaceIds,
      },
      transaction
    );

    // Fetch the updated resource
    const updated = await SkillResource.fetchByModelIdWithAuth(auth, this.id);

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

  async update(
    blob: Partial<Attributes<SkillConfigurationModel>>,
    transaction?: Transaction
  ): Promise<[affectedCount: number]> {
    // TODO(SKILLS 2025-12-12): Refactor BaseResource.update to accept auth.
    if (this.globalSId) {
      throw new Error("Cannot update a global skill configuration.");
    }

    return super.update(blob, transaction);
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined | number, Error>> {
    if (!this.canWrite(auth)) {
      return new Err(
        new Error("User does not have permission to delete this skill.")
      );
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
      source: ConversationSkillOrigin;
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
      customSkillId: this.isGlobal ? null : this.id,
      globalSkillId: this.isGlobal ? this.globalSId : null,
      agentMessageId: agentMessage.agentMessageId,
      conversationId: conversation.id,
      source,
      addedByUserId: user && source === "conversation" ? user.id : null,
    });

    await ConversationSkillModel.create({
      workspaceId: workspace.id,
      agentConfigurationId: agentConfiguration.id,
      customSkillId: this.isGlobal ? null : this.id,
      globalSkillId: this.isGlobal ? this.globalSId : null,
      conversationId: conversation.id,
      source,
      addedByUserId: user && source === "conversation" ? user.id : null,
    });

    return new Ok(undefined);
  }

  toJSON(auth: Authenticator): SkillConfigurationType {
    const tools = this.mcpServerConfigurations.map((config) => ({
      mcpServerViewId: makeSId("mcp_server_view", {
        id: config.mcpServerViewId,
        workspaceId: this.workspaceId,
      }),
    }));

    const requestedSpaceIds = this.requestedSpaceIds.map((spaceId) =>
      SpaceResource.modelIdToSId({
        id: Number(spaceId), // Note: Sequelize returns BIGINT arrays as strings
        workspaceId: this.workspaceId,
      })
    );

    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.globalSId ? null : this.createdAt.getTime(),
      updatedAt: this.globalSId ? null : this.updatedAt.getTime(),
      status: this.status,
      name: this.name,
      agentFacingDescription: this.agentFacingDescription,
      userFacingDescription: this.userFacingDescription,
      // We don't want to leak global skills instructions to frontend
      instructions: this.globalSId ? null : this.instructions,
      requestedSpaceIds: requestedSpaceIds,
      icon: this.icon ?? null,
      tools,
      canWrite: this.canWrite(auth),
    };
  }

  private async saveVersion(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    // Fetch current MCP server configuration IDs for this skill
    const mcpServerConfigurations =
      await SkillMCPServerConfigurationModel.findAll({
        where: {
          workspaceId: workspace.id,
          skillConfigurationId: this.id,
        },
        transaction,
      });

    const mcpServerConfigurationIds = mcpServerConfigurations.map(
      (config) => config.mcpServerViewId
    );

    // Calculate the next version number by counting existing versions
    const where: WhereOptions<SkillVersionModel> = {
      workspaceId: this.workspaceId,
      skillConfigurationId: this.id,
    };

    const existingVersionsCount = await SkillVersionModel.count({
      where,
      transaction,
    });

    const versionNumber = existingVersionsCount + 1;

    // Create a new version entry with the current state
    const versionData: SkillVersionCreationAttributes = {
      workspaceId: this.workspaceId,
      skillConfigurationId: this.id,
      version: versionNumber,
      status: this.status,
      name: this.name,
      agentFacingDescription: this.agentFacingDescription,
      userFacingDescription: this.userFacingDescription,
      instructions: this.instructions,
      requestedSpaceIds: this.requestedSpaceIds,
      authorId: this.authorId,
      mcpServerConfigurationIds,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };

    await SkillVersionModel.create(versionData, { transaction });
  }
}
