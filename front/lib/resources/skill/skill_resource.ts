import {
  getAgentConfiguration,
  updateAgentRequirements,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import { hasSharedMembership } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { hasAll } from "@app/lib/matcher/operators/array";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
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
import {
  createResourcePermissionsFromSpacesWithMap,
  createSpaceIdToGroupsMap,
} from "@app/lib/resources/permission_utils";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/global/registry";
import type { SkillConfigurationFindOptions } from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type {
  SkillStatus,
  SkillType,
} from "@app/types/assistant/skill_configuration";
import type { AgentsUsageType } from "@app/types/data_source";
import { SKILL_GROUP_PREFIX } from "@app/types/groups";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import groupBy from "lodash/groupBy";
import isEqual from "lodash/isEqual";
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

export type SkillMCPServerConfiguration = {
  view: MCPServerViewResource;
  childAgentId?: string;
  serverNameOverride?: string;
};

type SkillResourceConstructorOptions =
  | {
      // For global skills, there is no editor group.
      dataSourceConfigurations: SkillDataSourceConfigurationModel[];
      editorGroup?: undefined;
      globalSId: string;
      mcpServerConfigurations: SkillMCPServerConfiguration[];
      version?: number;
    }
  | {
      dataSourceConfigurations: SkillDataSourceConfigurationModel[];
      editorGroup?: GroupResource;
      globalSId?: undefined;
      mcpServerConfigurations: SkillMCPServerConfiguration[];
      version?: number;
    };

type SkillVersionCreationAttributes =
  CreationAttributes<SkillConfigurationModel> & {
    skillConfigurationId: ModelId;
    version: number;
    mcpServerViewIds: ModelId[];
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

function isSkillResourceWithVersion(
  skill: SkillResource
): skill is SkillResource & { version: number } {
  return skill.version !== null;
}

export interface SkillAttachedKnowledge {
  dataSourceView: DataSourceViewResource;
  nodeId: string;
}

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
 * - Global skills use synthetic database fields (id: -1, editedBy: -1)
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

  readonly dataSourceConfigurations: SkillDataSourceConfigurationModel[];
  readonly editorGroup: GroupResource | null = null;
  readonly version: number | null = null;

  private readonly globalSId: string | null;

  private _mcpServerConfigurations: SkillMCPServerConfiguration[];

  private constructor(
    _: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    {
      dataSourceConfigurations,
      globalSId,
      mcpServerConfigurations,
      editorGroup,
      version,
    }: SkillResourceConstructorOptions
  ) {
    super(SkillConfigurationModel, blob);

    this.dataSourceConfigurations = dataSourceConfigurations;
    this.editorGroup = editorGroup ?? null;
    this.globalSId = globalSId ?? null;
    this._mcpServerConfigurations = mcpServerConfigurations;
    this.version = version ?? null;
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

  get mcpServerViews(): MCPServerViewResource[] {
    return this._mcpServerConfigurations.map((config) => config.view);
  }

  get mcpServerConfigurations(): SkillMCPServerConfiguration[] {
    return this._mcpServerConfigurations;
  }

  /**
   * Get attached knowledge from the skill's data source configurations.
   * Requires data source views to be fetched first.
   */
  async getAttachedKnowledge(
    auth: Authenticator
  ): Promise<SkillAttachedKnowledge[]> {
    if (this.dataSourceConfigurations.length === 0) {
      return [];
    }

    const dataSourceViewIds = uniq(
      this.dataSourceConfigurations.map((c) => c.dataSourceViewId)
    );

    const dataSourceViews = await DataSourceViewResource.fetchByModelIds(
      auth,
      dataSourceViewIds
    );

    const dataSourceViewMap = new Map(dataSourceViews.map((v) => [v.id, v]));

    const attachedKnowledge: SkillAttachedKnowledge[] = [];

    for (const config of this.dataSourceConfigurations) {
      const dataSourceView = dataSourceViewMap.get(config.dataSourceViewId);
      if (dataSourceView) {
        for (const nodeId of config.parentsIn) {
          attachedKnowledge.push({
            dataSourceView,
            nodeId,
          });
        }
      }
    }

    return attachedKnowledge;
  }

  /**
   * Compute the requestedSpaceIds from MCP server views and attached knowledge.
   * This is the source of truth for which spaces a skill needs access to.
   */
  static async computeRequestedSpaceIds(
    auth: Authenticator,
    {
      mcpServerViews,
      attachedKnowledge,
    }: {
      mcpServerViews: MCPServerViewResource[];
      attachedKnowledge: SkillAttachedKnowledge[];
    }
  ): Promise<ModelId[]> {
    const mcpServerViewIds = mcpServerViews.map((v) => v.sId);
    const spaceIdsFromMcpServerViews =
      await MCPServerViewResource.listSpaceRequirementsByIds(
        auth,
        mcpServerViewIds
      );

    const spaceIdsFromAttachedKnowledge = attachedKnowledge.map(
      (k) => k.dataSourceView.space.id
    );

    return uniq([
      ...spaceIdsFromMcpServerViews,
      ...spaceIdsFromAttachedKnowledge,
    ]);
  }

  get isAutoEnabled(): boolean {
    if (!this.globalSId) {
      return false;
    }

    return GlobalSkillsRegistry.isSkillAutoEnabled(this.sId);
  }

  get isExtendable(): boolean {
    // Auto-enabled skills are baseline discovery capabilities: they are not meant to be extended.
    return this.globalSId !== null && !this.isAutoEnabled;
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<SkillConfigurationModel>, "workspaceId">,
    {
      mcpServerViews,
      addCurrentUserAsEditor = true,
      attachedKnowledge = [],
    }: {
      mcpServerViews: MCPServerViewResource[];
      addCurrentUserAsEditor?: boolean;
      attachedKnowledge?: SkillAttachedKnowledge[];
    }
  ): Promise<SkillResource> {
    const owner = auth.getNonNullableWorkspace();

    // Use a transaction to ensure all creations succeed or all are rolled back.
    return withTransaction(async (transaction) => {
      const skill = await this.model.create(
        {
          ...blob,
          workspaceId: owner.id,
        },
        {
          transaction,
        }
      );

      const editorGroup = await this.makeNewSkillEditorsGroup(auth, skill, {
        addCurrentUserAsEditor,
        transaction,
      });

      // MCP server configurations for the skill.
      await SkillMCPServerConfigurationModel.bulkCreate(
        mcpServerViews.map((mcpServerView) => ({
          workspaceId: owner.id,
          skillConfigurationId: skill.id,
          mcpServerViewId: mcpServerView.id,
        })),
        { transaction }
      );

      // Compute what data source configurations to create (no existing configs for new skill).
      const { toUpsert } = this.computeDataSourceConfigurationChanges(owner, {
        attachedKnowledge,
        existingConfigurations: [], // No existing configs for new skill.
        skillConfigurationId: skill.id,
      });

      const dataSourceConfigurations =
        await SkillDataSourceConfigurationModel.bulkCreate(toUpsert, {
          transaction,
        });

      return new this(this.model, skill.get(), {
        dataSourceConfigurations,
        editorGroup,
        mcpServerConfigurations: mcpServerViews.map((view) => ({
          view,
        })),
      });
    });
  }

  static async makeSuggestion(
    auth: Authenticator,
    blob: Omit<
      CreationAttributes<SkillConfigurationModel>,
      "workspaceId" | "status" | "editedBy" | "requestedSpaceIds"
    >,
    {
      mcpServerViewIds,
    }: {
      mcpServerViewIds: string[];
    }
  ): Promise<Result<SkillResource, Error>> {
    const mcpServerViews = await MCPServerViewResource.fetchByIds(
      auth,
      mcpServerViewIds
    );

    if (mcpServerViews.length !== mcpServerViewIds.length) {
      return new Err(new Error("Some MCP server views are missing."));
    }

    const createdSuggestedSkill = await this.makeNew(
      auth,
      {
        ...blob,
        status: "suggested",
        editedBy: null,
        requestedSpaceIds: [],
      },
      {
        mcpServerViews,
        addCurrentUserAsEditor: false,
      }
    );

    return new Ok(createdSuggestedSkill);
  }

  /**
   * Creates a new skill editors group for the given skill and adds the creating
   * user to it.
   */
  private static async makeNewSkillEditorsGroup(
    auth: Authenticator,
    skill: SkillConfigurationModel,
    {
      addCurrentUserAsEditor = true,
      transaction,
    }: {
      addCurrentUserAsEditor?: boolean;
      transaction?: Transaction;
    } = {}
  ): Promise<GroupResource> {
    const workspace = auth.getNonNullableWorkspace();

    assert(
      skill.workspaceId === workspace.id,
      "Unexpected: skill and workspace mismatch"
    );

    const defaultGroup = await GroupResource.makeNew(
      {
        workspaceId: workspace.id,
        name: `${SKILL_GROUP_PREFIX} ${skill.name} (skill:${skill.id})`,
        kind: "skill_editors",
      },
      {
        memberIds: addCurrentUserAsEditor ? [auth.getNonNullableUser().id] : [],
        transaction,
      }
    );

    await GroupSkillModel.create(
      {
        groupId: defaultGroup.id,
        skillConfigurationId: skill.id,
        workspaceId: workspace.id,
      },
      { transaction }
    );

    return defaultGroup;
  }

  private static async baseFetch(
    auth: Authenticator,
    options: SkillConfigurationFindOptions = {},
    context: {
      agentLoopData?: AgentLoopExecutionData;
    } = {}
  ): Promise<SkillResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const { where, includes, onlyCustom, ...otherOptions } = options;

    const customSkills = await this.model.findAll({
      ...otherOptions,
      where: {
        // Fetch active by default, unless explicitly overridden by the caller.
        status: "active",
        ...omit(where, "sId"),
        workspaceId: workspace.id,
      },
      include: includes,
    });

    // Check if the user has access to skill requested spaces.
    const uniqueRequestedSpaceIds = uniq(
      customSkills.flatMap((c) => c.requestedSpaceIds)
    );
    const spaces =
      uniqueRequestedSpaceIds.length > 0
        ? await SpaceResource.fetchByModelIds(auth, uniqueRequestedSpaceIds)
        : [];
    const spaceIdToGroupsMap = createSpaceIdToGroupsMap(auth, spaces);
    const foundSpaceIds = new Set(spaces.map((s) => s.id));

    const validCustomSkills = customSkills.filter((skill) =>
      skill.requestedSpaceIds.every((id) => foundSpaceIds.has(id))
    );

    const allowedCustomSkills = validCustomSkills.filter((skill) =>
      auth.canRead(
        createResourcePermissionsFromSpacesWithMap(
          spaceIdToGroupsMap,
          skill.requestedSpaceIds
        )
      )
    );
    const allowedCustomSkillIds = allowedCustomSkills.map((skill) => skill.id);

    let allowedCustomSkillsRes: SkillResource[] = [];
    if (allowedCustomSkills.length > 0) {
      const mcpServerConfigurations =
        await SkillMCPServerConfigurationModel.findAll({
          where: {
            workspaceId: workspace.id,
            skillConfigurationId: {
              [Op.in]: allowedCustomSkillIds,
            },
          },
        });

      const skillMCPServerConfigsBySkillId = groupBy(
        mcpServerConfigurations,
        "skillConfigurationId"
      );

      const dataSourceConfigurations =
        await SkillDataSourceConfigurationModel.findAll({
          where: {
            workspaceId: workspace.id,
            skillConfigurationId: {
              [Op.in]: customSkills.map((c) => c.id),
            },
          },
        });

      const dataSourceConfigsBySkillId = groupBy(
        dataSourceConfigurations,
        "skillConfigurationId"
      );

      // Fetch editor groups for all skills.
      const skillEditorGroupsMap = new Map<number, GroupResource>();

      // Batch fetch all editor groups for all skills.
      const editorGroupSkills = await GroupSkillModel.findAll({
        where: {
          skillConfigurationId: {
            [Op.in]: allowedCustomSkillIds,
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

        // Build a map from a skill's ID to its editor group.
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

      allowedCustomSkillsRes = allowedCustomSkills.map((customSkill) => {
        const skillMCPServerViewIds = skillMCPServerConfigsBySkillId[
          customSkill.id
        ]?.map((skillConfig) => skillConfig.mcpServerViewId);

        const skillDataSourceConfigs =
          dataSourceConfigsBySkillId[customSkill.id] ?? [];

        const skillMCPServerViews = allMCPServerViews.filter((view) =>
          skillMCPServerViewIds?.includes(view.id)
        );

        return new this(this.model, customSkill.get(), {
          mcpServerConfigurations: skillMCPServerViews.map((view) => ({
            view,
          })),
          editorGroup: skillEditorGroupsMap.get(customSkill.id),
          dataSourceConfigurations: skillDataSourceConfigs,
        });
      });
    }

    // Only include global skills if onlyCustom is not true.
    if (onlyCustom === true) {
      return allowedCustomSkillsRes;
    }

    const globalSkillDefinitions = await GlobalSkillsRegistry.findAll(
      auth,
      where
    );

    // Fetch global skills with their MCP server configurations.
    const globalSkills = removeNulls(
      await concurrentExecutor(
        globalSkillDefinitions,
        async (def) => {
          if (
            context.agentLoopData &&
            def.isDisabledForAgentLoop?.(context.agentLoopData)
          ) {
            return null;
          }
          return this.fromGlobalSkill(auth, def, context);
        },
        { concurrency: 5 }
      )
    );

    return [...allowedCustomSkillsRes, ...globalSkills];
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
    const result = await this.fetchByIds(auth, [sId]);

    return result.at(0) ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[]
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

    // When fetching by specific IDs, return skills regardless of status.
    return this.baseFetch(auth, {
      where: {
        id: customSkillIds,
        sId: globalSkillIds,
        status: ["active", "archived", "suggested"],
      },
    });
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

  /**
   * Fetches skills from rows that reference them via customSkillId or globalSkillId.
   */
  private static fetchBySkillReferences(
    auth: Authenticator,
    refs: {
      customSkillId: ModelId | null;
      globalSkillId: string | null;
    }[],
    {
      agentLoopData,
      status,
    }: {
      agentLoopData?: AgentLoopExecutionData;
      status?: SkillStatus | SkillStatus[];
    } = {}
  ): Promise<SkillResource[]> {
    const customSkillModelIds = removeNulls(refs.map((r) => r.customSkillId));
    const globalSkillIds = removeNulls(refs.map((r) => r.globalSkillId));

    return this.baseFetch(
      auth,
      {
        where: {
          id: customSkillModelIds,
          sId: globalSkillIds,
          ...(status ? { status } : {}),
        },
      },
      { agentLoopData }
    );
  }

  /**
   * Returns the fields to identify this skill in related tables (e.g., AgentSkillModel).
   */
  private get skillReference():
    | { globalSkillId: string }
    | { customSkillId: ModelId } {
    return this.globalSId
      ? { globalSkillId: this.globalSId }
      : { customSkillId: this.id };
  }

  static async listByAgentConfiguration(
    auth: Authenticator,
    agentConfiguration: AgentConfigurationType,
    { agentLoopData }: { agentLoopData?: AgentLoopExecutionData } = {}
  ): Promise<SkillResource[]> {
    const refs = await this.getSkillReferencesForAgent(
      auth,
      agentConfiguration
    );

    if (refs.length === 0) {
      return [];
    }

    return this.fetchBySkillReferences(auth, refs, {
      agentLoopData,
    });
  }

  /**
   * Returns skill references for an agent configuration.
   * For global agents, returns references from the config's skills field.
   * For non-global agents, queries the database.
   * TODO(2026-01-30 agent-resource): move this to an AgentResource that would bundle the logic
   *   about loading skills and will expose a unified interface.
   */
  static async getSkillReferencesForAgent(
    auth: Authenticator,
    agentConfiguration: AgentConfigurationType
  ): Promise<
    {
      customSkillId: ModelId | null;
      globalSkillId: string | null;
    }[]
  > {
    // For global agents, skills are defined in the config, not in the database.
    if (
      isGlobalAgentId(agentConfiguration.sId) &&
      "skills" in agentConfiguration
    ) {
      return (agentConfiguration.skills ?? []).map((globalSkillId) => ({
        customSkillId: null,
        globalSkillId,
      }));
    }

    const workspace = auth.getNonNullableWorkspace();

    const agentSkills = await AgentSkillModel.findAll({
      where: {
        agentConfigurationId: agentConfiguration.id,
        workspaceId: workspace.id,
      },
    });

    return agentSkills.map((s) => ({
      customSkillId: s.customSkillId,
      globalSkillId: s.globalSkillId,
    }));
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

  static async listByWorkspace(
    auth: Authenticator,
    {
      status = "active",
      limit,
      globalSpaceOnly,
      onlyCustom,
    }: {
      status?: SkillStatus | SkillStatus[];
      limit?: number;
      globalSpaceOnly?: boolean;
      onlyCustom?: boolean;
    } = {}
  ): Promise<SkillResource[]> {
    const skills = await this.baseFetch(auth, {
      where: { status },
      ...(limit ? { limit } : {}),
      onlyCustom,
    });

    if (globalSpaceOnly) {
      const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
      return skills.filter((skill) =>
        skill.requestedSpaceIds.every((id) => id === globalSpace.id)
      );
    }

    return skills;
  }

  /**
   * List skills that use any of the given MCP server view IDs.
   * Used during space deletion to find skills that need to be updated.
   */
  static async listByMCPServerViewIds(
    auth: Authenticator,
    mcpServerViewIds: ModelId[]
  ): Promise<SkillResource[]> {
    if (mcpServerViewIds.length === 0) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();

    // Query skill IDs that have any of the given MCP server views.
    const skillConfigs = await SkillMCPServerConfigurationModel.findAll({
      attributes: ["skillConfigurationId"],
      where: {
        workspaceId: workspace.id,
        mcpServerViewId: {
          [Op.in]: mcpServerViewIds,
        },
      },
    });

    if (skillConfigs.length === 0) {
      return [];
    }

    const skillIds = uniq(skillConfigs.map((c) => c.skillConfigurationId));

    return this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: skillIds,
        },
        status: "active",
      },
      onlyCustom: true,
    });
  }

  /**
   * List skills that use any of the given data source view IDs.
   * Used during space deletion to find skills that need to be updated.
   */
  static async listByDataSourceViewIds(
    auth: Authenticator,
    dataSourceViewIds: ModelId[]
  ): Promise<SkillResource[]> {
    if (dataSourceViewIds.length === 0) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();

    // Query skill IDs that have any of the given data source views.
    const skillConfigs = await SkillDataSourceConfigurationModel.findAll({
      attributes: ["skillConfigurationId"],
      where: {
        workspaceId: workspace.id,
        dataSourceViewId: {
          [Op.in]: dataSourceViewIds,
        },
      },
    });

    if (skillConfigs.length === 0) {
      return [];
    }

    const skillIds = uniq(skillConfigs.map((c) => c.skillConfigurationId));

    return this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: skillIds,
        },
        status: "active",
      },
      onlyCustom: true,
    });
  }

  /**
   * List enabled skills for a conversation.
   * If agentConfiguration is provided, includes both agent-enabled and conversation-enabled skills.
   * Otherwise, returns only conversation-enabled skills (JIT).
   */
  static async listEnabledByConversation(
    auth: Authenticator,
    {
      conversation,
      agentLoopData,
    }: {
      conversation: ConversationWithoutContentType;
      agentLoopData?: AgentLoopExecutionData;
    }
  ): Promise<SkillResource[]> {
    const { agentConfiguration } = agentLoopData ?? {};
    const workspace = auth.getNonNullableWorkspace();

    const conversationSkills = await ConversationSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        ...(agentConfiguration
          ? {
              [Op.or]: [
                { agentConfigurationId: agentConfiguration.sId },
                { agentConfigurationId: null },
              ],
            }
          : { agentConfigurationId: null }),
      },
    });

    return this.fetchBySkillReferences(auth, conversationSkills, {
      agentLoopData,
    });
  }

  /**
   * List skills for the agent loop, returning both (extended) enabled skills and equipped skills.
   */
  static async listForAgentLoop(
    auth: Authenticator,
    params:
      | AgentLoopExecutionData
      | Pick<AgentLoopExecutionData, "agentConfiguration" | "conversation">
  ): Promise<{
    enabledSkills: (SkillResource & { extendedSkill: SkillResource | null })[];
    equippedSkills: SkillResource[];
  }> {
    const { agentConfiguration, conversation } = params;
    // Light type-guard to check whether we have a full AgentLoopExecutionData.
    const agentLoopData = "userMessage" in params ? params : undefined;

    const conversationEnabledSkills = await this.listEnabledByConversation(
      auth,
      {
        conversation,
        agentLoopData,
      }
    );
    const allAgentSkills = await this.listByAgentConfiguration(
      auth,
      agentConfiguration,
      { agentLoopData }
    );

    // Auto-enabled skills are always treated as enabled when present in the agent configuration. Only possible for global skills for now.
    const autoEnabledSkills = allAgentSkills.filter((s) => s.isAutoEnabled);

    const enabledSkills = [...conversationEnabledSkills, ...autoEnabledSkills];
    // Skills that are already enabled are not equipped.
    const enabledSkillIds = new Set(enabledSkills.map((s) => s.sId));
    const equippedSkills = allAgentSkills.filter(
      (s) => !enabledSkillIds.has(s.sId)
    );

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
    const extendedSkills = await this.fetchByIds(auth, extendedSkillIds);

    // Create a map for a quick lookup of extended skills.
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
        ...this.skillReference,
        workspaceId: workspace.id,
        conversationId,
        agentConfigurationId: null,
      },
    });

    if (existingConversationSkill && !enabled) {
      await existingConversationSkill.destroy();
      return new Ok(undefined);
    }

    if (!existingConversationSkill && enabled) {
      await ConversationSkillModel.create({
        ...this.skillReference,
        conversationId,
        workspaceId: workspace.id,
        agentConfigurationId: null,
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
    {
      agentLoopData,
    }: {
      agentLoopData?: AgentLoopExecutionData;
    } = {}
  ): Promise<SkillResource> {
    const { agentConfiguration } = agentLoopData ?? {};
    const requestedSpaceIds = agentConfiguration?.requestedSpaceIds ?? [];
    const requestedSpaceModelIds = removeNulls(
      requestedSpaceIds.map(getResourceIdFromSId)
    );

    let mcpServerConfigurations: SkillMCPServerConfiguration[] = [];

    if (def.mcpServers) {
      const mcpServerConfigurationsByName = await concurrentExecutor(
        def.mcpServers,
        async ({ name, childAgentId, serverNameOverride }) => {
          const views =
            await MCPServerViewResource.listMCPServerViewsAutoInternalForSpaces(
              auth,
              name,
              requestedSpaceModelIds
            );
          return views.map((view) => ({
            view,
            childAgentId,
            serverNameOverride,
          }));
        },
        { concurrency: 5 }
      );
      mcpServerConfigurations = mcpServerConfigurationsByName.flat();
    }

    const instructions = def.fetchInstructions
      ? await def.fetchInstructions(auth, requestedSpaceIds)
      : def.instructions;

    return new SkillResource(
      this.model,
      {
        editedBy: -1,
        createdAt: new Date(),
        agentFacingDescription: def.agentFacingDescription,
        userFacingDescription: def.userFacingDescription,
        // We fake the id here. We should rely exclusively on sId for global skills.
        id: -1,
        instructions,
        name: def.name,
        requestedSpaceIds: requestedSpaceModelIds,
        status: "active",
        updatedAt: new Date(),
        workspaceId: auth.getNonNullableWorkspace().id,
        icon: def.icon,
        extendedSkillId: null,
      },
      {
        // Global skills do not have data source configurations.
        dataSourceConfigurations: [],
        globalSId: def.sId,
        mcpServerConfigurations,
      }
    );
  }

  canWrite(auth: Authenticator): boolean {
    if (!this.editorGroup) {
      return false;
    }

    return this.editorGroup.canWrite(auth);
  }

  private async listActiveAgents(
    auth: Authenticator
  ): Promise<AgentConfigurationModel[]> {
    const workspace = auth.getNonNullableWorkspace();

    const agentSkills = await AgentSkillModel.findAll({
      where: {
        ...this.skillReference,
        workspaceId: workspace.id,
      },
    });

    if (agentSkills.length === 0) {
      return [];
    }

    const agentConfigIds = agentSkills.map((as) => as.agentConfigurationId);

    return AgentConfigurationModel.findAll({
      where: {
        id: { [Op.in]: agentConfigIds },
        workspaceId: workspace.id,
        status: "active",
      },
    });
  }

  async fetchUsage(auth: Authenticator): Promise<AgentsUsageType> {
    const agents = await this.listActiveAgents(auth);

    const sortedAgents = agents
      .map((agent) => ({ sId: agent.sId, name: agent.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      count: sortedAgents.length,
      agents: sortedAgents,
    };
  }

  private async updateActiveAgentsRequirements(
    auth: Authenticator,
    { previousRequestedSpaceIds }: { previousRequestedSpaceIds: ModelId[] },
    { transaction }: { transaction?: Transaction }
  ): Promise<void> {
    if (
      previousRequestedSpaceIds.length === this.requestedSpaceIds.length &&
      hasAll(previousRequestedSpaceIds, this.requestedSpaceIds)
    ) {
      // Requested spaces didn't change, skip.
      return;
    }

    const agents = await this.listActiveAgents(auth);

    if (agents.length === 0) {
      // No agents are using this skill, skip.
      return;
    }

    const spaceIdsRemovedFromThisSkill = previousRequestedSpaceIds.filter(
      (spaceId) => !this.requestedSpaceIds.includes(spaceId)
    );

    await concurrentExecutor(
      agents,
      async (agent) => {
        const spaceIdsToRemoveFromAgent = new Set<ModelId>();

        // Some spaces were removed from the skill: we must check if they need to be
        // removed from the agent. In order to achieve this, we check if the agent has
        // any other capabilities that require the removed spaces.
        if (spaceIdsRemovedFromThisSkill.length > 0) {
          const agentConfig = await getAgentConfiguration(auth, {
            agentId: agent.sId,
            variant: "full",
          });
          assert(agentConfig, "Agent configuration not found");

          const agentSkills = await SkillResource.listByAgentConfiguration(
            auth,
            agentConfig
          );
          const otherAgentSkills = agentSkills.filter(
            (skill) => skill.sId !== this.sId
          );

          const agentOtherCapabilitiesRequirements =
            await getAgentConfigurationRequirementsFromCapabilities(auth, {
              actions: agentConfig.actions,
              skills: otherAgentSkills,
            });

          const otherCapabilitiesRequestedSpaceIds = new Set(
            agentOtherCapabilitiesRequirements.requestedSpaceIds
          );

          for (const spaceId of spaceIdsRemovedFromThisSkill) {
            if (!otherCapabilitiesRequestedSpaceIds.has(spaceId)) {
              // This space is not required by any other capabilities of the agent, so
              // we must remove it from the config.
              spaceIdsToRemoveFromAgent.add(spaceId);
            }
          }
        }

        const newSpaceIds = uniq(
          agent.requestedSpaceIds
            .filter((id) => !spaceIdsToRemoveFromAgent.has(id))
            .concat(this.requestedSpaceIds)
        );

        await updateAgentRequirements(
          auth,
          {
            agentModelId: agent.id,
            newSpaceIds,
          },
          { transaction }
        );
      },
      { concurrency: 5 }
    );
  }

  async listVersions(
    auth: Authenticator
  ): Promise<(SkillResource & { version: number })[]> {
    const workspace = auth.getNonNullableWorkspace();

    // Fetch all historical versions from the skill_versions table.
    const where: WhereOptions<SkillVersionModel> = {
      workspaceId: workspace.id,
      skillConfigurationId: this.id,
    };

    const versionModels = await SkillVersionModel.findAll({
      where,
    });

    // Sort application-side by version number DESC.
    const sortedVersionModels = versionModels.sort(
      (a, b) => b.version - a.version
    );

    // Build map to cache MCPServerViewResource instances.
    const allMcpServerViewIds = uniq(
      sortedVersionModels.flatMap((model) => model.mcpServerViewIds)
    );
    const allMcpServerViews = await MCPServerViewResource.fetchByModelIds(
      auth,
      allMcpServerViewIds
    );
    const mcpServerViewMap = new Map(
      allMcpServerViews.map((view) => [view.id, view])
    );

    // Convert version models to SkillResource instances.
    return sortedVersionModels.map((versionModel) => {
      const mcpServerViews = removeNulls(
        versionModel.mcpServerViewIds.map((id) => mcpServerViewMap.get(id))
      );

      const skill = new SkillResource(
        this.model,
        {
          id: this.id,
          workspaceId: workspace.id,
          editedBy: versionModel.editedBy,
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
          // We ignore data source configurations for historical versions.
          // As when the user saves we re-compute those from the nodes.
          dataSourceConfigurations: [],
          editorGroup: this.editorGroup ?? undefined,
          mcpServerConfigurations: mcpServerViews.map((view) => ({
            view,
          })),
          version: versionModel.version,
        }
      );
      assert(isSkillResourceWithVersion(skill));
      return skill;
    });
  }

  async listEditors(auth: Authenticator): Promise<UserResource[] | null> {
    return this.editorGroup?.getActiveMembers(auth) ?? null;
  }

  async fetchEditedByUser(auth: Authenticator): Promise<UserResource | null> {
    if (this.editedBy === null) {
      return null;
    }

    const editedByUser = await UserResource.fetchByModelId(this.editedBy);

    if (!editedByUser) {
      return null;
    }

    const shouldReturnEditedByUser = await hasSharedMembership(auth, {
      user: editedByUser,
    });

    return shouldReturnEditedByUser ? editedByUser : null;
  }

  async listInheritedDataSourceViews(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType
  ): Promise<DataSourceViewResource[] | null> {
    if (!this.globalSId) {
      return null;
    }

    if (
      !GlobalSkillsRegistry.doesSkillInheritAgentConfigurationDataSources(
        this.globalSId
      )
    ) {
      return null;
    }

    return DataSourceViewResource.listBySpaceIds(
      auth,
      agentConfiguration.requestedSpaceIds,
      { includeGlobalSpace: true }
    );
  }

  async archive(auth: Authenticator): Promise<{ affectedCount: number }> {
    assert(this.canWrite(auth), "User is not authorized to archive this skill");

    const workspace = auth.getNonNullableWorkspace();

    return withTransaction(async (transaction) => {
      // Rename any existing archived skill with the same name to avoid unique constraint violation.
      const existingArchivedSkill = await this.model.findOne({
        where: {
          workspaceId: workspace.id,
          name: this.name,
          status: "archived",
        },
        transaction,
      });

      if (existingArchivedSkill) {
        const timestamp = formatTimestampToFriendlyDate(
          existingArchivedSkill.updatedAt.getTime(),
          "compactWithDay"
        );
        await existingArchivedSkill.update(
          { name: `${existingArchivedSkill.name} (archived on ${timestamp})` },
          { transaction }
        );
      }

      // We preserve AgentSkillModel and ConversationSkillModel relationships
      // so they can be restored when the skill is unarchived.
      const [affectedCount] = await this.update(
        { status: "archived" },
        transaction
      );

      // Suspend all editor group memberships for this skill.
      if (affectedCount > 0 && this.editorGroup) {
        await GroupMembershipModel.update(
          { status: "suspended" },
          {
            where: {
              groupId: this.editorGroup.id,
              workspaceId: this.workspaceId,
              status: "active",
              startAt: { [Op.lte]: new Date() },
              [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
            },
            transaction,
          }
        );
      }

      return { affectedCount };
    });
  }

  async restore(auth: Authenticator): Promise<{ affectedCount: number }> {
    assert(this.canWrite(auth), "User is not authorized to restore this skill");

    const [affectedCount] = await this.update({ status: "active" });

    // Restore all editor group memberships (set suspended → active).
    if (affectedCount > 0 && this.editorGroup) {
      await GroupMembershipModel.update(
        { status: "active" },
        {
          where: {
            groupId: this.editorGroup.id,
            workspaceId: this.workspaceId,
            status: "suspended",
            startAt: { [Op.lte]: new Date() },
            [Op.or]: [{ endAt: null }, { endAt: { [Op.gt]: new Date() } }],
          },
        }
      );
    }

    return { affectedCount };
  }

  async updateSkill(
    auth: Authenticator,
    {
      agentFacingDescription,
      attachedKnowledge,
      icon,
      instructions,
      mcpServerViews,
      name,
      requestedSpaceIds,
      status,
      userFacingDescription,
    }: {
      agentFacingDescription: string;
      attachedKnowledge: SkillAttachedKnowledge[];
      icon: string | null;
      instructions: string;
      mcpServerViews: MCPServerViewResource[];
      name: string;
      requestedSpaceIds: ModelId[];
      status?: SkillStatus;
      userFacingDescription: string;
    }
  ): Promise<void> {
    assert(this.canWrite(auth), "User is not authorized to update this skill");

    await withTransaction(async (transaction) => {
      // Save the current version before updating.
      await this.saveVersion(auth, { transaction });

      // Snapshot the previous requested space IDs before updating.
      const previousRequestedSpaceIds = [...this.requestedSpaceIds];

      const editedBy = auth.user()?.id;

      await this.update(
        {
          name,
          agentFacingDescription,
          userFacingDescription,
          instructions,
          icon,
          requestedSpaceIds,
          editedBy,
          ...(status ? { status } : {}),
        },
        transaction
      );

      await this.updateMCPServerViews(auth, mcpServerViews, { transaction });

      await this.setAttachedKnowledge(
        auth,
        {
          attachedKnowledge,
        },
        { transaction }
      );

      await this.updateActiveAgentsRequirements(
        auth,
        { previousRequestedSpaceIds },
        { transaction }
      );
    });
  }

  /**
   * Efficiently updates MCP server view associations by computing the diff and only
   * deleting/creating what changed.
   */
  private async updateMCPServerViews(
    auth: Authenticator,
    mcpServerViews: MCPServerViewResource[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    const existingConfigs = await SkillMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspace.id,
        skillConfigurationId: this.id,
      },
      transaction,
    });

    const existingMcpServerViewIds = new Set(
      existingConfigs.map((config) => config.mcpServerViewId)
    );
    const mcpServerViewIds = new Set(mcpServerViews.map((msv) => msv.id));

    // Delete removed tools.
    const idsToDelete = existingConfigs
      .filter((config) => !mcpServerViewIds.has(config.mcpServerViewId))
      .map((config) => config.id);
    if (idsToDelete.length > 0) {
      await SkillMCPServerConfigurationModel.destroy({
        where: {
          id: { [Op.in]: idsToDelete },
          workspaceId: workspace.id,
        },
        transaction,
      });
    }

    // Create new tools.
    const toCreate = mcpServerViews.filter(
      (msv) => !existingMcpServerViewIds.has(msv.id)
    );
    if (toCreate.length > 0) {
      await SkillMCPServerConfigurationModel.bulkCreate(
        toCreate.map((mcpServerView) => ({
          workspaceId: workspace.id,
          skillConfigurationId: this.id,
          mcpServerViewId: mcpServerView.id,
        })),
        { transaction }
      );
    }

    // Update instance to avoid stale data.
    this._mcpServerConfigurations = mcpServerViews.map((view) => ({
      view,
    }));
  }

  static computeDataSourceConfigurationChanges(
    owner: LightWorkspaceType,
    {
      attachedKnowledge,
      existingConfigurations,
      skillConfigurationId,
    }: {
      attachedKnowledge: SkillAttachedKnowledge[];
      existingConfigurations: SkillDataSourceConfigurationModel[];
      skillConfigurationId: ModelId;
    }
  ): {
    toDelete: SkillDataSourceConfigurationModel[];
    toUpsert: CreationAttributes<SkillDataSourceConfigurationModel>[];
  } {
    // Group attached knowledge by data source view ID with all node IDs in parentsIn.
    const desiredConfigsByDataSourceViewId = attachedKnowledge.reduce<
      Record<
        ModelId,
        {
          dataSourceId: ModelId;
          dataSourceViewId: ModelId;
          parentsIn: string[];
        }
      >
    >((acc, k) => {
      const key = k.dataSourceView.id;

      acc[key] ??= {
        dataSourceId: k.dataSourceView.dataSource.id,
        dataSourceViewId: k.dataSourceView.id,
        parentsIn: [],
      };

      // Add nodeId to parentsIn if not already present.
      if (!acc[key].parentsIn.includes(k.nodeId)) {
        acc[key].parentsIn.push(k.nodeId);
      }

      return acc;
    }, {});

    const toDelete: SkillDataSourceConfigurationModel[] = [];
    const toUpsert: CreationAttributes<SkillDataSourceConfigurationModel>[] =
      [];

    // Track which dataSourceViewIds need to be recreated.
    const toRecreate = new Set<ModelId>();

    // Process existing configurations.
    for (const existingConfig of existingConfigurations) {
      const desiredConfig =
        desiredConfigsByDataSourceViewId[existingConfig.dataSourceViewId];

      if (!desiredConfig) {
        toDelete.push(existingConfig);
      } else {
        const desiredParentsIn = [...desiredConfig.parentsIn].sort();
        const existingParentsInSorted = [...existingConfig.parentsIn].sort();

        if (!isEqual(desiredParentsIn, existingParentsInSorted)) {
          toDelete.push(existingConfig);
          toRecreate.add(existingConfig.dataSourceViewId);
        }
      }
    }

    // Create new or changed configurations.
    for (const desiredConfig of Object.values(
      desiredConfigsByDataSourceViewId
    )) {
      const hasExisting = existingConfigurations.some(
        (existing) =>
          existing.dataSourceViewId === desiredConfig.dataSourceViewId
      );

      if (!hasExisting || toRecreate.has(desiredConfig.dataSourceViewId)) {
        toUpsert.push({
          ...desiredConfig,
          skillConfigurationId,
          workspaceId: owner.id,
        });
      }
    }

    return { toDelete, toUpsert };
  }

  private async setAttachedKnowledge(
    auth: Authenticator,
    {
      attachedKnowledge,
    }: {
      attachedKnowledge: SkillAttachedKnowledge[];
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    assert(
      this.canWrite(auth),
      "User does not have permission to update this skill."
    );

    const workspace = auth.getNonNullableWorkspace();

    // Fetch existing configurations for this skill.
    const existingConfigurations =
      await SkillDataSourceConfigurationModel.findAll({
        where: {
          skillConfigurationId: this.id,
          workspaceId: workspace.id,
        },
        transaction,
      });

    const { toDelete, toUpsert } =
      SkillResource.computeDataSourceConfigurationChanges(workspace, {
        attachedKnowledge,
        existingConfigurations,
        skillConfigurationId: this.id,
      });

    // Delete configurations that are no longer needed.
    for (const config of toDelete) {
      await config.destroy({ transaction });
    }

    // Create new configurations. The diff logic already handles deleting changed ones.
    if (toUpsert.length > 0) {
      await SkillDataSourceConfigurationModel.bulkCreate(toUpsert, {
        transaction,
      });
    }
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<number, Error>> {
    try {
      assert(
        this.canWrite(auth),
        "User does not have permission to delete this skill."
      );

      const workspace = auth.getNonNullableWorkspace();

      // Delete agent-skill associations.
      await AgentSkillModel.destroy({
        where: {
          customSkillId: this.id,
          workspaceId: workspace.id,
        },
        transaction,
      });

      const whereWorkspaceIdAndSkillId = {
        skillConfigurationId: this.id,
        workspaceId: workspace.id,
      };

      // Delete the GroupSkillModel entry and the associated editor group.
      await GroupSkillModel.destroy({
        where: whereWorkspaceIdAndSkillId,
        transaction,
      });

      if (this.editorGroup) {
        await this.editorGroup.delete(auth, { transaction });
      }

      await SkillDataSourceConfigurationModel.destroy({
        where: whereWorkspaceIdAndSkillId,
        transaction,
      });

      await SkillMCPServerConfigurationModel.destroy({
        where: whereWorkspaceIdAndSkillId,
        transaction,
      });

      await SkillVersionModel.destroy({
        where: whereWorkspaceIdAndSkillId,
        transaction,
      });

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
      ...this.skillReference,
      workspaceId: workspace.id,
      agentConfigurationId: agentConfiguration.id,
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
  ): Promise<Result<{ alreadyEnabled: boolean }, Error>> {
    const workspace = auth.getNonNullableWorkspace();

    const refs = await SkillResource.getSkillReferencesForAgent(
      auth,
      agentConfiguration
    );

    const hasSkill = refs.some(
      (ref) =>
        (ref.globalSkillId !== null && ref.globalSkillId === this.globalSId) ||
        (ref.customSkillId !== null && ref.customSkillId === this.id)
    );

    if (!hasSkill) {
      return new Err(
        new Error(
          `Skill ${this.name} is not equipped by agent ${agentConfiguration.name}.`
        )
      );
    }

    const conversationSkillBlob: ConversationSkillCreationAttributes = {
      ...this.skillReference,
      workspaceId: workspace.id,
      conversationId: conversation.id,
      addedByUserId: null,
      source: "agent_enabled",
      agentConfigurationId: agentConfiguration.sId,
    };

    // Check if this skill is already enabled for this agent in this conversation.
    const existingConversationSkill = await ConversationSkillModel.findOne({
      where: conversationSkillBlob,
    });

    if (existingConversationSkill) {
      return new Ok({ alreadyEnabled: true });
    }

    await ConversationSkillModel.create(conversationSkillBlob);

    return new Ok({ alreadyEnabled: false });
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
        [Op.or]: [{ agentConfigurationId }, { agentConfigurationId: null }],
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

    // Include all statuses for historical accuracy.
    return this.fetchBySkillReferences(auth, agentMessageSkills, {
      status: ["active", "archived", "suggested"],
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    await AgentSkillModel.destroy({
      where: { workspaceId },
    });

    // Delete editor groups associated with skills.
    const groupSkills = await GroupSkillModel.findAll({
      where: { workspaceId },
    });
    const editorGroups = await GroupResource.fetchByModelIds(
      auth,
      groupSkills.map((gs) => gs.groupId)
    );

    await GroupSkillModel.destroy({
      where: { workspaceId },
    });

    for (const editorGroup of editorGroups) {
      await editorGroup.delete(auth);
    }

    await SkillDataSourceConfigurationModel.destroy({
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
        id: spaceId,
        workspaceId: this.workspaceId,
      })
    );

    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.globalSId ? null : this.createdAt.getTime(),
      updatedAt: this.globalSId ? null : this.updatedAt.getTime(),
      editedBy: this.globalSId ? null : this.editedBy,
      status: this.status,
      name: this.name,
      agentFacingDescription: this.agentFacingDescription,
      userFacingDescription: this.userFacingDescription,
      // We don't want to expose global skills instructions to the front-end.
      instructions: this.globalSId ? null : this.instructions,
      requestedSpaceIds,
      icon: this.icon ?? null,
      tools: this.mcpServerViews.map((view) => {
        const serializedView = view.toJSON();
        const server = serializedView.server;
        return {
          ...serializedView,
          server: {
            ...server,
            // This object may be used in server side props so we need to make it serializable.
            // TODO(mcp 2025-12-24): make MCPServerType serverSideProps-serializable (no undefined).
            developerSecretSelection: server.developerSecretSelection ?? null,
            developerSecretSelectionDescription:
              server.developerSecretSelectionDescription ?? null,
            sharedSecret: server.sharedSecret ?? null,
            customHeaders: server.customHeaders ?? null,
          },
        };
      }),
      canWrite: this.canWrite(auth),
      isExtendable: this.isExtendable,
      extendedSkillId: this.extendedSkillId,
    };
  }

  private async saveVersion(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    // Fetch current MCP server configuration IDs for this skill.
    const mcpServerConfigurations =
      await SkillMCPServerConfigurationModel.findAll({
        where: {
          workspaceId: workspace.id,
          skillConfigurationId: this.id,
        },
        transaction,
      });

    const mcpServerViewIds = mcpServerConfigurations.map(
      (config) => config.mcpServerViewId
    );

    // Calculate the next version number by counting existing versions.
    const where: WhereOptions<SkillVersionModel> = {
      workspaceId: this.workspaceId,
      skillConfigurationId: this.id,
    };

    const existingVersionsCount = await SkillVersionModel.count({
      where,
      transaction,
    });

    const versionNumber = existingVersionsCount + 1;

    // Create a new version entry with the current state.
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
      editedBy: this.editedBy,
      mcpServerViewIds,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };

    await SkillVersionModel.create(versionData, {
      transaction,
    });
  }
}
