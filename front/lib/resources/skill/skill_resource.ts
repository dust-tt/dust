import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { Authenticator } from "@app/lib/auth";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import {
  type SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import {
  AgentMessageSkillModel,
  ConversationSkillModel,
} from "@app/lib/models/skill/conversation_skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { SkillReferenceModel } from "@app/lib/models/skill/skill_reference";
import { FileResource } from "@app/lib/resources/file_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  createResourcePermissionsFromSpacesWithMap,
  createSpaceIdToGroupsMap,
} from "@app/lib/resources/permission_utils";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import type { SkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import * as skillLifecycle from "@app/lib/resources/skill/skill_lifecycle";
import { SkillResourceWithAgents } from "@app/lib/resources/skill/skill_resource_agents";
import * as skillUpdates from "@app/lib/resources/skill/skill_updates";
import * as skillVersions from "@app/lib/resources/skill/skill_versions";
import type {
  SkillAttachedKnowledge,
  SkillConfigurationFindOptions,
  SkillMCPServerConfiguration,
  SkillResourceConstructorOptions,
} from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  getResourceIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import type {
  SkillReinforcementMode,
  SkillSourceMetadata,
  SkillSourceType,
  SkillStatus,
  UsedBySkillType,
} from "@app/types/assistant/skill_configuration";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
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

export type {
  SkillAttachedKnowledge,
  SkillMCPServerConfiguration,
} from "@app/lib/resources/skill/types";

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
 * @see SystemSkillsRegistry for always-enabled system skill definitions
 */
export class SkillResource extends SkillResourceWithAgents {
  private constructor(
    model: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    options: SkillResourceConstructorOptions
  ) {
    super(model, blob, options);
  }

  /**
   * Bridge for the agents layer, which cannot reach the fetching statics of
   * the final class.
   */
  protected async fetchSkillsByModelIds(
    auth: Authenticator,
    ids: ModelId[]
  ): Promise<SkillResource[]> {
    return SkillResource.fetchByModelIds(auth, ids);
  }

  /**
   * Get attached knowledge from the skill's data source configurations.
   * Requires data source views to be fetched first.
   */
  async getAttachedKnowledge(
    auth: Authenticator
  ): Promise<SkillAttachedKnowledge[]> {
    return skillUpdates.getAttachedKnowledge(auth, this);
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
    return skillUpdates.computeRequestedSpaceIds(auth, {
      mcpServerViews,
      attachedKnowledge,
    });
  }

  static async makeNew(
    auth: Authenticator,
    blob: Omit<CreationAttributes<SkillConfigurationModel>, "workspaceId">,
    {
      mcpServerViews,
      addCurrentUserAsEditor = true,
      attachedKnowledge = [],
      fileAttachments = [],
    }: {
      mcpServerViews: MCPServerViewResource[];
      addCurrentUserAsEditor?: boolean;
      attachedKnowledge?: SkillAttachedKnowledge[];
      fileAttachments?: FileResource[];
    }
  ): Promise<SkillResource> {
    const owner = auth.getNonNullableWorkspace();

    // Use a transaction to ensure all creations succeed or all are rolled back.
    return withTransaction(async (transaction) => {
      const skill = await this.model.create(
        {
          ...blob,
          instructionsHtml: blob.instructionsHtml ?? null,
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

      // File attachments for the skill.
      await SkillFileAttachmentModel.bulkCreate(
        fileAttachments.map((file) => ({
          workspaceId: owner.id,
          skillConfigurationId: skill.id,
          fileId: file.id,
          fileName: file.fileName,
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

      const skillResource = new this(this.model, skill.get(), {
        dataSourceConfigurations,
        editorGroup,
        fileAttachments,
        mcpServerConfigurations: mcpServerViews.map((view) => ({
          view,
        })),
      });

      await skillResource.normalizeSkillReferenceTags(auth, { transaction });
      await skillResource.syncSkillReferences(auth, { transaction });

      return skillResource;
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

  private static async baseFetch(
    auth: Authenticator,
    options: SkillConfigurationFindOptions = {},
    context: {
      agentLoopData?: AgentLoopExecutionData;
      transaction?: Transaction;
    } = {}
  ): Promise<SkillResource[]> {
    const workspace = auth.getNonNullableWorkspace();
    const { agentLoopData, transaction } = context;

    const {
      where,
      includes,
      onlyCustom,
      withInstructions = true,
      withTools = true,
      ...otherOptions
    } = options;

    const customSkills = await this.model.findAll({
      ...otherOptions,
      where: {
        // Fetch active by default, unless explicitly overridden by the caller.
        status: "active",
        ...omit(where, "sId"),
        workspaceId: workspace.id,
      },
      include: includes,
      transaction,
    });

    // Check if the user has access to skill requested spaces.
    const uniqueRequestedSpaceIds = uniq(
      customSkills.flatMap((c) => c.requestedSpaceIds)
    );
    const spaces =
      uniqueRequestedSpaceIds.length > 0
        ? await SpaceResource.fetchByModelIds(auth, uniqueRequestedSpaceIds, {
            transaction,
          })
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
      let mcpServerConfigurations: SkillMCPServerConfigurationModel[] = [];
      let allMCPServerViews: MCPServerViewResource[] = [];

      if (withTools) {
        mcpServerConfigurations =
          await SkillMCPServerConfigurationModel.findAll({
            where: {
              workspaceId: workspace.id,
              skillConfigurationId: {
                [Op.in]: allowedCustomSkillIds,
              },
            },
            transaction,
          });

        allMCPServerViews = await MCPServerViewResource.fetchByModelIds(
          auth,
          removeNulls(mcpServerConfigurations.map((c) => c.mcpServerViewId)),
          { includeMetadata: false }
        );
      }

      const skillMCPServerConfigsBySkillId = groupBy(
        mcpServerConfigurations,
        "skillConfigurationId"
      );
      const mcpServerViewsById = new Map(
        allMCPServerViews.map((view) => [view.id, view])
      );

      const dataSourceConfigurations =
        await SkillDataSourceConfigurationModel.findAll({
          where: {
            workspaceId: workspace.id,
            skillConfigurationId: {
              [Op.in]: customSkills.map((c) => c.id),
            },
          },
          transaction,
        });

      const dataSourceConfigsBySkillId = groupBy(
        dataSourceConfigurations,
        "skillConfigurationId"
      );

      const fileAttachmentModels = await SkillFileAttachmentModel.findAll({
        where: {
          workspaceId: workspace.id,
          skillConfigurationId: {
            [Op.in]: allowedCustomSkillIds,
          },
        },
        transaction,
      });

      const allFileResources = await FileResource.fetchByModelIdsWithAuth(
        auth,
        fileAttachmentModels.map((a) => a.fileId),
        transaction
      );

      const fileResourceById = new Map(allFileResources.map((f) => [f.id, f]));

      const fileAttachmentsBySkillId = groupBy(
        fileAttachmentModels,
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
        transaction,
      });

      // TODO(SKILLS 2025-12-11): Ensure all skills have ONE group.

      if (editorGroupSkills.length > 0) {
        const uniqueGroupIds = Array.from(
          new Set(editorGroupSkills.map((eg) => eg.groupId))
        );
        const editorGroups = await GroupResource.fetchByModelIds(
          auth,
          uniqueGroupIds,
          { transaction }
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

      allowedCustomSkillsRes = allowedCustomSkills.map((customSkill) => {
        const skillMCPServerViewIds = skillMCPServerConfigsBySkillId[
          customSkill.id
        ]?.map((skillConfig) => skillConfig.mcpServerViewId);

        const skillDataSourceConfigs =
          dataSourceConfigsBySkillId[customSkill.id] ?? [];

        const skillMCPServerViews = removeNulls(
          [...new Set(skillMCPServerViewIds ?? [])].map(
            (viewId) => mcpServerViewsById.get(viewId) ?? null
          )
        );

        return new this(this.model, customSkill.get(), {
          mcpServerConfigurations: skillMCPServerViews.map((view) => ({
            view,
          })),
          editorGroup: skillEditorGroupsMap.get(customSkill.id),
          dataSourceConfigurations: skillDataSourceConfigs,
          fileAttachments: removeNulls(
            (fileAttachmentsBySkillId[customSkill.id] ?? []).map(
              (a) => fileResourceById.get(a.fileId) ?? null
            )
          ),
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
    const systemSkillDefinitions = await SystemSkillsRegistry.findAll(
      auth,
      where
    );

    const allCodeDefinedSkills = [
      ...globalSkillDefinitions,
      ...systemSkillDefinitions,
    ];

    const enabledCodeDefinedSkills = allCodeDefinedSkills.filter(
      (def) => !agentLoopData || !def.isDisabledForAgentLoop?.(agentLoopData)
    );

    const requestedSpaceModelIds = removeNulls(
      (agentLoopData?.agentConfiguration?.requestedSpaceIds ?? []).map(
        getResourceIdFromSId
      )
    );

    // Batch-fetch MCP server views for all enabled global skills in a single query.
    let mcpServerViews: MCPServerViewResource[] = [];
    if (withTools) {
      const mcpServerIds = uniq(
        enabledCodeDefinedSkills.flatMap(
          (def) => def.mcpServers?.map((s) => s.name) ?? []
        )
      ).map((name) =>
        autoInternalMCPServerNameToSId({ name, workspaceId: workspace.id })
      );
      const allMCPServerViews = await MCPServerViewResource.listByMCPServers(
        auth,
        mcpServerIds,
        transaction
      );
      mcpServerViews = allMCPServerViews.filter(
        (view) =>
          requestedSpaceModelIds.includes(view.vaultId) ||
          view.space.kind === "global"
      );
    }

    const globalSkills = await concurrentExecutor(
      enabledCodeDefinedSkills,
      (def) =>
        this.fromGlobalSkill(auth, def, {
          agentLoopData,
          mcpServerViews,
          withInstructions,
        }),
      { concurrency: 5 }
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
    ids: ModelId[],
    { withTools = true }: { withTools?: boolean } = {}
  ): Promise<SkillResource[]> {
    return this.baseFetch(auth, {
      where: {
        id: {
          [Op.in]: ids,
        },
      },
      onlyCustom: true,
      withTools,
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
    sIds: string[],
    {
      agentLoopData,
      onlyActive = false,
    }: { agentLoopData?: AgentLoopExecutionData; onlyActive?: boolean } = {}
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
          status: onlyActive ? ["active"] : ["active", "archived", "suggested"],
        },
      },
      { agentLoopData }
    );
  }

  static async fetchByName(
    auth: Authenticator,
    name: string,
    { agentLoopData }: { agentLoopData?: AgentLoopExecutionData } = {}
  ): Promise<SkillResource | null> {
    const resources = await this.baseFetch(
      auth,
      {
        where: {
          name,
        },
        limit: 1,
      },
      { agentLoopData }
    );

    if (resources.length === 0) {
      return null;
    }

    return resources[0];
  }

  static async fetchByNames(
    auth: Authenticator,
    names: string[]
  ): Promise<SkillResource[]> {
    if (names.length === 0) {
      return [];
    }
    return this.baseFetch(auth, {
      where: {
        name: names,
        status: "active",
      },
    });
  }

  static async batchFetchChildSkills(
    auth: Authenticator,
    parentSkills: SkillResource[]
  ): Promise<Map<string, SkillResource[]>> {
    const workspace = auth.getNonNullableWorkspace();
    const customParentSkills = parentSkills.filter((skill) => !skill.globalSId);

    if (customParentSkills.length === 0) {
      return new Map();
    }

    const skillReferences = await SkillReferenceModel.findAll({
      attributes: ["childCustomSkillId", "childGlobalSkillId", "parentSkillId"],
      where: {
        workspaceId: workspace.id,
        parentSkillId: customParentSkills.map((skill) => skill.id),
      },
    });

    if (skillReferences.length === 0) {
      return new Map(
        customParentSkills.map((parentSkill) => [parentSkill.sId, []])
      );
    }

    const childSkills = await this.fetchBySkillReferences(
      auth,
      skillReferences.map((reference) => ({
        customSkillId: reference.childCustomSkillId,
        globalSkillId: reference.childGlobalSkillId,
      })),
      { withInstructions: false, withTools: false }
    );
    const childSkillsById = new Map(
      childSkills.map((skill) => [skill.sId, skill])
    );
    const referencesByParentSkillId = groupBy(skillReferences, "parentSkillId");

    return new Map(
      customParentSkills.map((parentSkill) => [
        parentSkill.sId,
        removeNulls(
          (referencesByParentSkillId[parentSkill.id] ?? []).map((reference) => {
            const childSkillId = this.skillReferenceChildId(auth, reference);

            return childSkillId
              ? (childSkillsById.get(childSkillId) ?? null)
              : null;
          })
        ),
      ])
    );
  }

  async fetchChildSkills(auth: Authenticator): Promise<SkillResource[]> {
    const childSkillsMap = await SkillResource.batchFetchChildSkills(auth, [
      this,
    ]);

    return childSkillsMap.get(this.sId) ?? [];
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
      transaction,
      withInstructions,
      withTools,
    }: {
      agentLoopData?: AgentLoopExecutionData;
      status?: SkillStatus | SkillStatus[];
      transaction?: Transaction;
      withInstructions?: boolean;
      withTools?: boolean;
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
        withInstructions,
        withTools,
      },
      { agentLoopData, transaction }
    );
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
   * Batched version of listByAgentConfiguration. Performs 2 SQL queries.
   * Does not support global agents as we rely on the ID for mapping.
   */
  static async listByAgentConfigurations(
    auth: Authenticator,
    agentConfigurations: AgentConfigurationType[]
  ): Promise<
    { agentConfiguration: AgentConfigurationType; skill: SkillResource }[]
  > {
    assert(
      agentConfigurations.every((c) => !isGlobalAgentId(c.sId)),
      "Global agents are not supported"
    );

    if (agentConfigurations.length === 0) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();

    // Fetch all agent-skill relationships for the given agents.
    const agentSkills = await AgentSkillModel.findAll({
      where: {
        agentConfigurationId: agentConfigurations.map((c) => c.id),
        workspaceId: workspace.id,
      },
    });

    // Fetch all unique skills in one batch.
    const allSkills = await this.fetchBySkillReferences(
      auth,
      agentSkills.map((s) => ({
        customSkillId: s.customSkillId,
        globalSkillId: s.globalSkillId,
      }))
    );

    const skillByCustomId = new Map<ModelId, SkillResource>();
    const skillByGlobalId = new Map<string, SkillResource>();
    for (const skill of allSkills) {
      if (skill.globalSId) {
        skillByGlobalId.set(skill.globalSId, skill);
      } else {
        skillByCustomId.set(skill.id, skill);
      }
    }

    // Map skills back to each config.
    const configById = new Map(agentConfigurations.map((c) => [c.id, c]));
    return removeNulls(
      Object.entries(
        groupBy(agentSkills, (s) => s.agentConfigurationId)
      ).flatMap(([configId, refs]) => {
        const agentConfiguration = configById.get(parseInt(configId, 10));
        if (!agentConfiguration) {
          return [];
        }
        return refs.map((ref) => {
          if (ref.globalSkillId) {
            const skill = skillByGlobalId.get(ref.globalSkillId);
            return skill ? { agentConfiguration, skill } : null;
          } else if (ref.customSkillId) {
            const skill = skillByCustomId.get(ref.customSkillId);
            return skill ? { agentConfiguration, skill } : null;
          }
        });
      })
    );
  }

  static async listByWorkspace(
    auth: Authenticator,
    {
      status = "active",
      limit,
      globalSpaceOnly,
      onlyCustom,
      isDefault,
      updatedAfter,
      reinforcementNotOff,
      withInstructions = true,
      withTools = true,
    }: {
      status?: SkillStatus | SkillStatus[];
      limit?: number;
      globalSpaceOnly?: boolean;
      onlyCustom?: boolean;
      isDefault?: boolean;
      updatedAfter?: Date;
      reinforcementNotOff?: boolean;
      withInstructions?: boolean;
      withTools?: boolean;
    } = {}
  ): Promise<SkillResource[]> {
    const skills = await this.baseFetch(auth, {
      where: {
        status,
        ...(isDefault !== undefined ? { isDefault } : {}),
        ...(updatedAfter ? { updatedAt: { [Op.gte]: updatedAfter } } : {}),
        ...(reinforcementNotOff ? { reinforcement: { [Op.ne]: "off" } } : {}),
      },
      ...(limit ? { limit } : {}),
      onlyCustom,
      withInstructions,
      withTools,
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
   * List discoverable skills: custom default skills + regular global skills.
   */
  static async listDiscoverable(
    auth: Authenticator,
    {
      agentLoopData,
    }: {
      agentLoopData?: AgentLoopExecutionData;
    } = {}
  ): Promise<SkillResource[]> {
    return this.baseFetch(
      auth,
      {
        where: {
          status: "active",
          isDefault: true,
        },
      },
      { agentLoopData }
    );
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
      agentConfiguration,
      agentLoopData,
      transaction,
    }: {
      conversation: ConversationWithoutContentType;
      agentConfiguration?: AgentConfigurationType;
      agentLoopData?: AgentLoopExecutionData;
      transaction?: Transaction;
    }
  ): Promise<SkillResource[]> {
    const resolvedAgentConfiguration =
      agentConfiguration ?? agentLoopData?.agentConfiguration;
    const workspace = auth.getNonNullableWorkspace();

    const conversationSkills = await ConversationSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        ...(resolvedAgentConfiguration
          ? {
              [Op.or]: [
                { agentConfigurationId: resolvedAgentConfiguration.sId },
                { agentConfigurationId: null },
              ],
            }
          : { agentConfigurationId: null }),
      },
      transaction,
    });

    return this.fetchBySkillReferences(auth, conversationSkills, {
      agentLoopData,
      transaction,
    });
  }

  static async listPodDefaultSkillsForConversation(
    auth: Authenticator,
    {
      conversation,
      agentLoopData,
    }: {
      conversation: ConversationWithoutContentType;
      agentLoopData?: AgentLoopExecutionData;
    }
  ): Promise<SkillResource[]> {
    if (!isPodConversation(conversation)) {
      return [];
    }

    const [projectMetadata] = await ProjectMetadataResource.fetchBySpaceIds(
      auth,
      [conversation.spaceId]
    );

    return this.fetchByIds(auth, projectMetadata?.defaultSkillIds ?? [], {
      agentLoopData,
      onlyActive: true,
    });
  }

  static async listForAgentLoop(
    auth: Authenticator,
    params:
      | AgentLoopExecutionData
      | Pick<AgentLoopExecutionData, "agentConfiguration" | "conversation">
      | {
          agentConfiguration: AgentConfigurationType;
          conversation: ConversationWithoutContentType;
        }
  ): Promise<{
    enabledSkills: SkillResource[];
    systemSkills: SkillResource[];
    equippedSkills: SkillResource[];
  }> {
    const { agentConfiguration, conversation } = params;
    // Light type-guard to check whether we have a full AgentLoopExecutionData.
    const agentLoopData = "userMessage" in params ? params : undefined;

    const conversationEnabledSkills = await this.listEnabledByConversation(
      auth,
      {
        conversation,
        agentConfiguration,
        agentLoopData,
      }
    );

    const podDefaultSkills = await this.listPodDefaultSkillsForConversation(
      auth,
      { conversation, agentLoopData }
    );

    const allAgentSkills = await this.listByAgentConfiguration(
      auth,
      agentConfiguration,
      { agentLoopData }
    );

    let discoverableSkills: SkillResource[] = [];
    if (allAgentSkills.some((s) => s.globalSId === "discover_skills")) {
      discoverableSkills = await this.listDiscoverable(auth, {
        agentLoopData,
      });
    }

    const sortByName = (a: SkillResource, b: SkillResource) =>
      a.name.localeCompare(b.name);

    // System skills are always treated as enabled when present in the agent configuration.
    const configSystemSkills = allAgentSkills.filter((s) => s.isSystemSkill);

    // Code-defined skills can opt into being auto-equipped or auto-enabled for the agent loop
    // without being added to the agent configuration. `findAll` already drops restricted skills,
    // so a flag-gated skill only shows up once its feature flag is on.
    const enabledGlobalSkillIds = new Set(
      removeNulls([
        ...configSystemSkills.map((s) => s.globalSId),
        ...conversationEnabledSkills.map((s) => s.globalSId),
      ])
    );
    const codeDefinedDefs = [
      ...(await SystemSkillsRegistry.findAll(auth)),
      ...(await GlobalSkillsRegistry.findAll(auth)),
    ];
    const autoEnabledRefs = codeDefinedDefs
      .filter(
        (def) =>
          def.isAutoEnabledForAgentLoop?.({
            agentConfiguration,
            conversation,
          }) && !enabledGlobalSkillIds.has(def.sId)
      )
      .map((def) => ({ globalSkillId: def.sId, customSkillId: null }));
    const autoEnabledSkills = autoEnabledRefs.length
      ? await this.fetchBySkillReferences(auth, autoEnabledRefs, {
          agentLoopData,
        })
      : [];

    const equippedGlobalSkillIds = new Set(
      removeNulls([
        ...allAgentSkills.map((s) => s.globalSId),
        ...conversationEnabledSkills.map((s) => s.globalSId),
        ...autoEnabledSkills.map((s) => s.globalSId),
      ])
    );
    const autoEquippedRefs = codeDefinedDefs
      .filter(
        (def) =>
          def.isAutoEquippedForAgentLoop?.({
            agentConfiguration,
            conversation,
          }) && !equippedGlobalSkillIds.has(def.sId)
      )
      .map((def) => ({ globalSkillId: def.sId, customSkillId: null }));
    const autoEquippedSkills = autoEquippedRefs.length
      ? await this.fetchBySkillReferences(auth, autoEquippedRefs, {
          agentLoopData,
          withInstructions: false,
          withTools: false,
        })
      : [];

    // System skills land in `systemSkills` (always enabled); auto-enabled global skills join
    // the conversation-enabled skills.
    const systemSkills = [
      ...configSystemSkills,
      ...autoEnabledSkills.filter((s) => s.isSystemSkill),
    ];

    const enabledSkills = [
      ...conversationEnabledSkills,
      ...autoEnabledSkills.filter((s) => !s.isSystemSkill),
    ].sort(sortByName);

    // Compute the equipped skills: all non-system agent skills, auto-equipped skills,
    // plus discoverable skills that are not already equipped. Keep this list stable
    // even after a skill is enabled.
    const agentEquippedSkills = allAgentSkills.filter((s) => !s.isSystemSkill);

    const agentEquippedSkillIds = new Set(
      [...agentEquippedSkills, ...autoEquippedSkills].map((s) => s.sId)
    );
    const podEquippedSkills = podDefaultSkills.filter(
      (s) => !agentEquippedSkillIds.has(s.sId)
    );
    const equippedSkillIds = new Set([
      ...agentEquippedSkillIds,
      ...podEquippedSkills.map((s) => s.sId),
    ]);
    const discoveredSkills = discoverableSkills.filter(
      (s) => !equippedSkillIds.has(s.sId)
    );

    const equippedSkills = removeNulls([
      ...agentEquippedSkills.sort(sortByName),
      ...autoEquippedSkills.sort(sortByName),
      ...podEquippedSkills.sort(sortByName),
      ...discoveredSkills.sort(sortByName),
    ]);

    return {
      enabledSkills,
      systemSkills: systemSkills.sort(sortByName),
      equippedSkills,
    };
  }

  private static async fromGlobalSkill(
    auth: Authenticator,
    def: SkillDefinition,
    {
      agentLoopData,
      mcpServerViews,
      withInstructions = true,
    }: {
      agentLoopData?: AgentLoopExecutionData;
      mcpServerViews: MCPServerViewResource[];
      withInstructions?: boolean;
    }
  ): Promise<SkillResource> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const { agentConfiguration } = agentLoopData ?? {};
    const requestedSpaceIds = agentConfiguration?.requestedSpaceIds ?? [];
    const requestedSpaceModelIds = removeNulls(
      requestedSpaceIds.map(getResourceIdFromSId)
    );

    const viewsByServerId = groupBy(
      mcpServerViews.filter((v) => v.internalMCPServerId !== null),
      "internalMCPServerId"
    );

    const mcpServerConfigurations: SkillMCPServerConfiguration[] = (
      def.mcpServers ?? []
    ).flatMap(({ name, childAgentId, serverNameOverride }) =>
      (
        viewsByServerId[
          autoInternalMCPServerNameToSId({ name, workspaceId })
        ] ?? []
      ).map((view) => ({ view, childAgentId, serverNameOverride }))
    );

    const instructions = withInstructions
      ? def.fetchInstructions
        ? await def.fetchInstructions(auth, {
            spaceIds: requestedSpaceIds,
            agentLoopData,
          })
        : def.instructions
      : "";

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
        instructionsHtml: null,
        name: def.name,
        requestedSpaceIds: requestedSpaceModelIds,
        status: "active",
        updatedAt: new Date(),
        workspaceId,
        icon: def.icon,
        source: null,
        sourceMetadata: null,
        isDefault: !SystemSkillsRegistry.isSystemSkill(def.sId),
        reinforcement: "auto",
        lastReinforcementAnalysisAt: null,
        selfImprovementCostsCapMicroUsd: null,
        selfImprovementCostsCapAwuCredits: null,
        selfImprovementLock: false,
      },
      {
        // Global skills do not have data source configurations.
        dataSourceConfigurations: [],
        exposeInstructions: def.exposeInstructions,
        globalSId: def.sId,
        mcpServerConfigurations,
        fileAttachments: [],
      }
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

    // Build map to cache FileResource instances.
    const allFileAttachmentIds = uniq(
      sortedVersionModels.flatMap((model) => model.fileAttachmentIds)
    );
    const allFiles = await FileResource.fetchByModelIdsWithAuth(
      auth,
      allFileAttachmentIds
    );
    const fileMap = new Map(allFiles.map((file) => [file.id, file]));

    // Convert version models to SkillResource instances.
    return sortedVersionModels.map((versionModel) => {
      const mcpServerViews = removeNulls(
        versionModel.mcpServerViewIds.map((id) => mcpServerViewMap.get(id))
      );
      const fileAttachments = removeNulls(
        versionModel.fileAttachmentIds.map((id) => fileMap.get(id))
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
          instructionsHtml: versionModel.instructionsHtml,
          icon: versionModel.icon,
          requestedSpaceIds: versionModel.requestedSpaceIds,
          source: versionModel.source,
          sourceMetadata: versionModel.sourceMetadata,
          isDefault: versionModel.isDefault,
          reinforcement: "auto",
          lastReinforcementAnalysisAt: null,
          selfImprovementCostsCapMicroUsd:
            versionModel.selfImprovementCostsCapMicroUsd,
          selfImprovementCostsCapAwuCredits:
            versionModel.selfImprovementCostsCapAwuCredits,
          selfImprovementLock: versionModel.selfImprovementLock,
        },
        {
          // We ignore data source configurations for historical versions.
          // As when the user saves we re-compute those from the nodes.
          dataSourceConfigurations: [],
          editorGroup: this.editorGroup ?? undefined,
          fileAttachments,
          mcpServerConfigurations: mcpServerViews.map((view) => ({
            view,
          })),
          version: versionModel.version,
        }
      );
      assert(skillVersions.isSkillResourceWithVersion(skill));
      return skill;
    });
  }

  /**
   * Batch fetch skill references for multiple child skills.
   * Keyed by child skill sId to avoid collisions with global skills.
   */
  static async batchFetchUsedBySkills(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, UsedBySkillType[]>> {
    const result = new Map<string, UsedBySkillType[]>(
      skills.map((skill) => [skill.sId, []])
    );

    const customSkills = skills.filter((skill) => !skill.globalSId);
    const globalSkills = skills.filter((skill) => skill.globalSId);
    if (customSkills.length === 0 && globalSkills.length === 0) {
      return result;
    }

    const workspace = auth.getNonNullableWorkspace();
    const skillReferences = await SkillReferenceModel.findAll({
      attributes: ["childCustomSkillId", "childGlobalSkillId", "parentSkillId"],
      where: {
        workspaceId: workspace.id,
        [Op.or]: [
          {
            childCustomSkillId: {
              [Op.in]: customSkills.map((skill) => skill.id),
            },
          },
          {
            childGlobalSkillId: {
              [Op.in]: globalSkills.map((skill) => skill.sId),
            },
          },
        ],
      },
    });

    if (skillReferences.length === 0) {
      return result;
    }

    const parentSkills = await this.fetchByModelIds(
      auth,
      uniq(skillReferences.map((reference) => reference.parentSkillId)),
      { withTools: false }
    );

    const parentSkillByModelId = new Map(
      parentSkills.map((skill) => [skill.id, skill])
    );
    const usedBySkillsByChildSkillId = new Map<string, UsedBySkillType[]>();
    for (const reference of skillReferences) {
      const childSkillId = this.skillReferenceChildId(auth, reference);
      const parentSkill = parentSkillByModelId.get(reference.parentSkillId);
      if (!childSkillId || !parentSkill) {
        continue;
      }

      const usedBySkills = usedBySkillsByChildSkillId.get(childSkillId) ?? [];
      usedBySkills.push({
        sId: parentSkill.sId,
        name: parentSkill.name,
        icon: parentSkill.icon,
      });
      usedBySkillsByChildSkillId.set(childSkillId, usedBySkills);
    }

    for (const [childSkillId, usedBySkills] of usedBySkillsByChildSkillId) {
      const sortedUsedBySkills = [...usedBySkills].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      result.set(childSkillId, sortedUsedBySkills);
    }

    return result;
  }

  async archive(auth: Authenticator): Promise<{ affectedCount: number }> {
    assert(this.canWrite(auth), "User is not authorized to archive this skill");

    const workspace = auth.getNonNullableWorkspace();

    const affectedCount = await withTransaction(async (transaction) => {
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

      // We preserve AgentSkillModel, ConversationSkillModel, and
      // SkillReferenceModel relationships so they can be restored when the skill
      // is unarchived.
      const [count] = await this.update({ status: "archived" }, transaction);

      if (count > 0) {
        // The skill no longer contributes any space requirement: drop its
        // spaces from the agents using it (unless another active capability
        // still requires them).
        await this.updateActiveAgentsRequirements(
          auth,
          {
            previousRequestedSpaceIds: this.requestedSpaceIds,
            newRequestedSpaceIds: [],
          },
          { transaction }
        );

        await this.propagateReferenceUpdatesToParentSkills(
          auth,
          {
            icon: this.icon,
            name: this.name,
            requestedSpaceIds: this.requestedSpaceIds,
            status: "archived",
          },
          { transaction }
        );

        // Suspend all editor group memberships for this skill.
        if (this.editorGroup) {
          await this.editorGroup.suspendMembers(auth, { transaction });
        }
      }

      return count;
    });

    return { affectedCount };
  }

  async restore(auth: Authenticator): Promise<{ affectedCount: number }> {
    assert(this.canWrite(auth), "User is not authorized to restore this skill");

    const affectedCount = await withTransaction(async (transaction) => {
      const [count] = await this.update({ status: "active" }, transaction);

      if (count > 0) {
        // The skill contributes its space requirements again: add them back to
        // the agents using it.
        await this.updateActiveAgentsRequirements(
          auth,
          {
            previousRequestedSpaceIds: [],
            newRequestedSpaceIds: this.requestedSpaceIds,
          },
          { transaction }
        );

        await this.propagateReferenceUpdatesToParentSkills(
          auth,
          {
            icon: this.icon,
            name: this.name,
            requestedSpaceIds: this.requestedSpaceIds,
            status: "active",
          },
          { transaction }
        );

        // Restore all editor group memberships (set suspended → active).
        if (this.editorGroup) {
          await this.editorGroup.restoreMembers(auth, { transaction });
        }
      }

      return count;
    });

    return { affectedCount };
  }

  async updateSkill(
    auth: Authenticator,
    {
      agentFacingDescription,
      attachedKnowledge,
      fileAttachments,
      icon,
      instructions,
      instructionsHtml,
      isDefault,
      mcpServerViews,
      name,
      reinforcement,
      requestedSpaceIds,
      source,
      sourceMetadata,
      status,
      userFacingDescription,
    }: {
      agentFacingDescription: string;
      attachedKnowledge: SkillAttachedKnowledge[];
      fileAttachments?: FileResource[];
      icon: string | null;
      instructions: string;
      instructionsHtml?: string | null;
      isDefault?: boolean;
      mcpServerViews: MCPServerViewResource[];
      name: string;
      reinforcement?: SkillReinforcementMode;
      requestedSpaceIds: ModelId[];
      source?: SkillSourceType;
      sourceMetadata?: SkillSourceMetadata;
      status?: SkillStatus;
      userFacingDescription: string;
    }
  ): Promise<void> {
    assert(this.canWrite(auth), "User is not authorized to update this skill");

    // Snapshot the previous name and icon before updating to detect changes below.
    const previousName = this.name;
    const previousIcon = this.icon;
    const previousStatus = this.status;

    await withTransaction(async (transaction) => {
      // Save the current version before updating.
      await skillVersions.saveVersion(auth, this, { transaction });

      // Snapshot the previous requested space IDs before updating.
      const previousRequestedSpaceIds = [...this.requestedSpaceIds];
      const previousRequestedSpaceIdsSet = new Set(previousRequestedSpaceIds);
      const requestedSpaceIdsChanged =
        previousRequestedSpaceIds.length !== requestedSpaceIds.length ||
        requestedSpaceIds.some(
          (spaceId) => !previousRequestedSpaceIdsSet.has(spaceId)
        );
      const statusChanged = status !== undefined && previousStatus !== status;

      const editedBy = auth.user()?.id;
      await this.update(
        {
          name,
          agentFacingDescription,
          userFacingDescription,
          instructions,
          ...(instructionsHtml !== undefined ? { instructionsHtml } : {}),
          icon,
          requestedSpaceIds,
          editedBy,
          ...(status ? { status } : {}),
          ...(source ? { source } : {}),
          ...(sourceMetadata ? { sourceMetadata } : {}),
          ...(isDefault !== undefined ? { isDefault } : {}),
          ...(reinforcement !== undefined ? { reinforcement } : {}),
        },
        transaction
      );

      await this.normalizeSkillReferenceTags(auth, { transaction });
      await this.syncSkillReferences(auth, { transaction });

      if (
        name !== previousName ||
        icon !== previousIcon ||
        requestedSpaceIdsChanged ||
        statusChanged
      ) {
        await this.propagateReferenceUpdatesToParentSkills(
          auth,
          {
            icon,
            name,
            requestedSpaceIds,
            status: status ?? this.status,
          },
          { transaction }
        );
      }

      await this.updateMCPServerViews(auth, mcpServerViews, { transaction });

      await skillUpdates.setAttachedKnowledge(
        auth,
        this,
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

    if (fileAttachments) {
      await this.setFileAttachments(auth, fileAttachments);
    }

    await this.upsertCurrentUserAsEditor(auth);
  }

  async updateReinforcement(
    reinforcement: SkillReinforcementMode
  ): Promise<void> {
    await this.update({ reinforcement });
  }

  async updateSelfImprovementLock(selfImprovementLock: boolean): Promise<void> {
    await this.update({ selfImprovementLock });
  }

  async updateSelfImprovementCostsCap(
    selfImprovementCostsCapMicroUsd: number | null
  ): Promise<void> {
    await this.update({ selfImprovementCostsCapMicroUsd });
  }

  async updateSelfImprovementCostsCapAwuCredits(
    selfImprovementCostsCapAwuCredits: number | null
  ): Promise<void> {
    await this.update({ selfImprovementCostsCapAwuCredits });
  }

  async recordReinforcementAnalysisCompletion(): Promise<void> {
    await this.update({ lastReinforcementAnalysisAt: new Date() });
  }

  private async updateMCPServerViews(
    auth: Authenticator,
    mcpServerViews: MCPServerViewResource[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await skillUpdates.syncMCPServerViews(auth, this, mcpServerViews, {
      transaction,
    });

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
    return skillUpdates.computeDataSourceConfigurationChanges(owner, {
      attachedKnowledge,
      existingConfigurations,
      skillConfigurationId,
    });
  }

  private async setFileAttachments(
    auth: Authenticator,
    fileAttachments: FileResource[]
  ): Promise<void> {
    await skillUpdates.syncFileAttachments(auth, this, fileAttachments);

    // Update instance to avoid stale data.
    this.fileAttachments = fileAttachments;
  }

  async delete(auth: Authenticator): Promise<Result<number, Error>> {
    return skillLifecycle.deleteSkill(auth, this);
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

  static async listByConversationModelId(
    auth: Authenticator,
    conversationModelId: ModelId
  ): Promise<SkillResource[]> {
    const workspace = auth.getNonNullableWorkspace();

    const agentMessageSkills = await AgentMessageSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversationModelId,
      },
    });

    // Include all statuses for historical accuracy.
    return this.fetchBySkillReferences(auth, agentMessageSkills, {
      status: ["active", "archived", "suggested"],
    });
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    return skillLifecycle.deleteAllForWorkspace(auth);
  }
}
