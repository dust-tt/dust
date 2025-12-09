import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { AgentMessageSkillModel } from "@app/lib/models/skill/agent_message_skill";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type {
  AgentConfigurationType,
  AgentMessageType,
  AgentsUsageType,
  ConversationType,
  ModelId,
  Result,
} from "@app/types";
import { Err, normalizeError, Ok, removeNulls } from "@app/types";
import type { AgentMessageSkillSource } from "@app/types/agent_message_skills";
import type {
  SkillConfigurationRelations,
  SkillConfigurationType,
} from "@app/types/skill_configuration";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SkillConfigurationResource
  extends ReadonlyAttributesType<SkillConfigurationModel> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SkillConfigurationResource extends BaseResource<SkillConfigurationModel> {
  static model: ModelStatic<SkillConfigurationModel> = SkillConfigurationModel;

  readonly mcpServerConfigurations: Attributes<SkillMCPServerConfigurationModel>[];
  readonly canEdit: boolean;

  constructor(
    model: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    {
      mcpServerConfigurations,
      canEdit = true,
    }: {
      mcpServerConfigurations?: Attributes<SkillMCPServerConfigurationModel>[];
      canEdit?: boolean;
    } = {}
  ) {
    super(SkillConfigurationModel, blob);

    this.mcpServerConfigurations = mcpServerConfigurations ?? [];
    this.canEdit = canEdit;
  }

  get sId(): string {
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

  static async fetchById(
    auth: Authenticator,
    skillId: string
  ): Promise<SkillConfigurationResource | null> {
    if (!isResourceSId("skill", skillId)) {
      return null;
    }

    const resourceId = getResourceIdFromSId(skillId);
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

    // TODO(skills 2025-12-09): Add support for global skills.
    // When globalSkillId is set, we need to fetch the skill from the global registry
    // and return it as a SkillConfigurationResource.
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

  protected static async baseFetch(
    auth: Authenticator,
    options: ResourceFindOptions<SkillConfigurationModel> = {}
  ): Promise<SkillConfigurationResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const { where, includes, ...otherOptions } = options;

    const skillConfigurations = await this.model.findAll({
      ...otherOptions,
      where: {
        ...where,
        workspaceId: workspace.id,
      },
      include: includes,
    });

    if (skillConfigurations.length === 0) {
      return [];
    }

    const mcpServerConfigurations =
      await SkillMCPServerConfigurationModel.findAll({
        where: {
          workspaceId: workspace.id,
          skillConfigurationId: {
            [Op.in]: skillConfigurations.map((c) => c.id),
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
        skillConfigurations.map((s) => s.id)
      );

      if (editorGroupsRes.isOk()) {
        const editorGroups = editorGroupsRes.value;
        const uniqueGroups = Array.from(
          new Set(Object.values(editorGroups).map((g) => g.id))
        ).map((id) => Object.values(editorGroups).find((g) => g.id === id)!);

        // Batch fetch active members for all editor groups
        const groupMemberships =
          await GroupResource.getActiveMembershipsForGroups(auth, uniqueGroups);

        // Build canEdit map
        for (const skill of skillConfigurations) {
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
        for (const skill of skillConfigurations) {
          const canEdit = user && skill.authorId === user.id;
          canEditMap.set(skill.id, canEdit);
        }
      }
    } else {
      // No user, no edit permissions
      for (const skill of skillConfigurations) {
        canEditMap.set(skill.id, false);
      }
    }

    return skillConfigurations.map(
      (c) =>
        new this(this.model, c.get(), {
          mcpServerConfigurations: mcpServerConfigsBySkillId.get(c.id) ?? [],
          canEdit: canEditMap.get(c.id) ?? false,
        })
    );
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

  // Static method for fetching with relations (usage, etc.)
  static async fetchWithRelations(
    auth: Authenticator
  ): Promise<SkillConfigurationResourceWithRelations[]> {
    const resources = await this.baseFetch(auth, {});

    if (resources.length === 0) {
      return [];
    }

    // Fetch usage for each skill individually
    const resourcesWithRelations = await Promise.all(
      resources.map(async (resource) => {
        const usage = await resource.fetchUsage(auth);
        return new SkillConfigurationResourceWithRelations(resource, usage);
      })
    );

    return resourcesWithRelations;
  }

  // Fetch usage data for this skill
  // TODO(skills 2025-12-10): Add support for global skills
  async fetchUsage(auth: Authenticator): Promise<AgentsUsageType> {
    const workspace = auth.getNonNullableWorkspace();

    // Fetch agent-skill links for this skill
    const agentSkills = await AgentSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        customSkillId: this.id,
      },
    });

    if (agentSkills.length === 0) {
      return { count: 0, agents: [] };
    }

    // Get agent configuration IDs
    const agentConfigIds = agentSkills.map((as) => as.agentConfigurationId);

    // Fetch active agent configurations
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

  async archive(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined | number, Error>> {
    try {
      const workspace = auth.getNonNullableWorkspace();

      // Remove all agent skill links before archiving
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

      return new Ok(affectedCount);
    } catch (error) {
      return new Err(normalizeError(error));
    }
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
    try {
      const workspace = auth.getNonNullableWorkspace();

      await this.model.update(
        {
          name,
          description,
          instructions,
          version: this.version + 1,
        },
        {
          where: {
            id: this.id,
            workspaceId: workspace.id,
          },
          transaction,
        }
      );

      // Fetch the updated resource
      const updated = await SkillConfigurationResource.fetchByModelIdWithAuth(
        auth,
        this.id
      );

      if (!updated) {
        return new Err(
          new Error("Failed to fetch updated skill configuration")
        );
      }

      return new Ok(updated);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  async updateTools(
    auth: Authenticator,
    {
      mcpServerViews,
    }: {
      mcpServerViews: MCPServerViewResource[];
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<{ mcpServerViewId: string }[], Error>> {
    try {
      const workspace = auth.getNonNullableWorkspace();

      // Delete existing tool associations
      await SkillMCPServerConfigurationModel.destroy({
        where: {
          workspaceId: workspace.id,
          skillConfigurationId: this.id,
        },
        transaction,
      });

      // Create new tool associations
      await SkillMCPServerConfigurationModel.bulkCreate(
        mcpServerViews.map((mcpServerView) => ({
          workspaceId: workspace.id,
          skillConfigurationId: this.id,
          mcpServerViewId: mcpServerView.id,
        })),
        { transaction }
      );

      return new Ok(
        mcpServerViews.map((mcpServerView) => ({
          mcpServerViewId: mcpServerView.sId,
        }))
      );
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined | number, Error>> {
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

  toJSON(): SkillConfigurationType {
    const tools = this.mcpServerConfigurations.map((config) => ({
      mcpServerViewId: makeSId("mcp_server_view", {
        id: config.mcpServerViewId,
        workspaceId: this.workspaceId,
      }),
    }));

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

// Resource with relations - extends base and includes relations data that we don't want to include in the base resource
// Not intended for direct instantiation
class SkillConfigurationResourceWithRelations extends SkillConfigurationResource {
  readonly usage: AgentsUsageType;

  constructor(resource: SkillConfigurationResource, usage: AgentsUsageType) {
    super(SkillConfigurationResourceWithRelations.model, resource, {
      mcpServerConfigurations: resource.mcpServerConfigurations,
      canEdit: resource.canEdit,
    });
    this.usage = usage;
  }

  override toJSON(): SkillConfigurationType & SkillConfigurationRelations {
    return {
      ...super.toJSON(),
      usage: this.usage,
    };
  }
}
