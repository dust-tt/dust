import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { updateAgentRequirements } from "@app/lib/api/assistant/configuration/agent_requirements";
import { getEffectiveSpaceIdsForAgentRun } from "@app/lib/api/assistant/conversation/selected_spaces";
import { updateConversationRequirementsForSkills } from "@app/lib/api/assistant/conversation/skill_permissions";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import {
  filterUsersWithSharedMembership,
  hasSharedMembership,
} from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { hasAll } from "@app/lib/matcher/operators/array";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import {
  AgentMessageSkillModel,
  ConversationSkillModel,
} from "@app/lib/models/skill/conversation_skill";
import { SkillReferenceModel } from "@app/lib/models/skill/skill_reference";
import { SkillSuggestionModel } from "@app/lib/models/skill/skill_suggestion";
import { SkillUserFavoriteModel } from "@app/lib/models/skill/skill_user_favorite";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { canReadRequestedSpaces } from "@app/lib/resources/permission_utils";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import type {
  CodeDefinedSkillFile,
  SkillDefinition,
} from "@app/lib/resources/skill/code_defined/shared";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import type { SkillConfigurationFindOptions } from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import {
  getResourceIdFromSId,
  getResourceNameAndIdFromSId,
  isResourceSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import {
  extractUniqueSkillReferenceIds,
  parseSkillReferenceTag,
  renameSkillReferencesInContent,
  SKILL_REFERENCE_TAG_REGEX,
  serializeSkillTag,
  serializeUnavailableSkillTag,
} from "@app/lib/skills/format";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  AgentConfigurationWithoutModelType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { isPodConversation } from "@app/types/assistant/conversation";
import type {
  SkillAvailability,
  SkillReinforcementMode,
  SkillSourceMetadata,
  SkillSourceType,
  SkillStatus,
  SkillType,
  UsedBySkillType,
} from "@app/types/assistant/skill_configuration";
import { isDefaultFromAvailability } from "@app/types/assistant/skill_configuration";
import type { AgentsUsageType } from "@app/types/data_source";
import { grantKey } from "@app/types/group_permissions";
import type {
  AccessControlList,
  RoleGrant,
} from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  isNumber,
  isString,
  removeNulls,
} from "@app/types/shared/utils/general";
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

type SkillReferenceTarget = {
  icon: string | null;
  id: string;
  name: string;
  requestedSpaceIds: readonly ModelId[];
  status: SkillStatus;
};

type ReplaceSkillReferenceTagsOptions = {
  html?: boolean;
};

// How the fetch path treats the custom skills the caller cannot read (row ACL, or a requested
// space they are not a member of):
// - "strict" (default): drop them.
// - "redact_unreadable": keep them, redacted (see `redactedForCaller`). Admins only.
// - "dangerously_skip": keep them as is. Only for callers that must operate on a skill without
//   gaining access to what its spaces protect, e.g. an admin re-saving an agent they do not edit:
//   dropping the skill would silently strip it from the new version.
export type SkillPermissionFilteringMode =
  | "strict"
  | "redact_unreadable"
  | "dangerously_skip";

type SkillFetchContext = {
  permissionFiltering?: SkillPermissionFilteringMode;
} & (
  | {
      agentLoopData?: AgentLoopExecutionData;
      effectiveSpaceIds: string[];
    }
  | {
      agentLoopData?: never;
      effectiveSpaceIds?: string[];
    }
);

type SkillResourceConstructorOptions =
  | {
      dataSourceConfigurations: SkillDataSourceConfigurationModel[];
      // When true, the global skill's instructions are exposed to the front-end.
      exposeInstructions?: boolean;
      fileAttachments: FileResource[];
      // Files that ship with a code-defined skill (addressable, not embedded).
      files?: readonly CodeDefinedSkillFile[];
      globalSId: string;
      mcpServerConfigurations: SkillMCPServerConfiguration[];
      version?: number;
    }
  | {
      dataSourceConfigurations: SkillDataSourceConfigurationModel[];
      // Custom skills always expose their own instructions; this flag is unused.
      exposeInstructions?: undefined;
      fileAttachments: FileResource[];
      files?: readonly CodeDefinedSkillFile[];
      globalSId?: undefined;
      mcpServerConfigurations: SkillMCPServerConfiguration[];
      version?: number;
    };

type SkillVersionCreationAttributes =
  CreationAttributes<SkillConfigurationModel> & {
    skillConfigurationId: ModelId;
    version: number;
    mcpServerViewIds: ModelId[];
    fileAttachmentIds: ModelId[];
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
 * @see SystemSkillsRegistry for always-enabled system skill definitions
 */

// The grant a skill's editors hold on the skill. Its verbs live in ROLE_REGISTRY.skill.
const SKILL_EDITOR_GRANT_TYPE = "editor" as const;

// Reading a skill is granted by the groups holding a `read` verb on it — the workspace global
// group's workspace-wide `reader` grant, or an editor's `editor` grant — never by the caller's
// role. Administrating one stays a role power for now.
const SKILL_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["admin"] },
];

// Code-defined global/system skills: everyone in the workspace reads them, nobody edits them — they
// have no row and no editor group, so no grant can ever point at them.
const GLOBAL_SKILL_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["read"] },
  { role: "manager", permissions: ["read"] },
  { role: "user", permissions: ["read"] },
  { role: "builder", permissions: ["read"] },
];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SkillResource extends BaseResource<SkillConfigurationModel> {
  static model: ModelStatic<SkillConfigurationModel> = SkillConfigurationModel;

  readonly dataSourceConfigurations: SkillDataSourceConfigurationModel[];
  private fileAttachments: FileResource[];
  private readonly codeDefinedFiles: readonly CodeDefinedSkillFile[];
  readonly version: number | null = null;

  private readonly globalSId: string | null;
  // Only meaningful for global skills: whether their instructions may be
  // serialized to the front-end. Custom skills always expose their own.
  private readonly exposeInstructions: boolean;
  // Set on the skills an admin fetched without being able to read them (built on spaces they are
  // not a member of): `canRead` answers false and `toJSON` drops the private fields. The other
  // permissions are left as they are, so an admin can still administrate such a skill (archive,
  // availability). See the "redact_unreadable" permission filtering mode of the fetchers.
  private redactedForCaller = false;

  private _mcpServerConfigurations: SkillMCPServerConfiguration[];

  private constructor(
    _: ModelStatic<SkillConfigurationModel>,
    blob: Attributes<SkillConfigurationModel>,
    {
      dataSourceConfigurations,
      exposeInstructions,
      fileAttachments,
      files,
      globalSId,
      mcpServerConfigurations,
      version,
    }: SkillResourceConstructorOptions
  ) {
    super(SkillConfigurationModel, blob);

    this.dataSourceConfigurations = dataSourceConfigurations;
    this.exposeInstructions = exposeInstructions ?? false;
    this.fileAttachments = fileAttachments ?? [];
    this.codeDefinedFiles = files ?? [];
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

  getFileAttachments(): readonly FileResource[] {
    return this.fileAttachments;
  }

  getCodeDefinedFiles(): readonly CodeDefinedSkillFile[] {
    return this.codeDefinedFiles;
  }

  hasFiles(): boolean {
    return this.fileAttachments.length > 0 || this.codeDefinedFiles.length > 0;
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

  // Mirrors `SkillDefinition["kind"]` for code-defined skills; anything without a global sId is
  // authored in the workspace.
  get kind(): "custom" | "global" | "system" {
    if (!this.globalSId) {
      return "custom";
    }

    return this.isSystemSkill ? "system" : "global";
  }

  get isSystemSkill(): boolean {
    if (!this.globalSId) {
      return false;
    }

    return SystemSkillsRegistry.isSystemSkill(this.sId);
  }

  get inheritsAgentConfigurationDataSources(): boolean {
    if (!this.globalSId) {
      return false;
    }

    return (
      GlobalSkillsRegistry.doesSkillInheritAgentConfigurationDataSources(
        this.globalSId
      ) ||
      SystemSkillsRegistry.doesSkillInheritAgentConfigurationDataSources(
        this.globalSId
      )
    );
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

    assert(
      await auth.hasWorkspacePermission("create", "skill"),
      "User is not authorized to create skills"
    );

    if (blob.availability === "users_and_agents") {
      assert(
        await auth.hasWorkspacePermission("make_discoverable", "skill"),
        "User is not authorized to create an auto-discoverable skill"
      );
    }

    // Use a transaction to ensure all creations succeed or all are rolled back.
    const skillResource = await withTransaction(async (transaction) => {
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

      if (addCurrentUserAsEditor) {
        await this.grantCreatorAsEditor(auth, skill, { transaction });
      }

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
        fileAttachments,
        mcpServerConfigurations: mcpServerViews.map((view) => ({
          view,
        })),
      });

      await skillResource.normalizeSkillReferenceTags(auth, { transaction });
      await skillResource.syncSkillReferences(auth, { transaction });

      return skillResource;
    });

    // Creating the skill wrote the creator's `editor` grant, so the grants `auth` resolved at
    // construction are now stale and the caller would not be an editor of the skill they just
    // created. Refresh the snapshot now that the write has committed, as space creation does.
    await auth.refresh();

    return skillResource;
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
      mcpServerViewIds,
      {
        includeHeavyAttributes: [
          "authorization",
          "cachedTools",
          "customHeaders",
          "lastError",
          "sharedSecret",
        ],
      }
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
   * Grants the creating user the skill's `editor` grant, which `grantToUser` holds in one
   * regular_auto group per skill. Skills do not carry an editor group of their own: editorship
   * lives entirely in `group_permissions`.
   */
  private static async grantCreatorAsEditor(
    auth: Authenticator,
    skill: SkillConfigurationModel,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    assert(
      skill.workspaceId === workspace.id,
      "Unexpected: skill and workspace mismatch"
    );

    const grantResult = await GroupPermissionResource.grantToUser(auth, {
      user: auth.getNonNullableUser().toJSON(),
      grantType: SKILL_EDITOR_GRANT_TYPE,
      resourceType: "skill",
      resourceId: skill.id,
      transaction,
    });
    // This grant is the only thing making the creator an editor of their own skill: without it the
    // skill is created with no editor and nobody but a workspace admin can fix it. Throwing rolls
    // the creation transaction back.
    if (grantResult.isErr()) {
      throw new Error(
        `Failed to grant the skill creator their editor grant: ${grantResult.error.message}`
      );
    }
  }

  /**
   * The skills of `skills` the caller can read. Two checks, both required: the caller must be able
   * to read the skill itself (see `canRead`) and every space it requests. A missing/deleted
   * requested space is treated as not readable (see `canReadRequestedSpaces`), so skills
   * referencing one are dropped too. This is what the fetch path applies (see
   * `SkillPermissionFilteringMode`).
   */
  private static async filterReadable(
    auth: Authenticator,
    skills: SkillConfigurationModel[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<SkillConfigurationModel[]> {
    const uniqueRequestedSpaceIds = uniq(
      skills.flatMap((skill) => skill.requestedSpaceIds)
    );
    const spaces =
      uniqueRequestedSpaceIds.length > 0
        ? await SpaceResource.fetchByModelIds(auth, uniqueRequestedSpaceIds, {
            transaction,
          })
        : [];
    const spaceByModelId = new Map(spaces.map((s) => [s.id, s]));

    return skills.filter(
      (skill) =>
        this.canReadRow(auth, skill) &&
        canReadRequestedSpaces(auth, spaceByModelId, skill.requestedSpaceIds)
    );
  }

  private static async baseFetch(
    auth: Authenticator,
    options: SkillConfigurationFindOptions = {},
    context: {
      agentLoopData?: AgentLoopExecutionData;
      effectiveSpaceIds?: string[];
      permissionFiltering?: SkillPermissionFilteringMode;
      transaction?: Transaction;
    } = {}
  ): Promise<SkillResource[]> {
    const workspace = auth.getNonNullableWorkspace();
    const {
      agentLoopData,
      effectiveSpaceIds: providedEffectiveSpaceIds,
      permissionFiltering = "strict",
      transaction,
    } = context;

    const {
      where,
      includes,
      onlyCustom,
      withInstructions = true,
      withTools = true,
      withToolMetadata = false,
      withFileAttachments = true,
      ...otherOptions
    } = options;

    const customSkills = await this.model.findAll({
      ...otherOptions,
      ...(withInstructions
        ? {}
        : { attributes: { exclude: ["instructions", "instructionsHtml"] } }),
      where: {
        // Fetch active by default, unless explicitly overridden by the caller.
        status: "active",
        ...omit(where, "sId"),
        workspaceId: workspace.id,
      },
      include: includes,
      transaction,
    });

    let allowedCustomSkills: SkillConfigurationModel[];
    const redactedCustomSkillIds = new Set<ModelId>();
    switch (permissionFiltering) {
      case "strict":
        allowedCustomSkills = await this.filterReadable(auth, customSkills, {
          transaction,
        });
        break;
      case "redact_unreadable": {
        if (!auth.isAdmin()) {
          throw new Error("Only admins can fetch the skills they cannot read.");
        }
        const readableIds = new Set(
          (await this.filterReadable(auth, customSkills, { transaction })).map(
            (skill) => skill.id
          )
        );
        for (const skill of customSkills) {
          if (!readableIds.has(skill.id)) {
            redactedCustomSkillIds.add(skill.id);
          }
        }
        allowedCustomSkills = customSkills;
        break;
      }
      case "dangerously_skip":
        allowedCustomSkills = customSkills;
        break;
      default:
        assertNever(permissionFiltering);
    }
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
          {
            includeMetadata: withToolMetadata,
            includeHeavyAttributes: [
              "authorization",
              "cachedTools",
              "customHeaders",
              "lastError",
              "sharedSecret",
            ],
          }
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

      const fileAttachmentModels = withFileAttachments
        ? await SkillFileAttachmentModel.findAll({
            where: {
              workspaceId: workspace.id,
              skillConfigurationId: {
                [Op.in]: allowedCustomSkillIds,
              },
            },
            transaction,
          })
        : [];

      const allFileResources = withFileAttachments
        ? await FileResource.fetchByModelIdsWithAuth(
            auth,
            fileAttachmentModels.map((a) => a.fileId),
            transaction
          )
        : [];

      const fileResourceById = new Map(allFileResources.map((f) => [f.id, f]));

      const fileAttachmentsBySkillId = groupBy(
        fileAttachmentModels,
        "skillConfigurationId"
      );

      allowedCustomSkillsRes = allowedCustomSkills.map((customSkill) => {
        const customSkillAttributes = {
          ...customSkill.get(),
          ...(withInstructions
            ? {}
            : { instructions: "", instructionsHtml: null }),
        };
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

        const resource = new this(this.model, customSkillAttributes, {
          mcpServerConfigurations: skillMCPServerViews.map((view) => ({
            view,
          })),
          dataSourceConfigurations: skillDataSourceConfigs,
          fileAttachments: removeNulls(
            (fileAttachmentsBySkillId[customSkill.id] ?? []).map(
              (a) => fileResourceById.get(a.fileId) ?? null
            )
          ),
        });
        if (redactedCustomSkillIds.has(customSkill.id)) {
          resource.redactedForCaller = true;
        }
        return resource;
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

    const effectiveSpaceIds = providedEffectiveSpaceIds ?? [];
    const requestedSpaceModelIds = removeNulls(
      effectiveSpaceIds.map(getResourceIdFromSId)
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
        {
          transaction,
          includeHeavyAttributes: [
            "authorization",
            "cachedTools",
            "customHeaders",
            "lastError",
            "sharedSecret",
          ],
        }
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
          effectiveSpaceIds,
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
    {
      permissionFiltering,
      status,
      withTools = true,
    }: {
      permissionFiltering?: SkillPermissionFilteringMode;
      // `baseFetch` returns active skills only unless a status is given.
      status?: SkillStatus | SkillStatus[];
      withTools?: boolean;
    } = {}
  ): Promise<SkillResource[]> {
    return this.baseFetch(
      auth,
      {
        where: {
          id: {
            [Op.in]: ids,
          },
          ...(status ? { status } : {}),
        },
        onlyCustom: true,
        withTools,
      },
      { permissionFiltering }
    );
  }

  static async fetchFileSkills(
    auth: Authenticator,
    file: FileResource
  ): Promise<{ isReferenced: boolean; skills: SkillResource[] }> {
    const workspace = auth.getNonNullableWorkspace();
    // The unique workspace/file index bounds this lookup to one attachment.
    const attachment = await SkillFileAttachmentModel.findOne({
      attributes: ["skillConfigurationId"],
      where: {
        fileId: file.id,
        workspaceId: workspace.id,
      },
    });

    if (attachment) {
      const skills = await this.fetchByModelIds(auth, [
        attachment.skillConfigurationId,
      ]);
      return { isReferenced: true, skills };
    }

    // This fallback is only used for detached files. The workspace-leading index bounds the scan.
    const where: WhereOptions<SkillVersionModel> = {
      fileAttachmentIds: { [Op.contains]: [file.id] },
      workspaceId: workspace.id,
    };
    const versions = await SkillVersionModel.findAll({
      attributes: ["skillConfigurationId"],
      group: ["skillConfigurationId"],
      where,
    });

    const skillModelIds = uniq(
      versions.map((version) => version.skillConfigurationId)
    );
    const skills = await this.fetchByModelIds(auth, skillModelIds);
    return { isReferenced: skillModelIds.length > 0, skills };
  }

  static async fetchById(
    auth: Authenticator,
    sId: string,
    {
      permissionFiltering,
    }: { permissionFiltering?: SkillPermissionFilteringMode } = {}
  ): Promise<SkillResource | null> {
    const [skill] = await this.fetchByIds(auth, [sId], { permissionFiltering });

    return skill ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[],
    {
      agentLoopData,
      effectiveSpaceIds,
      permissionFiltering,
      onlyActive = false,
      withInstructions = true,
      withTools = true,
      withFileAttachments = true,
    }: SkillFetchContext &
      Pick<
        SkillConfigurationFindOptions,
        "withInstructions" | "withTools" | "withFileAttachments"
      > & { onlyActive?: boolean } = {}
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
        withInstructions,
        withTools,
        withFileAttachments,
      },
      { agentLoopData, effectiveSpaceIds, permissionFiltering }
    );
  }

  static async fetchByName(
    auth: Authenticator,
    name: string,
    { agentLoopData, effectiveSpaceIds }: SkillFetchContext = {}
  ): Promise<SkillResource | null> {
    const resources = await this.baseFetch(
      auth,
      {
        where: {
          name,
        },
        limit: 1,
      },
      { agentLoopData, effectiveSpaceIds }
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
      {
        withInstructions: false,
        withTools: false,
        withFileAttachments: false,
      }
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

  private static skillReferenceChildId(
    auth: Authenticator,
    reference: Pick<
      SkillReferenceModel,
      "childCustomSkillId" | "childGlobalSkillId"
    >
  ): string | null {
    if (reference.childGlobalSkillId !== null) {
      return reference.childGlobalSkillId;
    }

    if (reference.childCustomSkillId !== null) {
      const workspace = auth.getNonNullableWorkspace();

      return this.modelIdToSId({
        id: reference.childCustomSkillId,
        workspaceId: workspace.id,
      });
    }

    return null;
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
      effectiveSpaceIds,
      permissionFiltering,
      status,
      transaction,
      withInstructions,
      withTools,
      withToolMetadata,
      withFileAttachments,
    }: {
      agentLoopData?: AgentLoopExecutionData;
      effectiveSpaceIds?: string[];
      permissionFiltering?: SkillPermissionFilteringMode;
      status?: SkillStatus | SkillStatus[];
      transaction?: Transaction;
      withInstructions?: boolean;
      withTools?: boolean;
      withToolMetadata?: boolean;
      withFileAttachments?: boolean;
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
        withToolMetadata,
        withFileAttachments,
      },
      {
        agentLoopData,
        effectiveSpaceIds,
        permissionFiltering,
        transaction,
      }
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

  static async listFavoritesForCurrentUser(
    auth: Authenticator,
    context?: SkillFetchContext
  ): Promise<SkillResource[]> {
    const user = auth.user();
    if (!user) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();
    const favorites = await SkillUserFavoriteModel.findOne({
      attributes: ["skillIds"],
      where: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    });

    if (!favorites || favorites.skillIds.length === 0) {
      return [];
    }

    return this.fetchByIds(auth, favorites.skillIds, {
      ...context,
      onlyActive: true,
    });
  }

  async isFavoriteForCurrentUser(auth: Authenticator): Promise<boolean> {
    const user = auth.user();
    if (!user) {
      return false;
    }

    const workspace = auth.getNonNullableWorkspace();
    const favorites = await SkillUserFavoriteModel.findOne({
      attributes: ["skillIds"],
      where: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    });

    return favorites?.skillIds.includes(this.sId) ?? false;
  }

  async setFavorite(
    auth: Authenticator,
    isFavorite: boolean
  ): Promise<Result<undefined, Error>> {
    const user = auth.user();
    if (!user) {
      return new Err(new Error("User must be authenticated"));
    }

    if (this.status !== "active") {
      return new Err(
        new Error("Only active skills can update favorite state.")
      );
    }

    const workspace = auth.getNonNullableWorkspace();
    const favorites = await SkillUserFavoriteModel.findOne({
      where: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    });

    const wasFavorite = favorites?.skillIds.includes(this.sId) ?? false;
    if (wasFavorite === isFavorite) {
      return new Ok(undefined);
    }

    if (favorites) {
      await favorites.update({
        skillIds: isFavorite
          ? [...favorites.skillIds, this.sId]
          : favorites.skillIds.filter((skillId) => skillId !== this.sId),
      });
    } else {
      await SkillUserFavoriteModel.create({
        workspaceId: workspace.id,
        userId: user.id,
        skillIds: [this.sId],
      });
    }

    if (!this.globalSId) {
      await this.model.increment("favoriteCount", {
        by: isFavorite ? 1 : -1,
        where: {
          id: this.id,
          workspaceId: workspace.id,
        },
      });
    }

    return new Ok(undefined);
  }

  static async listByAgentConfiguration(
    auth: Authenticator,
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"],
    {
      agentLoopData,
      effectiveSpaceIds,
      permissionFiltering,
    }: SkillFetchContext = {}
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
      effectiveSpaceIds,
      permissionFiltering,
    });
  }

  /**
   * Batched version of listByAgentConfiguration. Performs 2 SQL queries.
   * Does not support global agents as we rely on the ID for mapping.
   */
  static async listByAgentConfigurations(
    auth: Authenticator,
    agentConfigurations: AgentLoopExecutionData["agentConfiguration"][]
  ): Promise<
    {
      agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
      skill: SkillResource;
    }[]
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

  /**
   * Returns skill references for an agent configuration.
   * For global agents, returns references from the config's skills field.
   * For non-global agents, queries the database.
   * TODO(2026-01-30 agent-resource): move this to an AgentResource that would bundle the logic
   *   about loading skills and will expose a unified interface.
   */
  static async getSkillReferencesForAgent(
    auth: Authenticator,
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"]
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
      availability,
      updatedAfter,
      reinforcementNotOff,
      withInstructions = true,
      withTools = true,
      withFileAttachments = true,
      permissionFiltering,
    }: {
      status?: SkillStatus | SkillStatus[];
      limit?: number;
      globalSpaceOnly?: boolean;
      onlyCustom?: boolean;
      availability?: SkillAvailability | SkillAvailability[];
      updatedAfter?: Date;
      reinforcementNotOff?: boolean;
      withInstructions?: boolean;
      withTools?: boolean;
      withFileAttachments?: boolean;
      permissionFiltering?: SkillPermissionFilteringMode;
    } = {}
  ): Promise<SkillResource[]> {
    const skills = await this.baseFetch(
      auth,
      {
        where: {
          status,
          ...(availability !== undefined ? { availability } : {}),
          ...(updatedAfter ? { updatedAt: { [Op.gte]: updatedAfter } } : {}),
          ...(reinforcementNotOff ? { reinforcement: { [Op.ne]: "off" } } : {}),
        },
        ...(limit ? { limit } : {}),
        onlyCustom,
        withInstructions,
        withTools,
        withFileAttachments,
      },
      { permissionFiltering }
    );

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
    { agentLoopData, effectiveSpaceIds }: SkillFetchContext = {}
  ): Promise<SkillResource[]> {
    return this.baseFetch(
      auth,
      {
        where: {
          status: "active",
          availability: "users_and_agents",
        },
      },
      { agentLoopData, effectiveSpaceIds }
    );
  }

  /**
   * List skills that use any of the given MCP server view IDs. Used during space deletion to find
   * skills that need to be updated. Defaults to active skills; pass `status` to widen.
   */
  static async listByMCPServerViewIds(
    auth: Authenticator,
    mcpServerViewIds: ModelId[],
    { status = "active" }: { status?: SkillStatus | SkillStatus[] } = {}
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
        status,
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
    dataSourceViewIds: ModelId[],
    {
      status = "active",
      withInstructions = true,
      withTools = true,
      withFileAttachments = true,
    }: Pick<
      SkillConfigurationFindOptions,
      "withInstructions" | "withTools" | "withFileAttachments"
    > & { status?: SkillStatus | SkillStatus[] } = {}
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
        status,
      },
      onlyCustom: true,
      withInstructions,
      withTools,
      withFileAttachments,
    });
  }

  /**
   * List skills that use any of the given data source IDs.
   */
  static async listByDataSourceIds(
    auth: Authenticator,
    dataSourceIds: ModelId[],
    {
      withInstructions = true,
      withTools = true,
      withFileAttachments = true,
    }: Pick<
      SkillConfigurationFindOptions,
      "withInstructions" | "withTools" | "withFileAttachments"
    > = {}
  ): Promise<SkillResource[]> {
    if (dataSourceIds.length === 0) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();

    // Query skill IDs that have any of the given data sources.
    const skillConfigs = await SkillDataSourceConfigurationModel.findAll({
      attributes: ["skillConfigurationId"],
      where: {
        workspaceId: workspace.id,
        dataSourceId: {
          [Op.in]: dataSourceIds,
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
      withInstructions,
      withTools,
      withFileAttachments,
    });
  }

  /**
   * List skills whose requestedSpaceIds contains the given space. Used during space deletion to
   * find skills that reference the space even when they have no MCP server view or data source
   * view located in it. Defaults to active skills; pass `status` to widen (space deletion must
   * clean archived skills too, or their dangling reference makes them unfetchable for good).
   */
  static async listByRequestedSpaceId(
    auth: Authenticator,
    spaceModelId: ModelId,
    { status = "active" }: { status?: SkillStatus | SkillStatus[] } = {}
  ): Promise<SkillResource[]> {
    return this.baseFetch(auth, {
      where: {
        requestedSpaceIds: {
          [Op.contains]: [spaceModelId],
        },
        status,
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
      effectiveSpaceIds,
      transaction,
    }: SkillFetchContext & {
      conversation: ConversationWithoutContentType | ConversationResource;
      agentConfiguration?: AgentConfigurationWithoutModelType;
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
      effectiveSpaceIds,
      transaction,
    });
  }

  static async listPodDefaultSkillsForConversation(
    auth: Authenticator,
    {
      conversation,
      agentLoopData,
      effectiveSpaceIds,
    }: {
      conversation: ConversationWithoutContentType;
      agentLoopData?: AgentLoopExecutionData;
      effectiveSpaceIds: string[];
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
      effectiveSpaceIds,
      onlyActive: true,
    });
  }

  static async listForAgentLoop(
    auth: Authenticator,
    params:
      | AgentLoopExecutionData
      | Pick<AgentLoopExecutionData, "agentConfiguration" | "conversation">
      | {
          agentConfiguration: AgentConfigurationWithoutModelType;
          conversation: ConversationWithoutContentType;
        }
  ): Promise<{
    effectiveSpaceIds: string[];
    hasSelectedSpacesOutsideAgentScope: boolean;
    enabledSkills: SkillResource[];
    systemSkills: SkillResource[];
    equippedSkills: SkillResource[];
    favoriteSkills: SkillResource[];
  }> {
    const { agentConfiguration, conversation } = params;
    // Light type-guard to check whether we have a full AgentLoopExecutionData.
    const agentLoopData = "userMessage" in params ? params : undefined;
    const effectiveSpaceIds = await getEffectiveSpaceIdsForAgentRun(auth, {
      agentConfiguration,
      conversation,
    });
    const requestedSpaceIds = new Set(agentConfiguration.requestedSpaceIds);
    const hasSelectedSpacesOutsideAgentScope = effectiveSpaceIds.some(
      (spaceId) => !requestedSpaceIds.has(spaceId)
    );

    const conversationEnabledSkills = await this.listEnabledByConversation(
      auth,
      {
        conversation,
        agentConfiguration,
        agentLoopData,
        effectiveSpaceIds,
      }
    );

    const podDefaultSkills = await this.listPodDefaultSkillsForConversation(
      auth,
      { conversation, agentLoopData, effectiveSpaceIds }
    );

    const allAgentSkills = await this.listByAgentConfiguration(
      auth,
      agentConfiguration,
      { agentLoopData, effectiveSpaceIds }
    );

    let discoverableSkills: SkillResource[] = [];
    let favoriteSkills: SkillResource[] = [];
    if (allAgentSkills.some((s) => s.globalSId === "discover_skills")) {
      discoverableSkills = await this.listDiscoverable(auth, {
        agentLoopData,
        effectiveSpaceIds,
      });
      const hasSkillFavorites = await hasFeatureFlag(auth, "skill_favorites");
      if (hasSkillFavorites) {
        favoriteSkills = await this.listFavoritesForCurrentUser(auth, {
          agentLoopData,
          effectiveSpaceIds,
        });
      }
    }

    const sortByName = (a: SkillResource, b: SkillResource) =>
      a.name.localeCompare(b.name);

    // Code-defined skills can auto-add themselves for the current loop.
    // Returning "enabled" promotes a global skill to a system skill.
    // `findAll` already drops restricted skills, so a flag-gated skill only
    // shows up once its feature flag is on.
    const autoEnabledSkillRefs: {
      globalSkillId: string;
      customSkillId: null;
    }[] = [];
    const autoEquippedSkillRefs: {
      globalSkillId: string;
      customSkillId: null;
    }[] = [];
    for (const def of [
      ...(await SystemSkillsRegistry.findAll(auth)),
      ...(await GlobalSkillsRegistry.findAll(auth)),
    ]) {
      switch (
        def.getAutoEnabledOrEquippedForAgentLoop?.({
          agentConfiguration,
          conversation,
        })
      ) {
        case "enabled":
          autoEnabledSkillRefs.push({
            globalSkillId: def.sId,
            customSkillId: null,
          });
          break;
        case "equipped":
          autoEquippedSkillRefs.push({
            globalSkillId: def.sId,
            customSkillId: null,
          });
          break;
        default:
          break;
      }
    }

    const autoEnabledSkills = autoEnabledSkillRefs.length
      ? await this.fetchBySkillReferences(auth, autoEnabledSkillRefs, {
          agentLoopData,
          effectiveSpaceIds,
        })
      : [];

    const autoEquippedSkills = autoEquippedSkillRefs.length
      ? await this.fetchBySkillReferences(auth, autoEquippedSkillRefs, {
          agentLoopData,
          effectiveSpaceIds,
          withInstructions: false,
          withTools: false,
          withFileAttachments: false,
        })
      : [];

    const systemSkillsFromAgent = allAgentSkills.filter((s) => s.isSystemSkill);

    // Active baseline skills for this loop: configured system skills, plus
    // code-defined skills that this context promotes to system prompt content.
    const systemSkills = [
      ...new Map(
        [...systemSkillsFromAgent, ...autoEnabledSkills].map((s) => [s.sId, s])
      ).values(),
    ];
    const systemSkillIds = new Set(systemSkills.map((skill) => skill.sId));

    // Equipped skills are the workspace-shared enable-able candidates shown to
    // the model. User-specific favorites are returned separately so they don't
    // invalidate the shared prompt cache prefix.
    const equippedSkillsById = new Map<string, SkillResource>();
    for (const skill of [
      ...autoEquippedSkills,
      ...discoverableSkills,
      ...podDefaultSkills,
      ...allAgentSkills,
    ]) {
      if (
        !systemSkillIds.has(skill.sId) &&
        !equippedSkillsById.has(skill.sId)
      ) {
        equippedSkillsById.set(skill.sId, skill);
      }
    }

    return {
      effectiveSpaceIds,
      hasSelectedSpacesOutsideAgentScope,
      systemSkills: systemSkills.sort(sortByName),
      enabledSkills: conversationEnabledSkills
        .filter((s) => !systemSkillIds.has(s.sId))
        .sort(sortByName),
      equippedSkills: [...equippedSkillsById.values()].sort(sortByName),
      favoriteSkills: favoriteSkills
        .filter(
          (skill) =>
            !systemSkillIds.has(skill.sId) && !equippedSkillsById.has(skill.sId)
        )
        .sort(sortByName),
    };
  }

  async upsertToConversation(
    auth: Authenticator,
    {
      conversationId,
      enabled,
    }: {
      conversationId: ModelId;
      enabled: boolean;
    },
    { transaction }: { transaction?: Transaction } = {}
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
      transaction,
    });

    if (existingConversationSkill && !enabled) {
      await existingConversationSkill.destroy({ transaction });
      return new Ok(undefined);
    }

    if (!existingConversationSkill && enabled) {
      await ConversationSkillModel.create(
        {
          ...this.skillReference,
          conversationId,
          workspaceId: workspace.id,
          agentConfigurationId: null,
          source: "conversation",
          addedByUserId: user.id,
        } satisfies ConversationSkillCreationAttributes,
        { transaction }
      );
      return new Ok(undefined);
    }

    return new Ok(undefined);
  }

  static async upsertConversationSkills(
    auth: Authenticator,
    {
      conversation,
      skills,
      enabled,
    }: {
      conversation: ConversationWithoutContentType;
      skills: SkillResource[];
      enabled: boolean;
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    for (const skill of skills) {
      const result = await skill.upsertToConversation(
        auth,
        {
          conversationId: conversation.id,
          enabled,
        },
        { transaction }
      );

      if (result.isErr()) {
        return result;
      }
    }

    // When enabling skills, append their space requirements to the conversation so access is
    // gated on those spaces (no-op for project conversations).
    if (enabled) {
      await updateConversationRequirementsForSkills(auth, {
        skills,
        conversation,
        t: transaction,
      });
    }

    return new Ok(undefined);
  }

  static async clearAllEnabledByConversation(
    auth: Authenticator,
    {
      conversation,
    }: {
      conversation: ConversationWithoutContentType;
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    await ConversationSkillModel.destroy({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
      transaction,
    });
  }

  private static async fromGlobalSkill(
    auth: Authenticator,
    def: SkillDefinition,
    {
      agentLoopData,
      effectiveSpaceIds,
      mcpServerViews,
      withInstructions = true,
    }: {
      agentLoopData?: AgentLoopExecutionData;
      effectiveSpaceIds: string[];
      mcpServerViews: MCPServerViewResource[];
      withInstructions?: boolean;
    }
  ): Promise<SkillResource> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const requestedSpaceModelIds = removeNulls(
      effectiveSpaceIds.map(getResourceIdFromSId)
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
            spaceIds: effectiveSpaceIds,
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
        manuallyRequestedSpaceIds: [],
        status: "active",
        updatedAt: new Date(),
        workspaceId,
        icon: def.icon,
        source: null,
        sourceMetadata: null,
        availability: SystemSkillsRegistry.isSystemSkill(def.sId)
          ? "workspace_users"
          : "users_and_agents",
        favoriteCount: 0,
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
        files: def.files ?? [],
      }
    );
  }

  canRead(auth: Authenticator): boolean {
    if (this.redactedForCaller) {
      return false;
    }

    // See canWrite: API keys hold no skill grant, so any key reads any skill.
    if (auth.isKey()) {
      return true;
    }

    // Read comes from the role grants and from the groups holding a `read` verb on skills: the
    // global group's workspace-wide `reader` grant (seeded by `seedWorkspaceCapabilities`) and the
    // editors' own `editor` grant on this skill. `getGrantedVerbs` folds the type-wide grants in.
    return auth.hasPermission("read", this);
  }

  canWrite(auth: Authenticator): boolean {
    // TODO(governance): cleanup once we'll be able to grant API keys editorship on a skill.
    // TODO(@jd): Revisit this shortcircuit with our current ACLs stack.
    // API keys cannot hold a skill's `editor` grant (no such assignment mechanism exists),
    // so any key is allowed to write to any skill. Skill *creation* is separately gated by
    // `auth.hasWorkspacePermission("create", "skill")`; this only governs already-existing skills.
    if (auth.isKey()) {
      return true;
    }

    return auth.hasPermission("write", this);
  }

  canAdministrate(auth: Authenticator): boolean {
    // See canWrite: API keys have no editor-group assignment mechanism, so any key can
    // administrate any skill.
    if (auth.isKey()) {
      return true;
    }

    return auth.hasPermission("admin", this);
  }

  /**
   * The skill's access-control list: the code role rules plus the caller's own verbs resolved from
   * its `group_permissions` grants — for skills, the per-user `editor` grants held by the
   * regular_auto group (see `grantToUser`).
   */
  getAccessControlLists(auth: Authenticator): AccessControlList[] {
    // Global skills carry no row, so there is no grant to look up (and their synthetic `id` of -1
    // is the type-wide sentinel, which would resolve the workspace-wide capability grants instead).
    if (this.globalSId) {
      return [
        {
          roles: GLOBAL_SKILL_ROLE_GRANTS,
          workspaceId: this.workspaceId,
        },
      ];
    }

    return SkillResource.customSkillAccessControlLists(auth, this);
  }

  // The ACL of a custom skill, from its row: what `getAccessControlLists` serves for a fetched
  // resource, and what `canReadRow` evaluates in the fetch path, which filters rows before it has
  // resources.
  private static customSkillAccessControlLists(
    auth: Authenticator,
    skill: { id: ModelId; workspaceId: ModelId }
  ): AccessControlList[] {
    return [
      {
        roles: SKILL_ROLE_GRANTS,
        grantedVerbs: auth.getGrantedVerbs("skill", skill.id),
        workspaceId: skill.workspaceId,
      },
    ];
  }

  // `canRead` against a custom skill's row: the fetch path filters before building resources, so a
  // skill the caller cannot read is never hydrated.
  private static canReadRow(
    auth: Authenticator,
    skill: SkillConfigurationModel
  ): boolean {
    // See canWrite: API keys hold no skill grant, so any key reads any skill.
    if (auth.isKey()) {
      return true;
    }

    return auth.hasPermissionForAcls(
      "read",
      this.customSkillAccessControlLists(auth, skill)
    );
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
      .map((agent) => ({
        sId: agent.sId,
        name: agent.name,
        pictureUrl: agent.pictureUrl,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      count: sortedAgents.length,
      agents: sortedAgents,
    };
  }

  private async updateActiveAgentsRequirements(
    auth: Authenticator,
    {
      previousRequestedSpaceIds,
      newRequestedSpaceIds = this.requestedSpaceIds,
    }: {
      // The spaces the skill previously contributed before the change
      previousRequestedSpaceIds: ModelId[];
      // The spaces the skill contributes after the change. Defaults to the
      // skill's current `requestedSpaceIds`, but callers can override it (e.g.
      // archiving treats the skill as contributing no spaces).
      newRequestedSpaceIds?: ModelId[];
    },
    { transaction }: { transaction?: Transaction }
  ): Promise<void> {
    if (
      previousRequestedSpaceIds.length === newRequestedSpaceIds.length &&
      hasAll(previousRequestedSpaceIds, newRequestedSpaceIds)
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
      (spaceId) => !newRequestedSpaceIds.includes(spaceId)
    );

    const workspace = auth.getNonNullableWorkspace();
    const agentIds = agents.map((a) => a.id);

    let actionsByAgentModelId = new Map<
      ModelId,
      MCPServerConfigurationType[]
    >();
    let skillByAgentModelId = new Map<ModelId, SkillResource[]>();

    if (spaceIdsRemovedFromThisSkill.length > 0) {
      actionsByAgentModelId = await fetchMCPServerActionConfigurations(auth, {
        configurationIds: agentIds,
        variant: "full",
      });

      const agentSkillModels = await AgentSkillModel.findAll({
        where: {
          agentConfigurationId: { [Op.in]: agentIds },
          workspaceId: workspace.id,
        },
      });

      // We only need to consider custom skills, as global skill have no effect on space requirements.
      const customSkills = await SkillResource.fetchByModelIds(
        auth,
        removeNulls(agentSkillModels.map((skill) => skill.customSkillId))
      );

      const skillByModelId = new Map<ModelId, SkillResource>(
        customSkills.map((skill) => [skill.id, skill])
      );
      for (const agentSkill of agentSkillModels) {
        if (!agentSkill.customSkillId) {
          continue;
        }
        const skill = skillByModelId.get(agentSkill.customSkillId);
        if (!skill) {
          continue;
        }
        const list =
          skillByAgentModelId.get(agentSkill.agentConfigurationId) ?? [];
        list.push(skill);
        skillByAgentModelId.set(agentSkill.agentConfigurationId, list);
      }
    }

    for (const agent of agents) {
      const spaceIdsToRemoveFromAgent = new Set<ModelId>();

      // Some spaces were removed from the skill: we must check if they need to be
      // removed from the agent. In order to achieve this, we check if the agent has
      // any other capabilities that require the removed spaces.
      if (spaceIdsRemovedFromThisSkill.length > 0) {
        const actions = actionsByAgentModelId.get(agent.id) ?? [];
        const otherAgentSkills = (
          skillByAgentModelId.get(agent.id) ?? []
        ).filter((skill) => skill.sId !== this.sId);

        const agentOtherCapabilitiesRequirements =
          await getAgentConfigurationRequirementsFromCapabilities(auth, {
            actions,
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
          .concat(newRequestedSpaceIds)
      );

      await updateAgentRequirements(
        auth,
        {
          agentModelId: agent.id,
          newSpaceIds,
        },
        { transaction }
      );
    }
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
      allMcpServerViewIds,
      {
        includeHeavyAttributes: [
          "authorization",
          "cachedTools",
          "customHeaders",
          "lastError",
          "sharedSecret",
        ],
      }
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
          manuallyRequestedSpaceIds: versionModel.manuallyRequestedSpaceIds,
          source: versionModel.source,
          sourceMetadata: versionModel.sourceMetadata,
          availability: versionModel.availability,
          favoriteCount: this.favoriteCount,
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
          fileAttachments,
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

  /**
   * The skill's editors: the members of the regular_auto group holding the skill's `editor` grant
   * (see `GroupPermissionResource.grantToUser`). Together with `batchListEditors`, the only place
   * editors are read from.
   *
   * Returns null for code-defined global/system skills, which have no editors.
   */
  async listEditors(auth: Authenticator): Promise<UserResource[] | null> {
    // Code-defined global/system skills have no editors at all.
    if (this.globalSId) {
      return null;
    }

    const grantGroup =
      await GroupPermissionResource.findRegularAutoGroupForGrant(auth, {
        grantType: SKILL_EDITOR_GRANT_TYPE,
        resourceType: "skill",
        resourceId: this.id,
      });

    return grantGroup ? grantGroup.getActiveMembers(auth) : [];
  }

  async upsertEditors(
    auth: Authenticator,
    users: UserResource[]
  ): Promise<Result<void, Error>> {
    if (users.length === 0) {
      return new Ok(undefined);
    }

    if (!this.canAdministrate(auth)) {
      return new Err(
        new Error("User is not authorized to update skill editors.")
      );
    }

    const existingEditors = await this.listEditors(auth);
    const existingEditorIds = new Set(existingEditors?.map((u) => u.id) ?? []);
    const usersToAdd = users.filter((u) => !existingEditorIds.has(u.id));

    if (usersToAdd.length === 0) {
      return new Ok(undefined);
    }

    const addResult = await this.addEditors(auth, usersToAdd);
    if (addResult.isErr()) {
      return new Err(new Error(addResult.error.message));
    }

    return new Ok(undefined);
  }

  /**
   * Adds editors: each user gets the skill's `editor` grant. Typed errors so callers can map them
   * (the editors endpoint turns them into status codes). Authorizes the caller; `upsertEditors` is
   * the wrapper that additionally skips users who are already editors.
   */
  async addEditors(
    auth: Authenticator,
    users: UserResource[]
  ): Promise<Result<undefined, DustError<"unauthorized" | "user_not_found">>> {
    if (users.length === 0) {
      return new Ok(undefined);
    }

    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "User is not authorized to update skill editors."
        )
      );
    }

    return this.writeEditorUserGrants(auth, users, "grant");
  }

  /**
   * Removes editors: each user loses the skill's `editor` grant. Like `addEditors`: authorizes the
   * caller, then surfaces typed errors for the caller to map.
   */
  async removeEditors(
    auth: Authenticator,
    users: UserResource[]
  ): Promise<Result<undefined, DustError<"unauthorized" | "user_not_found">>> {
    if (users.length === 0) {
      return new Ok(undefined);
    }

    if (!this.canAdministrate(auth)) {
      return new Err(
        new DustError(
          "unauthorized",
          "User is not authorized to update skill editors."
        )
      );
    }

    return this.writeEditorUserGrants(auth, users, "revoke");
  }

  // Editors are per-user grants: `grantToUser` holds them in one regular_auto group per skill, and
  // `revokeFromUser` deletes that group once its last member leaves.
  private async writeEditorUserGrants(
    auth: Authenticator,
    users: UserResource[],
    operation: "grant" | "revoke"
  ): Promise<Result<undefined, DustError<"unauthorized" | "user_not_found">>> {
    for (const user of users) {
      const spec = {
        user: user.toJSON(),
        grantType: SKILL_EDITOR_GRANT_TYPE,
        resourceType: "skill" as const,
        resourceId: this.id,
      };

      const result =
        operation === "grant"
          ? await GroupPermissionResource.grantToUser(auth, spec)
          : await GroupPermissionResource.revokeFromUser(auth, spec);

      if (result.isErr()) {
        return new Err(new DustError("user_not_found", result.error.message));
      }
    }

    return new Ok(undefined);
  }

  private async upsertCurrentUserAsEditor(auth: Authenticator): Promise<void> {
    const user = auth.user();
    if (!user) {
      return;
    }

    await this.upsertEditors(auth, [user]);
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

  /**
   * Batch version of listActiveAgents, returns active agents grouped by skill sId.
   */
  private static async batchListActiveAgents(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, AgentConfigurationModel[]>> {
    if (skills.length === 0) {
      return new Map();
    }

    const workspace = auth.getNonNullableWorkspace();

    // Separate custom skills from global skills.
    const customSkillIds = removeNulls(
      skills.map((s) => (s.globalSId ? null : s.id))
    );
    const globalSkillIds = removeNulls(skills.map((s) => s.globalSId));

    // Single query: all agent-skill associations for the given skills.
    const agentSkills = await AgentSkillModel.findAll({
      where: {
        workspaceId: workspace.id,
        [Op.or]: removeNulls([
          customSkillIds.length > 0
            ? { customSkillId: { [Op.in]: customSkillIds } }
            : null,
          globalSkillIds.length > 0
            ? { globalSkillId: { [Op.in]: globalSkillIds } }
            : null,
        ]),
      },
    });

    if (agentSkills.length === 0) {
      return new Map();
    }

    // Single query: all referenced agent configurations.
    const uniqueAgentConfigIds = [
      ...new Set(agentSkills.map((as) => as.agentConfigurationId)),
    ];
    const agentConfigs = await AgentConfigurationModel.findAll({
      where: {
        id: { [Op.in]: uniqueAgentConfigIds },
        workspaceId: workspace.id,
        status: "active",
      },
    });

    const agentConfigById = new Map(agentConfigs.map((a) => [a.id, a]));

    // Map AgentSkillModel references back to skill sId.
    const sIdByCustomId = new Map(
      skills.filter((s) => !s.globalSId).map((s) => [s.id, s.sId])
    );

    const result = new Map<string, AgentConfigurationModel[]>();
    for (const as of agentSkills) {
      const skillId = as.customSkillId
        ? sIdByCustomId.get(as.customSkillId)
        : (as.globalSkillId ?? undefined);
      if (!skillId) {
        continue;
      }
      const agent = agentConfigById.get(as.agentConfigurationId);
      if (!agent) {
        continue;
      }
      const list = result.get(skillId) ?? [];
      list.push(agent);
      result.set(skillId, list);
    }

    return result;
  }

  /**
   * Batch fetch usage (agents using each skill) for multiple skills.
   * Keyed by skill sId to avoid collisions (global skills share id: -1).
   */
  static async batchFetchUsage(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, AgentsUsageType>> {
    const agentsBySkillId = await this.batchListActiveAgents(auth, skills);

    const result = new Map<string, AgentsUsageType>();
    for (const skill of skills) {
      const agents = (agentsBySkillId.get(skill.sId) ?? [])
        .map((agent) => ({
          sId: agent.sId,
          name: agent.name,
          pictureUrl: agent.pictureUrl,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      result.set(skill.sId, { count: agents.length, agents });
    }

    return result;
  }

  /**
   * Count distinct agent messages using each skill, keyed by skill sId.
   */
  static async batchFetchMessageCounts(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, number>> {
    if (skills.length === 0) {
      return new Map();
    }

    const workspace = auth.getNonNullableWorkspace();
    const customSkillIdByModelId = new Map(
      skills
        .filter((skill) => !skill.globalSId)
        .map((skill) => [skill.id, skill.sId])
    );
    const globalSkillIds = removeNulls(skills.map((skill) => skill.globalSId));

    const counts = await AgentMessageSkillModel.count({
      attributes: ["customSkillId", "globalSkillId"],
      // Finalization activities can retry after the snapshot insert succeeds.
      distinct: true,
      col: "agentMessageId",
      where: {
        workspaceId: workspace.id,
        [Op.or]: removeNulls([
          customSkillIdByModelId.size > 0
            ? {
                customSkillId: {
                  [Op.in]: [...customSkillIdByModelId.keys()],
                },
              }
            : null,
          globalSkillIds.length > 0
            ? { globalSkillId: { [Op.in]: globalSkillIds } }
            : null,
        ]),
      },
      group: ["customSkillId", "globalSkillId"],
    });

    const result = new Map<string, number>();
    for (const row of counts) {
      let skillId: string | undefined;
      if (isNumber(row.customSkillId)) {
        skillId = customSkillIdByModelId.get(row.customSkillId);
      } else if (isString(row.globalSkillId)) {
        skillId = row.globalSkillId;
      }
      if (skillId) {
        result.set(skillId, row.count);
      }
    }

    return result;
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

  /**
   * Batch list editors for multiple skills. Keyed by skill sId. The batched counterpart of
   * `listEditors` — see it for why editors are only ever read through these two methods.
   */
  static async batchListEditors(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, UserResource[] | null>> {
    const result = new Map<string, UserResource[] | null>(
      skills.map((s) => [s.sId, null])
    );

    // Code-defined global/system skills have no editors — see `listEditors`.
    const customSkills = skills.filter((s) => !s.globalSId);

    if (customSkills.length === 0) {
      return result;
    }

    // Editors come from the per-user grants: one regular_auto group per skill — see `listEditors`.
    const editorGrantSpec = (skill: SkillResource) => ({
      grantType: SKILL_EDITOR_GRANT_TYPE,
      resourceType: "skill" as const,
      resourceId: skill.id,
    });

    const groupByGrant =
      await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
        grants: customSkills.map(editorGrantSpec),
      });

    const groupBySkillModelId = new Map<ModelId, GroupResource>(
      removeNulls(
        customSkills.map((skill) => {
          const group = groupByGrant.get(grantKey(editorGrantSpec(skill)));

          return group ? ([skill.id, group] as const) : null;
        })
      )
    );

    const membershipsByGroupId =
      await GroupResource.getActiveMembershipsForGroups(auth, [
        ...groupBySkillModelId.values(),
      ]);

    const allUserIds = [...new Set(Object.values(membershipsByGroupId).flat())];

    if (allUserIds.length === 0) {
      return result;
    }

    const allUsers = await UserResource.fetchByModelIds(allUserIds);

    // Filter to only keep users with an active workspace membership,
    // matching the behavior of getActiveMembers.
    const workspace = auth.getNonNullableWorkspace();
    const { memberships: workspaceMemberships } =
      await MembershipResource.getActiveMemberships({
        users: allUsers,
        workspace,
      });
    const activeWorkspaceUserIds = new Set(
      workspaceMemberships.map((m) => m.userId)
    );

    const userById = new Map(
      allUsers
        .filter((u) => activeWorkspaceUserIds.has(u.id))
        .map((u) => [u.id, u])
    );

    for (const skill of customSkills) {
      const group = groupBySkillModelId.get(skill.id);
      const userIds = group ? (membershipsByGroupId[group.id] ?? []) : [];
      const users = removeNulls(userIds.map((id) => userById.get(id) ?? null));
      result.set(skill.sId, users);
    }

    return result;
  }

  /**
   * Batch fetch edited-by users for multiple skills.
   */
  static async batchFetchEditedByUsers(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, UserResource | null>> {
    const result = new Map<string, UserResource | null>(
      skills.map((s) => [s.sId, null])
    );

    const uniqueEditedByIds = [
      ...new Set(removeNulls(skills.map((s) => s.editedBy))),
    ];

    if (uniqueEditedByIds.length === 0) {
      return result;
    }

    // Single query: fetch all edited-by users.
    const editedByUsers = await UserResource.fetchByModelIds(uniqueEditedByIds);

    // Batch privacy filter: keep only users visible to the auth user.
    const visibleUsers = await filterUsersWithSharedMembership(
      auth,
      editedByUsers
    );
    const visibleUserIds = new Set(visibleUsers.map((u) => u.id));
    const userById = new Map(visibleUsers.map((u) => [u.id, u]));

    for (const skill of skills) {
      if (skill.editedBy !== null && visibleUserIds.has(skill.editedBy)) {
        result.set(skill.sId, userById.get(skill.editedBy) ?? null);
      }
    }

    return result;
  }

  async archive(auth: Authenticator): Promise<{ affectedCount: number }> {
    assert(
      this.canAdministrate(auth),
      "User is not authorized to archive this skill"
    );

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
          "long"
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
      }

      return count;
    });

    return { affectedCount };
  }

  async restore(auth: Authenticator): Promise<{ affectedCount: number }> {
    assert(
      this.canAdministrate(auth),
      "User is not authorized to restore this skill"
    );

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
      availability,
      fileAttachments,
      icon,
      instructions,
      instructionsHtml,
      mcpServerViews,
      manuallyRequestedSpaceIds,
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
      availability?: SkillAvailability;
      fileAttachments?: FileResource[];
      icon: string | null;
      instructions: string;
      instructionsHtml?: string | null;
      // The spaces a person picked by hand: the subset of `requestedSpaceIds` that stays when
      // nothing in the skill requires it any more.
      manuallyRequestedSpaceIds: ModelId[];
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

    const availabilityChanged =
      availability !== undefined && availability !== this.availability;

    // Changing the availability requires the workspace-level publish
    // permission — even for editors.
    if (availabilityChanged) {
      assert(
        await auth.hasWorkspacePermission("publish", "skill"),
        "User is not authorized to update this skill's availability"
      );
    }

    // Making a skill auto-discoverable, or changing an already auto-discoverable skill's
    // availability, additionally requires the make-discoverable permission.
    if (
      availabilityChanged &&
      (availability === "users_and_agents" ||
        this.availability === "users_and_agents")
    ) {
      assert(
        await auth.hasWorkspacePermission("make_discoverable", "skill"),
        "User is not authorized to update this skill's availability"
      );
    }

    // Snapshot the previous name and icon before updating to detect changes below.
    const previousName = this.name;
    const previousIcon = this.icon;
    const previousStatus = this.status;

    await withTransaction(async (transaction) => {
      // Save the current version before updating.
      await this.saveVersion(auth, { transaction });

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
          manuallyRequestedSpaceIds,
          editedBy,
          ...(status ? { status } : {}),
          ...(source ? { source } : {}),
          ...(sourceMetadata ? { sourceMetadata } : {}),
          ...(availability !== undefined ? { availability } : {}),
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

    if (fileAttachments) {
      await this.setFileAttachments(auth, fileAttachments);
    }

    await this.upsertCurrentUserAsEditor(auth);
  }

  /**
   * Update only the availability of the skill. Requires the workspace-level "publish"
   * permission on skills — being an editor is neither required nor sufficient. Does not
   * touch editedBy.
   */
  static async updateAvailabilities(
    auth: Authenticator,
    skills: SkillResource[],
    availability: SkillAvailability
  ): Promise<void> {
    assert(
      await auth.hasWorkspacePermission("publish", "skill"),
      "User is not authorized to update skill availability"
    );

    // Making skills auto-discoverable, or changing an already auto-discoverable skill's
    // availability, additionally requires the workspace-level make-discoverable permission.
    if (
      availability === "users_and_agents" ||
      skills.some((skill) => skill.availability === "users_and_agents")
    ) {
      assert(
        await auth.hasWorkspacePermission("make_discoverable", "skill"),
        "User is not authorized to update this skill availability"
      );
    }

    const changedSkills = skills.filter(
      (skill) => skill.availability !== availability
    );
    if (changedSkills.length === 0) {
      return;
    }

    const workspace = auth.getNonNullableWorkspace();
    const user = auth.user();

    await withTransaction(async (transaction) => {
      // Save the current version of each skill before updating.
      await this.bulkSaveVersions(auth, changedSkills, { transaction });

      await SkillConfigurationModel.update(
        {
          availability,
          // Publishing counts as an edit even when the caller is not an editor.
          ...(user ? { editedBy: user.id } : {}),
        },
        {
          where: {
            workspaceId: workspace.id,
            id: { [Op.in]: changedSkills.map((skill) => skill.id) },
          },
          transaction,
        }
      );
    });
  }

  /**
   * Rewrites inline references to this skill in every parent skill so their tag
   * availability reflects this skill's current status and requested spaces.
   */
  private async propagateReferenceUpdatesToParentSkills(
    auth: Authenticator,
    {
      icon,
      name,
      requestedSpaceIds,
      status,
    }: {
      icon: string | null;
      name: string;
      requestedSpaceIds: readonly ModelId[];
      status: SkillStatus;
    },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    const references = await SkillReferenceModel.findAll({
      where: {
        workspaceId: workspace.id,
        childCustomSkillId: this.id,
      },
      transaction,
    });

    const referencingSkillIds = uniq(
      references.map((reference) => reference.parentSkillId)
    );

    if (referencingSkillIds.length === 0) {
      return;
    }

    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(
      auth,
      transaction
    );
    const target = new Map<string, SkillReferenceTarget>([
      [
        this.sId,
        {
          icon,
          id: this.sId,
          name,
          requestedSpaceIds,
          status,
        },
      ],
    ]);

    const referencingSkills = await this.model.findAll({
      where: {
        workspaceId: workspace.id,
        id: referencingSkillIds,
      },
      transaction,
    });

    // Each update carries distinct instructions content so it cannot be
    // batched. Bounded by the number of skills referencing this one.
    for (const referencingSkill of referencingSkills) {
      const parentRequestedSpaceIds = uniq([
        ...referencingSkill.requestedSpaceIds,
        globalSpace.id,
      ]);
      const renamedInstructions = renameSkillReferencesInContent(
        referencingSkill.instructions,
        { skillId: this.sId, newName: name }
      );
      const renamedInstructionsHtml =
        referencingSkill.instructionsHtml != null
          ? renameSkillReferencesInContent(referencingSkill.instructionsHtml, {
              skillId: this.sId,
              newName: name,
            })
          : referencingSkill.instructionsHtml;
      const instructions = SkillResource.replaceSkillReferenceTags(
        renamedInstructions,
        target,
        parentRequestedSpaceIds
      );
      const instructionsHtml =
        renamedInstructionsHtml !== null
          ? SkillResource.replaceSkillReferenceTags(
              renamedInstructionsHtml,
              target,
              parentRequestedSpaceIds,
              { html: true }
            )
          : null;

      if (
        instructions === referencingSkill.instructions &&
        instructionsHtml === referencingSkill.instructionsHtml
      ) {
        continue;
      }

      await referencingSkill.update(
        { instructions, instructionsHtml },
        { transaction }
      );
    }
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

  /**
   * Sync the denormalized skill_references rows with the inline skill reference
   * tags found in the instructions (the source of truth). Deriving from the
   * instructions keeps the table consistent on every write path, including
   * restoring a previous version whose references differ from the current ones.
   */
  private async syncSkillReferences(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    // Self-references are intentionally kept (#26680 allows them).
    const referencedSkillIds = extractUniqueSkillReferenceIds(
      this.instructions
    );

    // Retrieve what we want the end state to be.
    const referencedCustomSkillIds = uniq(
      removeNulls(
        referencedSkillIds.map((sId) => {
          const parsed = getResourceNameAndIdFromSId(sId);

          return parsed?.resourceName === "skill" &&
            parsed.workspaceModelId === workspace.id
            ? parsed.resourceModelId
            : null;
        })
      )
    );
    const referencedGlobalSkillIds = uniq(
      referencedSkillIds.filter((sId) => !getResourceNameAndIdFromSId(sId))
    );

    const childSkills = await this.model.findAll({
      attributes: ["id"],
      where: {
        id: { [Op.in]: referencedCustomSkillIds },
        workspaceId: workspace.id,
      },
      transaction,
    });

    const desiredCustomSkillIds = new Set(childSkills.map((skill) => skill.id));
    const desiredGlobalSkillIds = new Set(referencedGlobalSkillIds);

    // Retrieve the current state.
    const existingReferences = await SkillReferenceModel.findAll({
      where: {
        workspaceId: workspace.id,
        parentSkillId: this.id,
      },
      transaction,
    });

    const existingCustomSkillIds = new Set(
      removeNulls(existingReferences.map((ref) => ref.childCustomSkillId))
    );
    const existingGlobalSkillIds = new Set(
      removeNulls(existingReferences.map((ref) => ref.childGlobalSkillId))
    );

    // Delete references that are in the current state but not the end state.
    const referencesToDelete = existingReferences.filter((ref) => {
      if (ref.childCustomSkillId !== null) {
        return !desiredCustomSkillIds.has(ref.childCustomSkillId);
      }

      if (ref.childGlobalSkillId !== null) {
        return !desiredGlobalSkillIds.has(ref.childGlobalSkillId);
      }

      return true;
    });

    if (referencesToDelete.length > 0) {
      await SkillReferenceModel.destroy({
        where: {
          id: { [Op.in]: referencesToDelete.map((ref) => ref.id) },
          workspaceId: workspace.id,
        },
        transaction,
      });
    }

    // Add references that are in the end state but not the current state.
    const referencesToCreate = [
      ...[...desiredCustomSkillIds]
        .filter((childSkillId) => !existingCustomSkillIds.has(childSkillId))
        .map((childSkillId) => ({
          workspaceId: workspace.id,
          parentSkillId: this.id,
          childCustomSkillId: childSkillId,
          childGlobalSkillId: null,
        })),
      ...[...desiredGlobalSkillIds]
        .filter((globalSkillId) => !existingGlobalSkillIds.has(globalSkillId))
        .map((globalSkillId) => ({
          workspaceId: workspace.id,
          parentSkillId: this.id,
          childCustomSkillId: null,
          childGlobalSkillId: globalSkillId,
        })),
    ];

    if (referencesToCreate.length > 0) {
      await SkillReferenceModel.bulkCreate(referencesToCreate, { transaction });
    }
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

  private async setFileAttachments(
    auth: Authenticator,
    fileAttachments: FileResource[]
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    const existingAttachments = await SkillFileAttachmentModel.findAll({
      where: {
        skillConfigurationId: this.id,
        workspaceId: workspace.id,
      },
    });

    const desiredFileModelIds = new Set(fileAttachments.map((f) => f.id));
    const existingFileModelIds = new Set(
      existingAttachments.map((a) => a.fileId)
    );

    // Remove join table rows for detached files (keep the files for version history).
    const toRemove = existingAttachments.filter(
      (a) => !desiredFileModelIds.has(a.fileId)
    );
    if (toRemove.length > 0) {
      await SkillFileAttachmentModel.destroy({
        where: {
          id: { [Op.in]: toRemove.map((a) => a.id) },
          workspaceId: workspace.id,
        },
      });
    }

    // Create new attachments.
    const toCreate = fileAttachments.filter(
      (f) => !existingFileModelIds.has(f.id)
    );
    if (toCreate.length > 0) {
      await SkillFileAttachmentModel.bulkCreate(
        toCreate.map((file) => ({
          workspaceId: workspace.id,
          skillConfigurationId: this.id,
          fileId: file.id,
          fileName: file.fileName,
        }))
      );
    }

    // Update instance to avoid stale data.
    this.fileAttachments = fileAttachments;
  }

  async delete(auth: Authenticator): Promise<Result<number, Error>> {
    try {
      assert(
        this.canAdministrate(auth),
        "User does not have permission to delete this skill."
      );

      const workspace = auth.getNonNullableWorkspace();

      const whereWorkspaceIdAndSkillId = {
        skillConfigurationId: this.id,
        workspaceId: workspace.id,
      };

      // Collect file IDs from current attachments and all version snapshots.
      const fileAttachmentRows = await SkillFileAttachmentModel.findAll({
        where: whereWorkspaceIdAndSkillId,
      });
      const currentFileIds = fileAttachmentRows.map((a) => a.fileId);

      const versionRows = await SkillVersionModel.findAll({
        where: whereWorkspaceIdAndSkillId,
        attributes: ["fileAttachmentIds"],
      });
      const versionFileIds = versionRows.flatMap((v) => v.fileAttachmentIds);

      const allFileIds = [...new Set([...currentFileIds, ...versionFileIds])];
      const filesToDelete = await FileResource.fetchByModelIdsWithAuth(
        auth,
        allFileIds
      );

      const affectedCount = await withTransaction(async (transaction) => {
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

        // Delete agent-skill associations.
        await AgentSkillModel.destroy({
          where: {
            customSkillId: this.id,
            workspaceId: workspace.id,
          },
          transaction,
        });

        await ProjectMetadataResource.removeSkillFromAllDefaultSkills(
          auth,
          this.sId,
          transaction
        );

        // The per-user grant groups (see `writeEditorUserGrants`) exist only to hold this skill's
        // grants, so they go with the skill. Listed by resource rather than by grant so a skill
        // never leaves a grant group behind, and fetched before the grants are dropped, since the
        // grants are what identifies them.
        const grantGroups =
          await GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
            resourceType: "skill",
            resourceId: this.id,
            transaction,
          });

        // Drop the skill's instance grants before the groups go away: group_permissions rows are
        // keyed by both, and this also covers grants held by any other group.
        await GroupPermissionResource.deleteAllForResource(auth, {
          resourceType: "skill",
          resourceId: this.id,
          transaction,
        });

        for (const grantGroup of grantGroups) {
          await grantGroup.delete(auth, { transaction });
        }

        await SkillFileAttachmentModel.destroy({
          where: whereWorkspaceIdAndSkillId,
          transaction,
        });

        await SkillDataSourceConfigurationModel.destroy({
          where: whereWorkspaceIdAndSkillId,
          transaction,
        });

        await SkillMCPServerConfigurationModel.destroy({
          where: whereWorkspaceIdAndSkillId,
          transaction,
        });

        await SkillSuggestionModel.destroy({
          where: whereWorkspaceIdAndSkillId,
          transaction,
        });

        await SkillVersionModel.destroy({
          where: whereWorkspaceIdAndSkillId,
          transaction,
        });

        await SkillReferenceModel.destroy({
          where: {
            workspaceId: workspace.id,
            parentSkillId: this.id,
          },
          transaction,
        });

        await SkillReferenceModel.destroy({
          where: {
            workspaceId: workspace.id,
            childCustomSkillId: this.id,
          },
          transaction,
        });

        return this.model.destroy({
          where: {
            id: this.id,
            workspaceId: workspace.id,
          },
          transaction,
        });
      });

      // Delete files from cloud storage outside the transaction (I/O with GCS).
      for (const file of filesToDelete) {
        const res = await file.delete(auth);
        if (res.isErr()) {
          return res;
        }
      }

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

  static async addManyToAgent(
    auth: Authenticator,
    {
      agentConfiguration,
      skills,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      skills: SkillResource[];
    }
  ): Promise<void> {
    if (skills.length === 0) {
      return;
    }

    const workspace = auth.getNonNullableWorkspace();

    await AgentSkillModel.bulkCreate(
      skills.map((skill) => ({
        ...skill.skillReference,
        workspaceId: workspace.id,
        agentConfigurationId: agentConfiguration.id,
      }))
    );
  }

  async enableForAgent(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
    }: {
      agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
      conversation: ConversationType;
    }
  ): Promise<{ wasAlreadyEnabled: boolean }> {
    const workspace = auth.getNonNullableWorkspace();

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
      return { wasAlreadyEnabled: true };
    }

    await ConversationSkillModel.create(conversationSkillBlob);

    // Append the skill's space requirements to the conversation so access is gated on those
    // spaces (no-op for project conversations).
    await updateConversationRequirementsForSkills(auth, {
      skills: [this],
      conversation,
    });

    return { wasAlreadyEnabled: false };
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
    agentMessageId: ModelId,
    { withToolMetadata = false }: { withToolMetadata?: boolean } = {}
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
      withToolMetadata,
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

  static async listAgentMessageSkillsByCustomSkills(
    auth: Authenticator,
    customSkills: SkillResource[]
  ): Promise<
    {
      skill: SkillResource;
      conversationModelId: ModelId;
      agentConfigurationId: string | null;
      createdAt: Date;
    }[]
  > {
    if (customSkills.length === 0) {
      return [];
    }

    const workspace = auth.getNonNullableWorkspace();

    const skillsById = new Map(customSkills.map((s) => [s.id, s]));

    const records = await AgentMessageSkillModel.findAll({
      attributes: [
        "createdAt",
        "conversationId",
        "customSkillId",
        "agentConfigurationId",
      ],
      where: {
        workspaceId: workspace.id,
        customSkillId: {
          [Op.ne]: null,
          [Op.in]: [...skillsById.keys()],
        },
      },
    });

    return removeNulls(
      records.map((r) => {
        if (r.customSkillId === null) {
          return null;
        }
        const skill = skillsById.get(r.customSkillId);
        if (!skill) {
          return null;
        }
        return {
          skill,
          conversationModelId: r.conversationId,
          agentConfigurationId: r.agentConfigurationId,
          createdAt: r.createdAt,
        };
      })
    );
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<void> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    await AgentSkillModel.destroy({
      where: { workspaceId },
    });

    // Delete the editor grants and the regular_auto groups holding them: those groups exist only
    // to carry a skill's grant, so they go with the skills.
    const skills = await SkillConfigurationModel.findAll({
      attributes: ["id"],
      where: { workspaceId },
    });
    const grantGroups =
      await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
        grants: skills.map((skill) => ({
          grantType: SKILL_EDITOR_GRANT_TYPE,
          resourceType: "skill" as const,
          resourceId: skill.id,
        })),
      });

    for (const skill of skills) {
      await GroupPermissionResource.deleteAllForResource(auth, {
        resourceType: "skill",
        resourceId: skill.id,
      });
    }

    for (const grantGroup of grantGroups.values()) {
      await grantGroup.delete(auth);
    }

    // Delete file attachments and their underlying files.
    const fileAttachments = await SkillFileAttachmentModel.findAll({
      where: { workspaceId },
    });
    if (fileAttachments.length > 0) {
      const filesToDelete = await FileResource.fetchByModelIdsWithAuth(
        auth,
        fileAttachments.map((a) => a.fileId)
      );
      await SkillFileAttachmentModel.destroy({
        where: { workspaceId },
      });
      for (const file of filesToDelete) {
        const res = await file.delete(auth);
        if (res.isErr()) {
          throw res.error;
        }
      }
    }

    await SkillDataSourceConfigurationModel.destroy({
      where: { workspaceId },
    });

    await SkillMCPServerConfigurationModel.destroy({
      where: { workspaceId },
    });

    await SkillSuggestionModel.destroy({
      where: { workspaceId },
    });

    await SkillVersionModel.destroy({
      where: { workspaceId },
    });

    await AgentMessageSkillModel.destroy({
      where: { workspaceId },
    });

    await ConversationSkillModel.destroy({
      where: { workspaceId },
    });

    await SkillReferenceModel.destroy({
      where: { workspaceId },
    });

    await this.model.destroy({
      where: { workspaceId },
    });
  }

  private static replaceSkillReferenceTags(
    content: string,
    targets: ReadonlyMap<string, SkillReferenceTarget>,
    parentRequestedSpaceIds: readonly ModelId[],
    { html = false }: ReplaceSkillReferenceTagsOptions = {}
  ): string {
    if (targets.size === 0) {
      return content;
    }

    const parentRequestedSpaceIdsSet = new Set(parentRequestedSpaceIds);

    return content.replace(SKILL_REFERENCE_TAG_REGEX, (tag) => {
      const skill = parseSkillReferenceTag(tag);
      const target = skill ? targets.get(skill.id) : undefined;

      if (!target) {
        return tag;
      }

      const isAvailable =
        target.status === "active" &&
        target.requestedSpaceIds.every((spaceId) =>
          parentRequestedSpaceIdsSet.has(spaceId)
        );

      if (!isAvailable) {
        return serializeUnavailableSkillTag({ id: target.id }, { html });
      }

      return serializeSkillTag(
        {
          icon: target.icon,
          id: target.id,
          name: target.name,
        },
        { html }
      );
    });
  }

  private async normalizeSkillReferenceTags(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    const customSkillIdByModelId = new Map<ModelId, string>(
      removeNulls(
        extractUniqueSkillReferenceIds(this.instructions).map((skillId) => {
          const modelId = isResourceSId("skill", skillId)
            ? getResourceIdFromSId(skillId)
            : null;

          return modelId ? [modelId, skillId] : null;
        })
      )
    );

    if (customSkillIdByModelId.size === 0) {
      return;
    }

    const customSkills = await SkillConfigurationModel.findAll({
      where: {
        id: [...customSkillIdByModelId.keys()],
        workspaceId: workspace.id,
      },
      attributes: ["id", "icon", "name", "requestedSpaceIds", "status"],
      transaction,
    });
    const targets = new Map<string, SkillReferenceTarget>(
      removeNulls(
        customSkills.map((skill) => {
          const sId = customSkillIdByModelId.get(skill.id);

          return sId
            ? [
                sId,
                {
                  icon: skill.icon,
                  id: sId,
                  name: skill.name,
                  requestedSpaceIds: skill.requestedSpaceIds,
                  status: skill.status,
                },
              ]
            : null;
        })
      )
    );
    for (const skillId of customSkillIdByModelId.values()) {
      if (!targets.has(skillId)) {
        targets.set(skillId, {
          icon: null,
          id: skillId,
          name: "",
          requestedSpaceIds: [],
          status: "archived",
        });
      }
    }

    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(
      auth,
      transaction
    );
    const parentRequestedSpaceIds = uniq([
      ...this.requestedSpaceIds,
      globalSpace.id,
    ]);

    const instructions = SkillResource.replaceSkillReferenceTags(
      this.instructions,
      targets,
      parentRequestedSpaceIds
    );
    const instructionsHtml =
      this.instructionsHtml !== null
        ? SkillResource.replaceSkillReferenceTags(
            this.instructionsHtml,
            targets,
            parentRequestedSpaceIds,
            { html: true }
          )
        : null;

    if (
      instructions !== this.instructions ||
      instructionsHtml !== this.instructionsHtml
    ) {
      await this.update({ instructions, instructionsHtml }, transaction);
    }
  }

  toJSON(auth: Authenticator): SkillType {
    const toSpaceId = (spaceId: ModelId) =>
      SpaceResource.modelIdToSId({
        id: spaceId,
        workspaceId: this.workspaceId,
      });

    const requestedSpaceIds = this.requestedSpaceIds.map(toSpaceId);
    const manuallyRequestedSpaceIds =
      this.manuallyRequestedSpaceIds.map(toSpaceId);

    // Code-defined (global) skills hide their instructions from the front-end by
    // default; a skill opts in via `exposeInstructions` in its definition (e.g.
    // docs/pptx/xlsx) so builders can read and build on top of it. System skills
    // and the rest stay opaque. Custom skills always expose their own
    // instructions. The list endpoints strip instructions/tools regardless, and
    // the public v1 API only returns custom skills, so this only surfaces on the
    // single-skill detail fetch.
    const hideInstructions =
      (this.globalSId !== null && !this.exposeInstructions) ||
      this.redactedForCaller;

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
      instructions: hideInstructions ? null : this.instructions,
      instructionsHtml: hideInstructions ? null : this.instructionsHtml,
      requestedSpaceIds,
      manuallyRequestedSpaceIds,
      icon: this.icon ?? null,
      reinforcement: this.reinforcement,
      lastReinforcementAnalysisAt:
        this.lastReinforcementAnalysisAt?.toISOString() ?? null,
      selfImprovementLock: this.selfImprovementLock,
      selfImprovementCostsCapMicroUsd: this.selfImprovementCostsCapMicroUsd,
      selfImprovementCostsCapAwuCredits: this.selfImprovementCostsCapAwuCredits,
      source: this.source,
      sourceMetadata: this.sourceMetadata,
      tools: (this.redactedForCaller ? [] : this.mcpServerViews).map((view) => {
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
      fileAttachments: (this.redactedForCaller ? [] : this.fileAttachments).map(
        (file) => ({
          fileId: file.sId,
          fileName: file.fileName,
        })
      ),
      canRead: this.canRead(auth),
      canWrite: this.canWrite(auth),
      canAdministrate: this.canAdministrate(auth),
      isDefault: isDefaultFromAvailability(this.availability),
      availability: this.availability,
    };
  }

  private async saveVersion(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    await SkillResource.bulkSaveVersions(auth, [this], { transaction });
  }

  /**
   * Snapshot the current state of several skills as new version entries, with batched
   * queries (one per satellite table) instead of per-skill round trips.
   */
  private static async bulkSaveVersions(
    auth: Authenticator,
    skills: SkillResource[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    const skillIds = skills.map((skill) => skill.id);

    // Fetch current MCP server configuration IDs for all skills.
    const mcpServerConfigurations =
      await SkillMCPServerConfigurationModel.findAll({
        where: {
          workspaceId: workspace.id,
          skillConfigurationId: { [Op.in]: skillIds },
        },
        transaction,
      });
    const mcpServerConfigsBySkillId = groupBy(
      mcpServerConfigurations,
      "skillConfigurationId"
    );

    // Fetch current file attachment IDs for all skills.
    const fileAttachments = await SkillFileAttachmentModel.findAll({
      where: {
        workspaceId: workspace.id,
        skillConfigurationId: { [Op.in]: skillIds },
      },
      transaction,
    });
    const fileAttachmentsBySkillId = groupBy(
      fileAttachments,
      "skillConfigurationId"
    );

    // Compute the next version number per skill. Only (skillConfigurationId, version)
    // pairs are loaded; skills have a bounded number of versions.
    const versionWhere: WhereOptions<SkillVersionModel> = {
      workspaceId: workspace.id,
      skillConfigurationId: { [Op.in]: skillIds },
    };
    const versionRows = await SkillVersionModel.findAll({
      attributes: ["skillConfigurationId", "version"],
      where: versionWhere,
      transaction,
    });
    const maxVersionBySkillId = new Map<ModelId, number>();
    for (const row of versionRows) {
      const currentMax = maxVersionBySkillId.get(row.skillConfigurationId) ?? 0;
      if (row.version > currentMax) {
        maxVersionBySkillId.set(row.skillConfigurationId, row.version);
      }
    }

    // Create the new version entries with the current state of each skill.
    const versionData: SkillVersionCreationAttributes[] = skills.map(
      (skill) => ({
        workspaceId: skill.workspaceId,
        skillConfigurationId: skill.id,
        version: (maxVersionBySkillId.get(skill.id) ?? 0) + 1,
        status: skill.status,
        name: skill.name,
        agentFacingDescription: skill.agentFacingDescription,
        userFacingDescription: skill.userFacingDescription,
        instructions: skill.instructions,
        instructionsHtml: skill.instructionsHtml,
        requestedSpaceIds: skill.requestedSpaceIds,
        manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
        editedBy: skill.editedBy,
        mcpServerViewIds: (mcpServerConfigsBySkillId[skill.id] ?? []).map(
          (config) => config.mcpServerViewId
        ),
        fileAttachmentIds: (fileAttachmentsBySkillId[skill.id] ?? []).map(
          (attachment) => attachment.fileId
        ),
        source: skill.source,
        sourceMetadata: skill.sourceMetadata,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
        availability: skill.availability,
      })
    );

    await SkillVersionModel.bulkCreate(versionData, {
      transaction,
    });
  }
}
