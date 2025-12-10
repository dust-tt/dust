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
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import type { ModelId, Result } from "@app/types";
import {
  Err,
  formatUserFullName,
  normalizeError,
  Ok,
  removeNulls,
} from "@app/types";
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SkillConfigurationResource extends BaseResource<SkillConfigurationModel> {
  static model: ModelStatic<SkillConfigurationModel> = SkillConfigurationModel;

  readonly author?: Attributes<UserModel>;
  readonly mcpServerConfigurations: Attributes<SkillMCPServerConfigurationModel>[];
  readonly canEdit: boolean;

  constructor(
    model: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    {
      author,
      mcpServerConfigurations,
      canEdit = true,
    }: {
      author?: Attributes<UserModel>;
      mcpServerConfigurations?: Attributes<SkillMCPServerConfigurationModel>[];
      canEdit?: boolean;
    } = {}
  ) {
    super(SkillConfigurationModel, blob);

    this.author = author;
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
    });

    if (resources.length === 0) {
      return null;
    }

    return resources[0];
  }

  static async fetchBySId(
    auth: Authenticator,
    sId: string
  ): Promise<SkillConfigurationResource | null> {
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

  private static async baseFetch<T extends Model, S extends string>(
    auth: Authenticator,
    options: ResourceFindOptions<SkillConfigurationModel> & {
      includes: [{ model: ModelStatic<T>; as: S; required: true }];
    }
  ): Promise<(SkillConfigurationResource & { [K in S]: Attributes<T> })[]>;

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<SkillConfigurationModel>
  ): Promise<SkillConfigurationResource[]>;

  private static async baseFetch(
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
          author: c.author?.get(),
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

      const [affectedCount] = await this.model.update(
        {
          status: "archived",
        },
        {
          where: {
            id: this.id,
            workspaceId: workspace.id,
          },
          transaction,
        }
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
      mcpServerViewIds,
    }: {
      mcpServerViewIds: string[];
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
      const createdTools: { mcpServerViewId: string }[] = [];
      for (const mcpServerViewId of mcpServerViewIds) {
        const mcpServerView = await MCPServerViewResource.fetchById(
          auth,
          mcpServerViewId
        );

        if (!mcpServerView) {
          return new Err(
            new Error(`MCP server view not found: ${mcpServerViewId}`)
          );
        }

        await SkillMCPServerConfigurationModel.create(
          {
            workspaceId: workspace.id,
            skillConfigurationId: this.id,
            mcpServerViewId: mcpServerView.id,
          },
          { transaction }
        );

        createdTools.push({ mcpServerViewId });
      }

      return new Ok(createdTools);
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
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
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
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
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
