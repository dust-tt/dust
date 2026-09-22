import { SkillNameSchema } from "@app/lib/api/skills/schemas";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
  SkillFileAttachmentModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { canReadRequestedSpaces } from "@app/lib/resources/permission_utils";
import { GLOBAL_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/global";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import type { CodeDefinedSkillFile } from "@app/lib/resources/skill/code_defined/shared";
import { SYSTEM_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/system";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import * as skillAgents from "@app/lib/resources/skill/skill_agents";
import * as skillAttachments from "@app/lib/resources/skill/skill_attachments";
import * as skillConversations from "@app/lib/resources/skill/skill_conversations";
import * as skillDeletion from "@app/lib/resources/skill/skill_deletion";
import * as skillEditors from "@app/lib/resources/skill/skill_editors";
import * as skillHydration from "@app/lib/resources/skill/skill_hydration";
import * as skillQueries from "@app/lib/resources/skill/skill_queries";
import * as skillReferences from "@app/lib/resources/skill/skill_references";
import * as skillVersions from "@app/lib/resources/skill/skill_versions";
import type {
  SkillAttachedKnowledge,
  SkillConfigurationFindOptions,
  SkillFetchContext,
  SkillHydrationOptions,
  SkillMCPServerConfiguration,
  SkillPermissionFilteringMode,
  SkillResourceConstructorOptions,
} from "@app/lib/resources/skill/types";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { makeSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import { CODE_DEFINED_SKILLS_WORKSPACE_ID } from "@app/lib/skill_search/constants";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import type {
  AgentConfigurationWithoutModelType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type {
  ConversationType,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type {
  AgentSkillType,
  SkillAvailability,
  SkillReinforcementMode,
  SkillSourceMetadata,
  SkillSourceType,
  SkillStatus,
  SkillType,
  UsedBySkillType,
} from "@app/types/assistant/skill_configuration";
import { isDefaultFromAvailability } from "@app/types/assistant/skill_configuration";
import { SKILL_NAME_MAX_LENGTH } from "@app/types/assistant/skill_configuration_constants";
import type { AgentsUsageType } from "@app/types/data_source";
import type { GrantVerb } from "@app/types/group_permissions";
import type { RoleGrant } from "@app/types/resource_permissions";
import { verbsFromRoleGrants } from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import uniq from "lodash/uniq";
import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";
import { Op } from "sequelize";

export type {
  SkillAttachedKnowledge,
  SkillFetchContext,
  SkillMCPServerConfiguration,
  SkillPermissionFilteringMode,
} from "@app/lib/resources/skill/types";

const SKILL_SEARCH_INDEXATION_CONCURRENCY = 8;

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SkillResource
  extends ReadonlyAttributesType<SkillConfigurationModel> {}

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
];

/**
 * One resource class for custom, global and system skills. Construction, permissions,
 * serialization and mutation orchestration live here; the sibling helper modules implement
 * fetching, hydration, relationships, attachments, editors, versioning and deletion.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
/**
 * @cc [owner:fabiencelier,label:security;product] skill-verbs
 * The verbs a caller holds on a skill mean:
 * - `read`: seeing and using the skill: listing it, fetching it, attaching it to an agent, running
 *   it. Outside the explicit `admin_can_see_private_entities` admin override, fetching a custom
 *   skill as readable MUST also require `read` on every space in its `requestedSpaceIds`. Its
 *   `availability` MUST NOT affect this decision. `read` comes from grants (the workspace global
 *   group's `reader` grant, or an editor's grant), never from a workspace role.
 * - `write`: editing the skill's content: instructions, attached knowledge, files.
 * - `admin`: the skill's lifecycle and editors: adding and removing editors, archiving,
 *   restoring, deleting. The admin workspace role confers `admin` and MUST NOT confer `write`:
 *   an admin who is not an editor manages editors without editing content.
 * An admin may explicitly fetch a skill it cannot read through the redaction path. That path may
 * expose public metadata such as its name and descriptions, but MUST hide instructions, tools and
 * files. The admin override above may expose them in full.
 * Global (code-defined) skills are `read`-only for every workspace member.
 */
/**
 * @cc [owner:fabiencelier,label:security;product] skill-create-capability
 * `create` on the `skill` type means bringing a new skill into the workspace: creating one,
 * importing one (zip, GitHub) or detecting one from files. Every such path MUST require
 * `hasWorkspacePermission("create", "skill")`. Editing an existing skill MUST NOT.
 */
/**
 * @cc [owner:fabiencelier,label:security;product] skill-publish-capability
 * `publish` on the `skill` type means deciding who the skill is available to. Any change of a
 * skill's `availability` (`editors`, `workspace_users`, `users_and_agents`), including creating a
 * skill with a non-default availability, MUST require `hasWorkspacePermission("publish", "skill")`,
 * even for the skill's editors.
 */
/**
 * @cc [owner:fabiencelier,label:security;product] skill-make-discoverable-capability
 * `make_discoverable` on the `skill` type means letting agents pick the skill on their own. Setting
 * a skill's availability to `users_and_agents`, or moving it off that value, MUST require
 * `hasWorkspacePermission("make_discoverable", "skill")` on top of `publish`.
 */
/**
 * @cc [owner:aubin-tchoi,label:backend;security] skill-stored-global-space
 * Production callers creating skills or recomputing requestedSpaceIds must include the
 * workspace's global space exactly once. Other update callers must preserve the stored IDs.
 */
/**
 * @cc [owner:aubin-tchoi,label:architecture] skill-resource-entry-point
 * Callers outside this directory must access skills through SkillResource, not its helper
 * modules. Custom, code-defined and historical skills must remain instances of this class.
 */
export class SkillResource extends BaseResource<SkillConfigurationModel> {
  static model: ModelStatic<SkillConfigurationModel> = SkillConfigurationModel;

  readonly dataSourceConfigurations: SkillDataSourceConfigurationModel[];
  private fileAttachments: FileResource[];
  private readonly codeDefinedFiles: readonly CodeDefinedSkillFile[];
  readonly version: number | null = null;

  private readonly codeDefinedSkillId: string | null;
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
      codeDefinedSkillId,
      dataSourceConfigurations,
      exposeInstructions,
      fileAttachments,
      files,
      mcpServerConfigurations,
      version,
    }: SkillResourceConstructorOptions
  ) {
    super(SkillConfigurationModel, blob);

    this.dataSourceConfigurations = dataSourceConfigurations;
    this.exposeInstructions = exposeInstructions ?? false;
    this.fileAttachments = fileAttachments ?? [];
    this.codeDefinedFiles = files ?? [];
    this.codeDefinedSkillId = codeDefinedSkillId ?? null;
    this._mcpServerConfigurations = mcpServerConfigurations;
    this.version = version ?? null;
  }

  get sId(): string {
    if (this.codeDefinedSkillId) {
      return this.codeDefinedSkillId;
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
    return skillAttachments.getAttachedKnowledge(this, auth);
  }

  /**
   * @cc [owner:matteotrab,label:security;product] requested-spaces-cover-every-requirement
   * The result MUST hold every space the skill needs to function: the spaces of its tools and
   * attached knowledge, the spaces requested by the skills its instructions reference, the
   * hand-picked ones, and the global space.
   */
  static async computeRequestedSpaceIds(
    auth: Authenticator,
    params: {
      attachedKnowledge: SkillAttachedKnowledge[];
      excludedSkillId?: string;
      instructions: string;
      manuallyRequestedSpaceIds: ModelId[];
      mcpServerViews: MCPServerViewResource[];
    }
  ): Promise<ModelId[]> {
    return skillAttachments.computeRequestedSpaceIds(this, auth, params);
  }

  /**
   * The spaces requested by the active skills `instructions` reference. `excludedSkillId` is the
   * skill those instructions belong to: a reference back to it is skipped, since its own
   * requirements are what the caller is recomputing.
   */
  static async listReferencedSkillSpaceIds(
    auth: Authenticator,
    instructions: string,
    excludedSkillId?: string
  ): Promise<ModelId[]> {
    return skillReferences.listReferencedSkillSpaceIds(
      this,
      auth,
      instructions,
      excludedSkillId
    );
  }

  /**
   * The spaces `mcpServerViews` and `attachedKnowledge` live in.
   */
  static async computeToolAndKnowledgeSpaceIds(
    auth: Authenticator,
    params: {
      mcpServerViews: MCPServerViewResource[];
      attachedKnowledge: SkillAttachedKnowledge[];
    }
  ): Promise<ModelId[]> {
    return skillAttachments.computeToolAndKnowledgeSpaceIds(auth, params);
  }

  // Mirrors `SkillDefinition["kind"]` for code-defined skills; anything without a global sId is
  // authored in the workspace.
  get kind(): "custom" | "global" | "system" {
    if (!this.codeDefinedSkillId) {
      return "custom";
    }

    return this.isSystemSkill ? "system" : "global";
  }

  get isSystemSkill(): boolean {
    if (!this.codeDefinedSkillId) {
      return false;
    }

    return SystemSkillsRegistry.isSystemSkill(this.sId);
  }

  get inheritsAgentConfigurationDataSources(): boolean {
    if (!this.codeDefinedSkillId) {
      return false;
    }

    return (
      GlobalSkillsRegistry.doesSkillInheritAgentConfigurationDataSources(
        this.codeDefinedSkillId
      ) ||
      SystemSkillsRegistry.doesSkillInheritAgentConfigurationDataSources(
        this.codeDefinedSkillId
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
    SkillNameSchema.parse(blob.name);
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
    await this.launchSearchIndexation(auth, [skillResource.sId]);

    return skillResource;
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;concurrency] skill-search-after-commit
   * Skill mutations enqueue workspace-scoped custom IDs after their existing writes.
   * Failed workflow launch results are logged without failing the mutation.
   */
  static async launchSearchIndexation(
    auth: Authenticator,
    skillIds: string[]
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    if (skillIds.length === 0) {
      return;
    }
    const results = await concurrentExecutor(
      uniq(skillIds),
      (skillId) =>
        launchIndexSkillSearchWorkflow({ workspaceId: workspace.sId, skillId }),
      { concurrency: SKILL_SEARCH_INDEXATION_CONCURRENCY }
    );
    const failedResult = results.find((result) => result.isErr());
    if (failedResult?.isErr()) {
      logger.error(
        { error: failedResult.error, workspaceId: workspace.sId, skillIds },
        "Failed to launch skill search indexation"
      );
    }
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

    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    const createdSuggestedSkill = await this.makeNew(
      auth,
      {
        ...blob,
        status: "suggested",
        editedBy: null,
        requestedSpaceIds: [globalSpace.id],
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
    options: { transaction?: Transaction } = {}
  ): Promise<void> {
    return skillEditors.grantCreatorAsEditor(auth, skill, options);
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
    return skillHydration.baseFetch(
      this,
      (model, blob, options, redactedForCaller = false) => {
        const resource = new this(model, blob, options);
        resource.redactedForCaller = redactedForCaller;
        return resource;
      },
      this.filterReadable.bind(this),
      auth,
      options,
      context
    );
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
    return skillQueries.fetchFileSkills(this, auth, file);
  }

  static async fetchById(
    auth: Authenticator,
    sId: string,
    options: SkillFetchContext &
      SkillHydrationOptions & { onlyActive?: boolean } = {}
  ): Promise<SkillResource | null> {
    const [skill] = await this.fetchByIds(auth, [sId], options);

    return skill ?? null;
  }

  static async fetchByIds(
    auth: Authenticator,
    sIds: string[],
    options: SkillFetchContext &
      SkillHydrationOptions & { onlyActive?: boolean } = {}
  ): Promise<SkillResource[]> {
    return skillQueries.fetchByIds(
      this.baseFetch.bind(this),
      auth,
      sIds,
      options
    );
  }

  // Use fetchByIds to apply isRestricted checks, feature flags, user preferences,
  // etc. before including code-defined skill IDs in search.
  static async listAvailableCodeDefinedIds(
    auth: Authenticator
  ): Promise<string[]> {
    const skills = await this.fetchByIds(
      auth,
      [...GLOBAL_SKILLS_ARRAY, ...SYSTEM_SKILLS_ARRAY].map(
        (skill) => skill.sId
      ),
      {
        withInstructions: false,
        withTools: false,
        withFileAttachments: false,
      }
    );

    return skills.map((skill) => skill.sId);
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

  static async isNameTaken(
    auth: Authenticator,
    name: string,
    excludeSkillModelId?: ModelId
  ): Promise<boolean> {
    const count = await this.model.count({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        name,
        status: "active",
        ...(excludeSkillModelId !== undefined
          ? { id: { [Op.ne]: excludeSkillModelId } }
          : {}),
      },
    });

    return count > 0;
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
    return skillReferences.batchFetchChildSkills(
      this,
      this.fetchBySkillReferences.bind(this),
      auth,
      parentSkills
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
      effectiveSpaceIds,
      permissionFiltering,
      status,
      transaction,
      withInstructions,
      withTools,
      withToolMetadata,
      withFileAttachments,
    }: SkillHydrationOptions & {
      agentLoopData?: AgentLoopExecutionData;
      effectiveSpaceIds?: string[];
      permissionFiltering?: SkillPermissionFilteringMode;
      status?: SkillStatus | SkillStatus[];
      transaction?: Transaction;
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

  static async listFavoritesForCurrentUser(
    auth: Authenticator,
    context?: SkillFetchContext
  ): Promise<SkillResource[]> {
    return skillQueries.listFavoritesForCurrentUser(this, auth, context);
  }

  async isFavoriteForCurrentUser(auth: Authenticator): Promise<boolean> {
    return skillQueries.isFavoriteForCurrentUser(this, auth);
  }

  async setFavorite(
    auth: Authenticator,
    isFavorite: boolean
  ): Promise<Result<undefined, Error>> {
    return skillQueries.setFavorite(SkillResource, this, auth, isFavorite);
  }

  static async listByAgentConfiguration(
    auth: Authenticator,
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"],
    fetchContext: SkillFetchContext = {}
  ): Promise<SkillResource[]> {
    return skillAgents.listByAgentConfiguration(
      this,
      this.fetchBySkillReferences.bind(this),
      auth,
      agentConfiguration,
      fetchContext
    );
  }

  /**
   * Skills of a non-global agent addressed by its `agent_configurations` row model id, for callers
   * holding an agent's identity rather than a rendered configuration (see `AgentResource.listSkills`).
   */
  static async listByAgentConfigurationModelId(
    auth: Authenticator,
    agentConfigurationModelId: ModelId,
    options: SkillFetchContext = {}
  ): Promise<SkillResource[]> {
    return skillAgents.listByAgentConfigurationModelId(
      this.fetchBySkillReferences.bind(this),
      auth,
      agentConfigurationModelId,
      options
    );
  }

  /**
   * Batched version of listByAgentConfiguration. Performs 2 SQL queries.
   * Does not support global agents as we rely on the ID for mapping: they all share the same
   * model id and hold no `AgentSkillModel` row. Their skills are code-defined, so resolve them
   * with `fetchByIds` on the ids their configuration declares.
   */
  static async listByAgentConfigurations<T extends LightAgentConfigurationType>(
    auth: Authenticator,
    agentConfigurations: T[],
    fetchOptions?: SkillHydrationOptions
  ): Promise<{ agentConfiguration: T; skill: SkillResource }[]> {
    return skillAgents.listByAgentConfigurations(
      this.fetchBySkillReferences.bind(this),
      auth,
      agentConfigurations,
      fetchOptions
    );
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
    params: {
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
    return skillQueries.listByWorkspace(
      this.baseFetch.bind(this),
      auth,
      params
    );
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
    options: { status?: SkillStatus | SkillStatus[] } = {}
  ): Promise<SkillResource[]> {
    return skillQueries.listByMCPServerViewIds(
      this.baseFetch.bind(this),
      auth,
      mcpServerViewIds,
      options
    );
  }

  /**
   * List skills that use any of the given data source view IDs.
   * Used during space deletion to find skills that need to be updated.
   */
  static async listByDataSourceViewIds(
    auth: Authenticator,
    dataSourceViewIds: ModelId[],
    options: Pick<
      SkillConfigurationFindOptions,
      "withInstructions" | "withTools" | "withFileAttachments"
    > & { status?: SkillStatus | SkillStatus[] } = {}
  ): Promise<SkillResource[]> {
    return skillQueries.listByDataSourceViewIds(
      this.baseFetch.bind(this),
      auth,
      dataSourceViewIds,
      options
    );
  }

  /**
   * List skills that use any of the given data source IDs.
   */
  static async listByDataSourceIds(
    auth: Authenticator,
    dataSourceIds: ModelId[],
    options: Pick<
      SkillConfigurationFindOptions,
      "withInstructions" | "withTools" | "withFileAttachments"
    > = {}
  ): Promise<SkillResource[]> {
    return skillQueries.listByDataSourceIds(
      this.baseFetch.bind(this),
      auth,
      dataSourceIds,
      options
    );
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
    params: SkillFetchContext & {
      conversation: ConversationWithoutContentType | ConversationResource;
      agentConfiguration?: AgentConfigurationWithoutModelType;
      transaction?: Transaction;
    }
  ): Promise<SkillResource[]> {
    return skillConversations.listEnabledByConversation(
      this.fetchBySkillReferences.bind(this),
      auth,
      params
    );
  }

  static async listPodDefaultSkillsForConversation(
    auth: Authenticator,
    params: {
      conversation: ConversationWithoutContentType;
      agentLoopData?: AgentLoopExecutionData;
      effectiveSpaceIds: string[];
    }
  ): Promise<SkillResource[]> {
    return skillConversations.listPodDefaultSkillsForConversation(
      this,
      auth,
      params
    );
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
    return skillConversations.listForAgentLoop(
      this,
      this.fetchBySkillReferences.bind(this),
      auth,
      params
    );
  }

  async upsertToConversation(
    auth: Authenticator,
    params: {
      conversationId: ModelId;
      enabled: boolean;
    },
    options: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    return skillConversations.upsertToConversation(this, auth, params, options);
  }

  static async upsertConversationSkills(
    auth: Authenticator,
    params: {
      conversation: ConversationWithoutContentType;
      skills: SkillResource[];
      enabled: boolean;
    },
    options: { transaction?: Transaction } = {}
  ): Promise<Result<undefined, Error>> {
    return skillConversations.upsertConversationSkills(auth, params, options);
  }

  static async clearAllEnabledByConversation(
    auth: Authenticator,
    params: {
      conversation: ConversationWithoutContentType;
    },
    options: { transaction?: Transaction } = {}
  ): Promise<void> {
    return skillConversations.clearAllEnabledByConversation(
      auth,
      params,
      options
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
    // editors' own `editor` grant on this skill. `getGovernanceGrantVerbs` folds the type-wide
    // grants in.
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
   * @cc [owner:achilleburah,label:security] canAdministrateCustomSkillId-matches-canAdministrate
   * For a custom (never code-defined) skill, MUST return the same verdict as `canAdministrate`
   * would for the fetched `SkillResource` with this id, without fetching or hydrating the row.
   */
  static canAdministrateCustomSkillId(
    auth: Authenticator,
    { id, workspaceId }: { id: ModelId; workspaceId: ModelId }
  ): boolean {
    if (auth.isKey()) {
      return true;
    }

    return this.customSkillAllowedVerbs(auth, { id, workspaceId }).has("admin");
  }

  /**
   * The verbs the caller holds on this skill: the code role rules unioned with the caller's own
   * verbs resolved from its `group_permissions` grants — for skills, the per-user `editor` grants
   * held by the regular_auto group (see `grantToUser`).
   */
  getAllowedVerbs(auth: Authenticator): Set<GrantVerb> {
    // Global skills carry no row, so there is no grant to look up (and their synthetic `id` of -1
    // is the type-wide sentinel, which would resolve the workspace-wide capability grants instead).
    if (this.codeDefinedSkillId) {
      return new Set(
        verbsFromRoleGrants(auth, GLOBAL_SKILL_ROLE_GRANTS, this.workspaceId)
      );
    }

    return SkillResource.customSkillAllowedVerbs(auth, this);
  }

  // The verbs the caller holds on a custom skill, from its row: what `getAllowedVerbs` serves for a
  // fetched resource, and what `canReadRow` evaluates in the fetch path, which filters rows before
  // it has resources.
  private static customSkillAllowedVerbs(
    auth: Authenticator,
    skill: { id: ModelId; workspaceId: ModelId }
  ): Set<GrantVerb> {
    return new Set([
      ...auth.getGovernanceGrantVerbs("skill", skill.id, skill.workspaceId),
      ...verbsFromRoleGrants(auth, SKILL_ROLE_GRANTS, skill.workspaceId),
    ]);
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

    return this.customSkillAllowedVerbs(auth, skill).has("read");
  }

  async fetchUsage(auth: Authenticator): Promise<AgentsUsageType> {
    return skillAgents.fetchUsage(this, auth);
  }

  private async updateActiveAgentsRequirements(
    auth: Authenticator,
    params: {
      // The spaces the skill previously contributed before the change
      previousRequestedSpaceIds: ModelId[];
      // The spaces the skill contributes after the change. Defaults to the
      // skill's current `requestedSpaceIds`, but callers can override it (e.g.
      // archiving treats the skill as contributing no spaces).
      newRequestedSpaceIds?: ModelId[];
    },
    options: { transaction?: Transaction }
  ): Promise<void> {
    return skillAgents.updateActiveAgentsRequirements(
      SkillResource,
      this,
      auth,
      params,
      options
    );
  }

  async listVersions(
    auth: Authenticator
  ): Promise<(SkillResource & { version: number })[]> {
    return skillVersions.listVersions(
      this,
      (model, blob, options) => new SkillResource(model, blob, options),
      auth
    );
  }

  /**
   * The skill's editors: the members of the regular_auto group holding the skill's `editor` grant
   * (see `GroupPermissionResource.grantToUser`). Together with `batchListEditors`, the only place
   * editors are read from.
   *
   * Returns null for code-defined global/system skills, which have no editors.
   */
  async listEditors(auth: Authenticator): Promise<UserResource[] | null> {
    return skillEditors.listEditors(this, auth);
  }

  async upsertEditors(
    auth: Authenticator,
    users: UserResource[]
  ): Promise<Result<void, Error>> {
    return skillEditors.upsertEditors(this, auth, users);
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
    return skillEditors.addEditors(SkillResource, this, auth, users);
  }

  /**
   * Removes editors: each user loses the skill's `editor` grant. Like `addEditors`: authorizes the
   * caller, then surfaces typed errors for the caller to map.
   */
  async removeEditors(
    auth: Authenticator,
    users: UserResource[]
  ): Promise<Result<undefined, DustError<"unauthorized" | "user_not_found">>> {
    return skillEditors.removeEditors(SkillResource, this, auth, users);
  }

  private async upsertCurrentUserAsEditor(auth: Authenticator): Promise<void> {
    const user = auth.user();
    if (!user) {
      return;
    }

    await this.upsertEditors(auth, [user]);
  }

  async fetchEditedByUser(auth: Authenticator): Promise<UserResource | null> {
    return skillEditors.fetchEditedByUser(this, auth);
  }

  /**
   * Batch fetch usage (agents using each skill) for multiple skills.
   * Keyed by skill sId to avoid collisions (global skills share id: -1).
   */
  static async batchFetchUsage(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, AgentsUsageType>> {
    return skillAgents.batchFetchUsage(auth, skills);
  }

  /**
   * Batch fetch skill references for multiple child skills.
   * Keyed by child skill sId to avoid collisions with global skills.
   */
  static async batchFetchUsedBySkills(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, UsedBySkillType[]>> {
    return skillReferences.batchFetchUsedBySkills(this, auth, skills);
  }

  /**
   * Batch list editors for multiple skills. Keyed by skill sId. The batched counterpart of
   * `listEditors` — see it for why editors are only ever read through these two methods.
   */
  static async batchListEditors(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, UserResource[] | null>> {
    return skillEditors.batchListEditors(auth, skills);
  }

  /**
   * Batch fetch edited-by users for multiple skills.
   */
  static async batchFetchEditedByUsers(
    auth: Authenticator,
    skills: SkillResource[]
  ): Promise<Map<string, UserResource | null>> {
    return skillEditors.batchFetchEditedByUsers(auth, skills);
  }

  async archive(auth: Authenticator): Promise<{ affectedCount: number }> {
    assert(
      this.canAdministrate(auth),
      "User is not authorized to archive this skill"
    );

    const workspace = auth.getNonNullableWorkspace();

    const { affectedCount, referencingSkillIds, renamedSkillId } =
      await withTransaction(async (transaction) => {
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
          const suffix = ` (archived on ${timestamp}, ${SkillResource.modelIdToSId(existingArchivedSkill)})`;
          const name = existingArchivedSkill.name.slice(
            0,
            SKILL_NAME_MAX_LENGTH - suffix.length
          );
          await existingArchivedSkill.update(
            { name: `${name}${suffix}` },
            { transaction }
          );
        }

        // We preserve AgentSkillModel, ConversationSkillModel, and
        // SkillReferenceModel relationships so they can be restored when the skill
        // is unarchived.
        const [count] = await this.update({ status: "archived" }, transaction);

        let referencingSkillIds: string[] = [];

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

          referencingSkillIds =
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

        return {
          affectedCount: count,
          referencingSkillIds,
          renamedSkillId: existingArchivedSkill
            ? SkillResource.modelIdToSId({
                id: existingArchivedSkill.id,
                workspaceId: workspace.id,
              })
            : null,
        };
      });

    if (affectedCount > 0) {
      await SkillResource.launchSearchIndexation(auth, [
        this.sId,
        ...referencingSkillIds,
        ...(renamedSkillId ? [renamedSkillId] : []),
      ]);
    }

    return { affectedCount };
  }

  async restore(auth: Authenticator): Promise<{ affectedCount: number }> {
    assert(
      this.canAdministrate(auth),
      "User is not authorized to restore this skill"
    );

    const { affectedCount, referencingSkillIds } = await withTransaction(
      async (transaction) => {
        const [count] = await this.update({ status: "active" }, transaction);

        let referencingSkillIds: string[] = [];

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

          referencingSkillIds =
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

        return { affectedCount: count, referencingSkillIds };
      }
    );

    if (affectedCount > 0) {
      await SkillResource.launchSearchIndexation(auth, [
        this.sId,
        ...referencingSkillIds,
      ]);
    }

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
    SkillNameSchema.parse(name);

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

    const referencingSkillIds = await withTransaction(async (transaction) => {
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

      let referencingSkillIds: string[] = [];
      if (
        name !== previousName ||
        icon !== previousIcon ||
        requestedSpaceIdsChanged ||
        statusChanged
      ) {
        referencingSkillIds =
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
      return referencingSkillIds;
    });

    if (fileAttachments) {
      await this.setFileAttachments(auth, fileAttachments);
    }

    await this.upsertCurrentUserAsEditor(auth);
    await SkillResource.launchSearchIndexation(auth, [
      this.sId,
      ...referencingSkillIds,
    ]);
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
    await this.launchSearchIndexation(
      auth,
      changedSkills.map((skill) => skill.sId)
    );
  }

  /**
   * Rewrites inline references to this skill in every parent skill so their tag
   * availability reflects this skill's current status and requested spaces.
   */
  /**
   * @cc [owner:aubin-tchoi,label:backend;performance] reference-refresh-targets
   * Parent-reference rewrites preserve the existing writes and return every changed
   * parent ID so callers can enqueue those parents after their transaction commits.
   */
  private async propagateReferenceUpdatesToParentSkills(
    auth: Authenticator,
    params: {
      icon: string | null;
      name: string;
      requestedSpaceIds: readonly ModelId[];
      status: SkillStatus;
    },
    options: { transaction?: Transaction } = {}
  ): Promise<string[]> {
    return skillReferences.propagateReferenceUpdatesToParentSkills(
      SkillResource,
      this,
      auth,
      params,
      options
    );
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
    params: { transaction?: Transaction } = {}
  ): Promise<void> {
    return skillReferences.syncSkillReferences(this, auth, params);
  }

  /**
   * Efficiently updates MCP server view associations by computing the diff and only
   * deleting/creating what changed.
   */
  private async updateMCPServerViews(
    auth: Authenticator,
    mcpServerViews: MCPServerViewResource[],
    options: { transaction?: Transaction } = {}
  ): Promise<void> {
    await skillAttachments.updateMCPServerViews(
      this,
      auth,
      mcpServerViews,
      options
    );
    this._mcpServerConfigurations = mcpServerViews.map((view) => ({ view }));
  }

  static computeDataSourceConfigurationChanges(
    owner: LightWorkspaceType,
    params: {
      attachedKnowledge: SkillAttachedKnowledge[];
      existingConfigurations: SkillDataSourceConfigurationModel[];
      skillConfigurationId: ModelId;
    }
  ): {
    toDelete: SkillDataSourceConfigurationModel[];
    toUpsert: CreationAttributes<SkillDataSourceConfigurationModel>[];
  } {
    return skillAttachments.computeDataSourceConfigurationChanges(
      owner,
      params
    );
  }

  private async setAttachedKnowledge(
    auth: Authenticator,
    params: {
      attachedKnowledge: SkillAttachedKnowledge[];
    },
    options: { transaction?: Transaction } = {}
  ): Promise<void> {
    return skillAttachments.setAttachedKnowledge(
      SkillResource,
      this,
      auth,
      params,
      options
    );
  }

  private async setFileAttachments(
    auth: Authenticator,
    fileAttachments: FileResource[]
  ): Promise<void> {
    await skillAttachments.setFileAttachments(this, auth, fileAttachments);
    this.fileAttachments = fileAttachments;
  }

  async delete(auth: Authenticator): Promise<Result<number, Error>> {
    return skillDeletion.deleteSkill(SkillResource, this, auth);
  }

  async addToAgent(
    auth: Authenticator,
    agentConfiguration: LightAgentConfigurationType
  ): Promise<void> {
    return skillAgents.addToAgent(this, auth, agentConfiguration);
  }

  static async addManyToAgent(
    auth: Authenticator,
    params: {
      agentResource: AgentResource;
      skills: SkillResource[];
    },
    options: { transaction?: Transaction } = {}
  ): Promise<void> {
    return skillAgents.addManyToAgent(auth, params, options);
  }

  async enableForAgent(
    auth: Authenticator,
    params: {
      agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
      conversation: ConversationType;
    }
  ): Promise<{ wasAlreadyEnabled: boolean }> {
    return skillConversations.enableForAgent(this, auth, params);
  }

  static async snapshotConversationSkillsForMessage(
    auth: Authenticator,
    params: {
      agentConfigurationId: string;
      agentMessageId: ModelId;
      conversationId: ModelId;
    }
  ): Promise<void> {
    return skillConversations.snapshotConversationSkillsForMessage(
      auth,
      params
    );
  }

  static async listByAgentMessageId(
    auth: Authenticator,
    agentMessageId: ModelId,
    options: { withToolMetadata?: boolean } = {}
  ): Promise<SkillResource[]> {
    return skillConversations.listByAgentMessageId(
      this.fetchBySkillReferences.bind(this),
      auth,
      agentMessageId,
      options
    );
  }

  static async listByConversationModelId(
    auth: Authenticator,
    conversationModelId: ModelId
  ): Promise<SkillResource[]> {
    return skillConversations.listByConversationModelId(
      this.fetchBySkillReferences.bind(this),
      auth,
      conversationModelId
    );
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
    return skillConversations.listAgentMessageSkillsByCustomSkills(
      auth,
      customSkills
    );
  }

  static async deleteAllForWorkspace(
    auth: Authenticator
  ): Promise<Result<undefined, Error>> {
    return skillDeletion.deleteAllForWorkspace(this, auth);
  }

  private async normalizeSkillReferenceTags(
    auth: Authenticator,
    params: { transaction?: Transaction } = {}
  ): Promise<void> {
    const instructions = await skillReferences.normalizeSkillReferenceTags(
      this,
      auth,
      params
    );
    if (instructions) {
      await this.update(instructions, params.transaction);
    }
  }

  /**
   * @cc [owner:aubin-tchoi,label:backend;security] skill-search-serialization
   * Serialize listing metadata without I/O or private content; fetch custom skills with tools.
   * Custom skills use the authenticator's workspace; code-defined skills use the global namespace,
   * without workspace-specific relationships, usage or dates.
   */
  toSearchDocument(
    auth: Authenticator,
    {
      lastEditedByUser,
      editors,
      activeUsersCount,
    }: {
      lastEditedByUser: UserResource | null;
      editors: UserResource[];
      activeUsersCount: number | null;
    }
  ): SkillSearchDocument {
    const isCodeDefined = this.codeDefinedSkillId !== null;
    return {
      workspace_id: isCodeDefined
        ? CODE_DEFINED_SKILLS_WORKSPACE_ID
        : auth.getNonNullableWorkspace().sId,
      skill_id: this.sId,
      status: this.status,
      availability: this.availability,
      name: this.name,
      description: this.userFacingDescription,
      icon: this.icon,
      last_edited_by_user_id: isCodeDefined
        ? null
        : (lastEditedByUser?.sId ?? null),
      editor_ids: isCodeDefined
        ? []
        : uniq(editors.map((editor) => editor.sId)).sort(),
      requested_space_ids: isCodeDefined
        ? []
        : this.requestedSpaceIds.map((id) =>
            SpaceResource.modelIdToSId({ id, workspaceId: this.workspaceId })
          ),
      mcp_server_view_ids: isCodeDefined
        ? []
        : uniq(this.mcpServerViews.map((view) => view.sId)).sort(),
      active_users_count: isCodeDefined ? null : activeUsersCount,
      favorite_count: this.favoriteCount,
      created_at: isCodeDefined ? null : this.createdAt.toISOString(),
      updated_at: isCodeDefined ? null : this.updatedAt.toISOString(),
    };
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
      (this.codeDefinedSkillId !== null && !this.exposeInstructions) ||
      this.redactedForCaller;

    return {
      id: this.id,
      sId: this.sId,
      createdAt: this.codeDefinedSkillId ? null : this.createdAt.getTime(),
      updatedAt: this.codeDefinedSkillId ? null : this.updatedAt.getTime(),
      editedBy: this.codeDefinedSkillId ? null : this.editedBy,
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

  /**
   * @cc [owner:fabiencelier,label:security] no-private-skill-fields
   * The returned object MUST only carry fields that are public to any actor who can see the
   * skill: instructions, tools, files and space ids are redacted for some callers by `toJSON`
   * and MUST NOT be added here.
   */
  toAgentSkillJSON(): AgentSkillType {
    return {
      sId: this.sId,
      name: this.name,
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
    options: { transaction?: Transaction } = {}
  ): Promise<void> {
    return skillVersions.bulkSaveVersions(auth, skills, options);
  }
}
