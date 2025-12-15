import groupBy from "lodash/groupBy";
import omit from "lodash/omit";
import uniq from "lodash/uniq";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
  WhereOptions,
} from "sequelize";
import { Op } from "sequelize";

import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { DATA_WAREHOUSE_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import { hasSharedMembership } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import {
  AgentMessageSkillModel,
  ConversationSkillModel,
} from "@app/lib/models/skill/conversation_skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { BaseResource } from "@app/lib/resources/base_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import {
  AUTO_ENABLED_SKILL_IDS,
  GlobalSkillsRegistry,
} from "@app/lib/resources/skill/global/registry";
import type { SkillConfigurationFindOptions } from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  AgentConfigurationType,
  AgentsUsageType,
  ConversationType,
  LightAgentConfigurationType,
  ModelId,
  Result,
} from "@app/types";
import { Err, normalizeError, Ok, removeNulls } from "@app/types";
import type { ConversationSkillOrigin } from "@app/types/assistant/conversation_skills";
import type {
  SkillStatus,
  SkillType,
} from "@app/types/assistant/skill_configuration";

type SkillResourceConstructorOptions =
  | {
      // For global skills, there is no editor group.
      editorGroup?: undefined;
      globalSId: string;
      mcpServerViews: MCPServerViewResource[];
    }
  | {
      editorGroup?: GroupResource;
      globalSId?: undefined;
      mcpServerViews: MCPServerViewResource[];
    };

type SkillVersionCreationAttributes =
  CreationAttributes<SkillConfigurationModel> & {
    skillConfigurationId: number;
    version: number;
    mcpServerConfigurationIds: number[];
  };

type ConversationSkillCreationAttributes =
  CreationAttributes<ConversationSkillModel> &
    (
      | {
          source: "conversation";
          agentConfigurationId: null;
        }
      | {
          source: "agent_enabled";
          agentConfigurationId: string;
        }
    );

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
  readonly mcpServerViews: MCPServerViewResource[];

  private readonly globalSId: string | null;

  private constructor(
    model: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    { globalSId, mcpServerViews, editorGroup }: SkillResourceConstructorOptions
  ) {
    super(SkillConfigurationModel, blob);

    this.editorGroup = editorGroup ?? null;
    this.globalSId = globalSId ?? null;
    this.mcpServerViews = mcpServerViews;
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
  get isGlobal(): boolean {
    return this.globalSId !== null;
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

      return new this(this.model, skill.get(), {
        editorGroup,
        mcpServerViews: [],
      });
    });

    return skillResource;
  }

  private static async baseFetch(
    auth: Authenticator,
    options: SkillConfigurationFindOptions = {},
    context: { agentConfiguration?: LightAgentConfigurationType } = {}
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

      const skillMCPServerConfigsBySkillId = groupBy(
        mcpServerConfigurations,
        "skillConfigurationId"
      );

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

      const allMCPServerViews = await MCPServerViewResource.fetchByModelIds(
        auth,
        removeNulls(mcpServerConfigurations.map((c) => c.mcpServerViewId))
      );

      customSkillsRes = customSkills.map((customSkill) => {
        const skillMCPServerViewIds = skillMCPServerConfigsBySkillId[
          customSkill.id
        ]?.map((skillConfig) => skillConfig.mcpServerViewId);

        return new this(this.model, customSkill.get(), {
          mcpServerViews: allMCPServerViews.filter((view) =>
            skillMCPServerViewIds?.includes(view.id)
          ),
          editorGroup: skillEditorGroupsMap.get(customSkill.id),
        });
      });
    }

    // Only include global skills if onlyCustom is not true.
    if (onlyCustom === true) {
      return customSkillsRes;
    }

    const globalSkillDefinitions = GlobalSkillsRegistry.findAll(where);
    const globalSkills: SkillResource[] = [];

    // Fetch global skills with their MCP server configurations.
    await concurrentExecutor(
      globalSkillDefinitions,
      async (def) => {
        const skill = await this.fromGlobalSkill(auth, def, context);
        globalSkills.push(skill);
      },
      { concurrency: 5 }
    );

    return [...customSkillsRes, ...globalSkills];
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

  static async fetchByModelIds(
    auth: Authenticator,
    ids: ModelId[]
  ): Promise<SkillResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: ids,
        },
      },
      onlyCustom: true,
    });
  }

  static async fetchById(
    auth: Authenticator,
    sId: string
  ): Promise<SkillResource | null> {
    const [skill] = await this.fetchByIds(auth, [sId]);

    return skill;
  }

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[],
    context: { agentConfiguration?: LightAgentConfigurationType } = {}
  ): Promise<SkillResource[]> {
    if (sIds.length === 0) {
      return [];
    }

    // Separate custom skill IDs from global skill IDs.
    const { customSkillIds, globalSkillIds } = sIds.reduce<{
      customSkillIds: ModelId[];
      globalSkillIds: string[];
    }>(
      (acc, sId) => {
        if (isResourceSId("skill", sId)) {
          const modelId = getResourceIdFromSId(sId);
          if (modelId !== null) {
            acc.customSkillIds.push(modelId);
          }
        } else {
          acc.globalSkillIds.push(sId);
        }
        return acc;
      },
      { customSkillIds: [], globalSkillIds: [] }
    );

    return this.baseFetch(
      auth,
      {
        where: {
          id: customSkillIds,
          sId: globalSkillIds,
        },
      },
      context
    );
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

  private static async listByAgentConfiguration(
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
  private static async listEnabledForConversation(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
    }: {
      agentConfiguration: AgentConfigurationType;
      conversation: ConversationType;
    }
  ): Promise<SkillResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    // Fetch the conversation skills for this agent and the ones for all agents.
    const conversationSkills = await ConversationSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        [Op.or]: [
          { agentConfigurationId: agentConfiguration.sId },
          { agentConfigurationId: null },
        ],
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

    return SkillResource.fetchByIds(auth, allSkillIds, { agentConfiguration });
  }

  /**
   * List skills for the agent loop, returning both (extended) enabled skills and equipped skills.
   */
  static async listForAgentLoop(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
    }: {
      agentConfiguration: AgentConfigurationType;
      conversation: ConversationType;
    }
  ): Promise<{
    enabledSkills: (SkillResource & { extendedSkill: SkillResource | null })[];
    equippedSkills: SkillResource[];
  }> {
    const conversationEnabledSkills = await this.listEnabledForConversation(
      auth,
      {
        agentConfiguration,
        conversation,
      }
    );
    const allAgentSkills = await this.listByAgentConfiguration(
      auth,
      agentConfiguration
    );

    // Auto-enabled skills are always treated as enabled when present in the agent configuration.
    const autoEnabledSkills = allAgentSkills.filter((s) =>
      AUTO_ENABLED_SKILL_IDS.has(s.sId)
    );

    const enabledSkills = [...conversationEnabledSkills, ...autoEnabledSkills];
    // Skills that are already enabled are not equipped.
    const enabledSkillIds = new Set(enabledSkills.map((s) => s.sId));
    const equippedSkills = allAgentSkills.filter(
      (s) => !enabledSkillIds.has(s.sId)
    );

    // TODO(skills 2025-12-23): refactor to retrieve extended skills from baseFetch
    const augmentedEnabledSkills = await this.augmentSkillsWithExtendedSkills(
      auth,
      enabledSkills
    );

    return {
      enabledSkills: augmentedEnabledSkills,
      equippedSkills,
    };
  }

  private static async augmentSkillsWithExtendedSkills(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<(SkillResource & { extendedSkill: SkillResource | null })[]> {
    const extendedSkillIds = removeNulls(
      uniq(skills.map((skill) => skill.extendedSkillId))
    );
    const extendedSkills = await SkillResource.fetchByIds(
      auth,
      extendedSkillIds
    );

    // Create a map for quick lookup of extended skills.
    const extendedSkillsMap = new Map(
      extendedSkills.map((skill) => [skill.sId, skill])
    );

    return skills.map((skill) =>
      Object.assign(skill, {
        extendedSkill: skill.extendedSkillId
          ? (extendedSkillsMap.get(skill.extendedSkillId) ?? null)
          : null,
      })
    );
  }

  static async fetchConversationSkillRecords(
    auth: Authenticator,
    conversationId: ModelId
  ): Promise<
    Array<{
      id: ModelId;
      workspaceId: ModelId;
      conversationId: ModelId;
      agentConfigurationId: string | null;
      source: ConversationSkillOrigin;
      addedByUserId: ModelId | null;
      createdAt: Date;
      updatedAt: Date;
      customSkillId: ModelId | null;
      globalSkillId: string | null;
    }>
  > {
    const conversationSkills = await ConversationSkillModel.findAll({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        conversationId,
      },
    });

    return conversationSkills.map((skill) => ({
      id: skill.id,
      workspaceId: skill.workspaceId,
      conversationId: skill.conversationId,
      agentConfigurationId: skill.agentConfigurationId,
      source: skill.source,
      addedByUserId: skill.addedByUserId,
      createdAt: skill.createdAt,
      updatedAt: skill.updatedAt,
      customSkillId: skill.customSkillId,
      globalSkillId: skill.globalSkillId,
    }));
  }

  async upsertToConversation(
    auth: Authenticator,
    {
      conversationId,
      enabled,
    }: {
      conversationId: ModelId;
      enabled: boolean;
    }
  ): Promise<Result<undefined, Error>> {
    const user = auth.user();
    if (!user) {
      return new Err(new Error("User must be authenticated"));
    }

    const workspace = auth.getNonNullableWorkspace();

    const existingConversationSkill = await ConversationSkillModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId,
        agentConfigurationId: null,
        ...(this.isGlobal
          ? { globalSkillId: this.sId }
          : { customSkillId: this.id }),
      },
    });

    if (existingConversationSkill && !enabled) {
      await existingConversationSkill.destroy();
      return new Ok(undefined);
    }

    if (!existingConversationSkill && enabled) {
      await ConversationSkillModel.create({
        conversationId,
        workspaceId: workspace.id,
        agentConfigurationId: null,
        customSkillId: this.globalSId ? null : this.id,
        globalSkillId: this.globalSId ?? null,
        source: "conversation",
        addedByUserId: user.id,
      } satisfies ConversationSkillCreationAttributes);
      return new Ok(undefined);
    }

    return new Ok(undefined);
  }

  static async upsertConversationSkills(
    auth: Authenticator,
    {
      conversationId,
      skills,
      enabled,
    }: {
      conversationId: ModelId;
      skills: SkillResource[];
      enabled: boolean;
    }
  ): Promise<Result<undefined, Error>> {
    for (const skill of skills) {
      const result = await skill.upsertToConversation(auth, {
        conversationId,
        enabled,
      });

      if (result.isErr()) {
        return result;
      }
    }

    return new Ok(undefined);
  }

  private static async fromGlobalSkill(
    auth: Authenticator,
    def: GlobalSkillDefinition,
    context: { agentConfiguration?: LightAgentConfigurationType } = {}
  ): Promise<SkillResource> {
    // Fetch MCP server configurations if the global skill has an internal MCP server.
    let mcpServerViews: MCPServerViewResource[] = [];
    const requestedSpaceIds = context?.agentConfiguration?.requestedSpaceIds
      ? removeNulls(
          context.agentConfiguration.requestedSpaceIds.map(getResourceIdFromSId)
        )
      : [];

    if (def.internalMCPServerNames) {
      const mcpServerViewsByName = await concurrentExecutor(
        def.internalMCPServerNames,
        async (name) =>
          MCPServerViewResource.listMCPServerViewsAutoInternalForSpaces(
            auth,
            name,
            requestedSpaceIds
          ),
        { concurrency: 5 }
      );
      mcpServerViews = mcpServerViewsByName.flat();
    }

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
        requestedSpaceIds,
        status: "active",
        updatedAt: new Date(),
        workspaceId: auth.getNonNullableWorkspace().id,
        icon: def.icon,
        extendedSkillId: null,
      },
      { globalSId: def.sId, mcpServerViews }
    );
  }

  canWrite(auth: Authenticator): boolean {
    if (!this.editorGroup) {
      return false;
    }

    return this.editorGroup.canWrite(auth);
  }

  isExtendable(): boolean {
    return this.isGlobal;
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

  async listVersions(auth: Authenticator): Promise<SkillResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    // Fetch all historical versions from skill_versions table
    const where: WhereOptions<SkillVersionModel> = {
      workspaceId: workspace.id,
      skillConfigurationId: this.id,
    };

    const versionModels = await SkillVersionModel.findAll({
      where,
    });

    // Sort application-side
    const sortedVersionModels = versionModels.sort(
      (a, b) => b.version - a.version
    );

    // Convert version models to SkillResource instances
    const historicalVersions: SkillResource[] = await concurrentExecutor(
      sortedVersionModels,
      async (versionModel) => {
        // TODO(skills 2025-12-23): add caching on the MCP server views across versions.
        const mcpServerViews = await MCPServerViewResource.fetchByModelIds(
          auth,
          versionModel.mcpServerConfigurationIds
        );

        return new SkillResource(
          this.model,
          {
            id: this.id,
            workspaceId: workspace.id,
            authorId: versionModel.authorId,
            createdAt: versionModel.createdAt,
            updatedAt: versionModel.updatedAt,
            status: versionModel.status,
            name: versionModel.name,
            agentFacingDescription: versionModel.agentFacingDescription,
            userFacingDescription: versionModel.userFacingDescription,
            instructions: versionModel.instructions,
            icon: versionModel.icon,
            requestedSpaceIds: versionModel.requestedSpaceIds,
            extendedSkillId: versionModel.extendedSkillId,
          },
          {
            editorGroup: this.editorGroup ?? undefined,
            mcpServerViews,
          }
        );
      },
      { concurrency: 5 }
    );

    // Return current version + all historical versions
    return [this, ...historicalVersions];
  }

  async listEditors(auth: Authenticator): Promise<UserResource[] | null> {
    return this.editorGroup?.getActiveMembers(auth) ?? null;
  }

  async fetchAuthor(auth: Authenticator): Promise<UserResource | null> {
    const author = await UserResource.fetchByModelId(this.authorId);

    if (!author) {
      return null;
    }

    const shouldReturnAuthor = await hasSharedMembership(auth, {
      user: author,
    });

    return shouldReturnAuthor ? author : null;
  }

  async listMCPServerConfigurations(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType
  ): Promise<ServerSideMCPServerConfigurationType[]> {
    let inheritedDataSources: DataSourceConfiguration[] | null = null;

    if (this.globalSId !== null) {
      const globalSkill = GlobalSkillsRegistry.getById(this.globalSId);
      if (globalSkill?.inheritAgentConfigurationDataSources) {
        const dataSourceViews =
          await DataSourceViewResource.listBySpaceIdsAndGlobal(
            auth,
            agentConfiguration.requestedSpaceIds
          );

        inheritedDataSources = dataSourceViews.map((dsView) => ({
          dataSourceViewId: dsView.sId,
          workspaceId: auth.getNonNullableWorkspace().sId,
          filter: { parents: null, tags: null },
        }));
      }
    }

    return this.mcpServerViews.map((mcpServerView) => {
      const { server } = mcpServerView.toJSON();
      const dataSources = [
        "data_sources_file_system",
        DATA_WAREHOUSE_SERVER_NAME,
      ].includes(server.name)
        ? inheritedDataSources
        : null;

      return {
        id: -1,
        sId: `mcp_${server.sId}`,
        type: "mcp_server_configuration",
        name: mcpServerView.name ?? server.name,
        description: mcpServerView.description ?? server.description,
        icon: server.icon,
        mcpServerViewId: mcpServerView.sId,
        internalMCPServerId: mcpServerView.internalMCPServerId ?? null,
        dataSources,
        tables: null,
        dustAppConfiguration: null,
        childAgentId: null,
        timeFrame: null,
        jsonSchema: null,
        additionalConfiguration: {},
        secretName: null,
      } satisfies ServerSideMCPServerConfigurationType;
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
      requestedSpaceIds: ModelId[];
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<SkillResource, Error>> {
    // Save the current version before updating.
    await this.saveVersion(auth, { transaction });

    const authorId = auth.user()?.id;

    await this.update(
      {
        name,
        agentFacingDescription,
        userFacingDescription,
        instructions,
        icon,
        requestedSpaceIds,
        authorId,
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

  async addToAgent(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    await AgentSkillModel.create({
      workspaceId: workspace.id,
      agentConfigurationId: agentConfiguration.id,
      customSkillId: this.globalSId ? null : this.id,
      globalSkillId: this.globalSId,
    });
  }

  async enableForAgent(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
    }: {
      agentConfiguration: AgentConfigurationType;
      conversation: ConversationType;
    }
  ): Promise<Result<void, Error>> {
    const workspace = auth.getNonNullableWorkspace();

    const agentSkill = await AgentSkillModel.findOne({
      where: {
        workspaceId: workspace.id,
        agentConfigurationId: agentConfiguration.id,
        ...(this.globalSId
          ? { globalSkillId: this.globalSId }
          : { customSkillId: this.id }),
      },
    });

    if (!agentSkill) {
      return new Err(
        new Error(
          `Skill ${this.name} was not added to agent ${agentConfiguration.name}.`
        )
      );
    }

    const conversationSkillBlob: ConversationSkillCreationAttributes = {
      workspaceId: workspace.id,
      customSkillId: this.isGlobal ? null : this.id,
      globalSkillId: this.isGlobal ? this.globalSId : null,
      conversationId: conversation.id,
      addedByUserId: null,
      source: "agent_enabled",
      agentConfigurationId: agentConfiguration.sId,
    };

    await ConversationSkillModel.create(conversationSkillBlob);

    return new Ok(undefined);
  }

  static async snapshotConversationSkillsForMessage(
    auth: Authenticator,
    {
      agentConfigurationId,
      agentMessageId,
      conversationId,
    }: {
      agentConfigurationId: string;
      agentMessageId: ModelId;
      conversationId: ModelId;
    }
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    const conversationSkills = await ConversationSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId,
        agentConfigurationId,
      },
    });

    await AgentMessageSkillModel.bulkCreate(
      conversationSkills.map((cs) => ({
        workspaceId: workspace.id,
        agentConfigurationId: cs.agentConfigurationId,
        customSkillId: cs.customSkillId,
        globalSkillId: cs.globalSkillId,
        agentMessageId,
        conversationId: cs.conversationId,
        source: cs.source,
        addedByUserId: cs.addedByUserId,
      }))
    );
  }

  static async listByAgentMessageId(
    auth: Authenticator,
    agentMessageId: ModelId
  ): Promise<SkillResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const where: WhereOptions<AgentMessageSkillModel> = {
      workspaceId: workspace.id,
      agentMessageId,
    };

    const agentMessageSkills = await AgentMessageSkillModel.findAll({
      where,
    });

    const customSkills = await this.fetchByModelIds(
      auth,
      removeNulls(agentMessageSkills.map((ams) => ams.customSkillId))
    );

    const globalSkills = await this.fetchByIds(
      auth,
      removeNulls(agentMessageSkills.map((ams) => ams.globalSkillId))
    );

    return [...customSkills, ...globalSkills];
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    await AgentSkillModel.destroy({
      where: { workspaceId },
    });

    await GroupSkillModel.destroy({
      where: { workspaceId },
    });

    await SkillMCPServerConfigurationModel.destroy({
      where: { workspaceId },
    });

    await SkillVersionModel.destroy({
      where: { workspaceId },
    });

    await SkillConfigurationModel.destroy({
      where: { workspaceId },
    });
  }

  toJSON(auth: Authenticator): SkillType {
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
      authorId: this.globalSId ? null : this.authorId,
      status: this.status,
      name: this.name,
      agentFacingDescription: this.agentFacingDescription,
      userFacingDescription: this.userFacingDescription,
      // We don't want to leak global skills instructions to frontend
      instructions: this.globalSId ? null : this.instructions,
      requestedSpaceIds: requestedSpaceIds,
      icon: this.icon ?? null,
      // TODO(skills: 2025-12-23): return entire MCPServerViewType here and update call sites.
      tools: this.mcpServerViews.map((view) => ({
        mcpServerViewId: view.sId,
      })),
      canWrite: this.canWrite(auth),
      isExtendable: this.isExtendable(),
      extendedSkillId: this.extendedSkillId,
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
      // TODO(skills 2025-12-23): rename into mcpServerViewIds.
      mcpServerConfigurationIds,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };

    await SkillVersionModel.create(versionData, { transaction });
  }
}
