import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import type {
  MCPServerConfigurationType,
  ServerSideMCPServerConfigurationType,
} from "@app/lib/actions/mcp";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { getNewAgentModelDefaults } from "@app/lib/agent_builder/helpers";
import { GLOBAL_AGENTS_WORKSPACE_ID } from "@app/lib/agent_search/constants";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import { canAdminSeePrivateEntities } from "@app/lib/api/assistant/configuration/private_entities";
import { globalAgentReaderRoles } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import {
  getGlobalAgents,
  listDefaultGlobalAgentIds,
} from "@app/lib/api/assistant/global_agents/global_agents";
import { agentConfigurationWasUpdatedBy } from "@app/lib/api/assistant/recent_authors";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { Authenticator } from "@app/lib/auth";
import { CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/constants/credits";
import { DustError } from "@app/lib/error";
import {
  getEffectiveReasoningEffort,
  getSupportedModelConfig,
} from "@app/lib/llms/model_configurations";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import {
  AgentChildAgentConfigurationModel,
  AgentMCPServerConfigurationModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import {
  AgentConfigurationModel,
  AgentModel,
  AgentUserRelationModel,
} from "@app/lib/models/agent/agent";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { AgentSuggestedPromptsModel } from "@app/lib/models/agent/agent_suggested_prompts";
import { AgentSuggestionModel } from "@app/lib/models/agent/agent_suggestion";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { canonicalizeSaveParamsForComparison } from "@app/lib/resources/agent_configuration_comparison";
import {
  assertPublishPermissionForScopeChange,
  resolveExistingAgentAndVersion,
  syncAgentEditors,
  syncAgentTags,
  validateAgentSaveInputs,
  writeAgentConfigurationRow,
} from "@app/lib/resources/agent_configuration_save";
import { updateAgentRequestedSpaceIdsInPlace } from "@app/lib/resources/agent_requested_spaces";
import type { AgentResourceCacheKey } from "@app/lib/resources/agent_resource_cache";
import {
  AGENT_RESOURCE_CACHE_ID,
  AGENT_RESOURCE_CACHE_VERSION,
  agentResourceCacheKey,
  invalidateAgentResourceCache,
  invalidateAgentResourceCaches,
} from "@app/lib/resources/agent_resource_cache";
import { launchAgentSearchIndexation } from "@app/lib/resources/agent_resource_indexation";
import { AgentUserRelationResource } from "@app/lib/resources/agent_user_relation_resource";
import type { ResourceLogJSON } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import type { CachedResourceMode } from "@app/lib/resources/cached_resource_store";
import { defineCachedResourceValue } from "@app/lib/resources/cached_resource_store";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { SkillFetchContext } from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import { GroupPinnedItemModel } from "@app/lib/resources/storage/models/group_pinned_items";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WakeUpResource } from "@app/lib/resources/wakeup_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchDeleteAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import type {
  AgentSearchDocument,
  AgentSearchListItemType,
} from "@app/types/agent_search/agent_search";
import type { DiscoveryAgentType } from "@app/types/api/discovery";
import type {
  AgentConfigurationBaseType,
  AgentConfigurationScope,
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentModelConfigurationType,
  AgentReinforcementMode,
  AgentStatus,
  GlobalAgentContext,
} from "@app/types/assistant/agent";
import { isAgentStatus } from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { RichAgentMention } from "@app/types/assistant/mentions";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { GrantVerb } from "@app/types/group_permissions";
import { grantKey } from "@app/types/group_permissions";
import type {
  RoleGrant,
  WithAccessControl,
} from "@app/types/resource_permissions";
import { verbsFromRoleGrants } from "@app/types/resource_permissions";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import type { TagType } from "@app/types/tag";
import type { UserType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import assert from "assert";
import isEqual from "lodash/isEqual";
import partition from "lodash/partition";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import type {
  Attributes,
  Includeable,
  Transaction,
  WhereOptions,
} from "sequelize";
import {
  col,
  fn,
  Op,
  where as sequelizeWhere,
  UniqueConstraintError,
  ValidationError,
} from "sequelize";

// A draft belongs to its current author until it is published. This is ownership, not an editor
// grant: once the agent leaves draft status, only explicit grants confer editorship.
const DRAFT_OWNER_VERBS: GrantVerb[] = ["read", "write", "admin", "list"];

// Agents in these statuses only exist inside the builder — behind its "try" button or before the
// first save — and are never indexed.
const NON_INDEXABLE_AGENT_STATUSES: AgentConfigurationStatus[] = [
  "draft",
  "pending",
];

// Each agent in a bulk model update goes through a full save (new version + tools/skills recreated),
// so keep the parallelism low: enough to keep a large selection responsive, not enough to flood the
// connection pool.
const BULK_UPDATE_CONCURRENCY = 4;

export type EditorDeltaErrorCode =
  | "user_already_member"
  | "user_not_member"
  | "user_not_found"
  | "internal_error";

const PENDING_AGENT_PLACEHOLDER_NAME = "__PENDING__";
const PENDING_AGENT_PLACEHOLDER_DESCRIPTION = "";
const PENDING_AGENT_PLACEHOLDER_PICTURE_URL =
  "https://dust.tt/static/systemavatar/dust_avatar_full.png";

// Human workspace admins manage editors but must grant themselves editor access to change the agent.
// The admin role alone does not read a hidden agent (see the `hidden-agent-content` contract).
const HIDDEN_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["admin", "list"] },
  { role: "manager", permissions: ["list"] },
];

// Visible agents are readable by every workspace role. Kept explicit (not spread from
// `HIDDEN_AGENT_ROLE_GRANTS`) so the admin role keeps `read` here even though it does not on hidden.
const VISIBLE_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["read", "admin", "list"] },
  { role: "manager", permissions: ["read", "list"] },
  { role: "user", permissions: ["read", "list"] },
  { role: "none", permissions: ["read", "list"] },
];

// The private `AgentConfigurationModel` columns, for callers who `canViewContent`. Never loaded with
// the resource: read on demand through `fetchInstructions`/`batchFetchInstructions` (see
// `agent-instructions-on-demand`).
export type AgentResourceInstructions = {
  instructions: string | null;
  instructionsHtml: string | null;
};

export type AgentActionsFetchOptions = {
  permissionFiltering?: "default" | "dangerously_skip";
};

const AGENT_INSTRUCTIONS_ATTRIBUTES = [
  "instructions",
  "instructionsHtml",
] as const;

export type AgentVersionReference = {
  agentId: string;
  agentVersion: number;
};

// `dangerouslySkipFetchCheck` is for callers displaying agents reached through another
// access-controlled object (e.g. the historical agents of a conversation the caller can read), or
// deciding access themselves: they must keep the agent's identity even once the caller holds no
// verb on it.
/**
 * @cc [owner:tdraier,label:security] agent-dangerous-fetch
 * With `dangerouslySkipFetchCheck`, `fetchByIds`/`fetchByIdsAndVersions` MUST behave as without it
 * except that they skip the `canFetch` drop: resources are still materialized for the caller, so
 * one the caller holds no verb on carries no verb (`auth.can` is false for all of them) and
 * `canViewContent` false, and exposes core fields only (see `unreadable-agent-content-hidden`).
 * Workspace scoping and missing-agent omission are unchanged.
 */
/**
 * @cc [owner:tdraier,label:backend] global-agent-context
 * `globalAgentContext` is the conversation turn a global agent is resolved for: it MUST only be
 * forwarded to `getGlobalAgents`, so it only shapes global agents (today their
 * `modelConfiguration`, e.g. the NOOP static reply), and MUST NOT affect custom agents. Global
 * resources are never cached, so a turn's context never reaches another read.
 */
/**
 * @cc [owner:tdraier,label:backend;performance] resolved-agent-actions
 * With `withActions`, every resolved resource whose content the caller can view MUST carry its
 * tools: custom agents' from one tools lookup per call, global agents' from their `full` build
 * (with the same `globalAgentContext`). `listActions`/`batchListActions` MUST return the carried
 * tools without looking them up again, and still MUST NOT return them to a caller who cannot view
 * the content (see `actions-require-read`). Tools are never part of the cache snapshot.
 * Without it, global agents are built `light` and tools are looked up by `batchListActions`.
 */
export type AgentFetchOptions = {
  dangerouslySkipFetchCheck?: boolean;
  globalAgentContext?: GlobalAgentContext;
  withActions?: boolean;
};

// The outcome of a `bulkUpdate`: the agents whose save succeeded (`updatedAgentIds`, a change
// applied or an already-satisfied no-op), and the requested ids that were skipped (not resolvable,
// archived, not editable by the caller for the requested change, or failed to save). Reported back
// so callers can tell the UI what was applied.
export type BulkAgentUpdateResult = {
  updatedAgentIds: string[];
  skippedAgentIds: string[];
};

// The inputs to save a custom agent configuration (create a new agent or a new version), minus the
// agent identity — `makeNew` creates a new one, `updateConfiguration` targets `this` agent. The
// orchestrator (`createOrUpgradeAgentConfiguration`) validates and assembles this; the save persists
// the configuration together with its actions and skills atomically (see `agent-save-atomic`).
export type SaveAgentConfigurationParams = {
  name: string;
  description: string;
  instructions: string | null;
  instructionsHtml: string | null;
  pictureUrl: string;
  status: AgentStatus;
  scope: Exclude<AgentConfigurationScope, "global">;
  model: AgentModelConfigurationType;
  templateId: string | null;
  requestedSpaceIds: ModelId[];
  tags: TagType[];
  editors: UserType[];
  authorId: ModelId;
  reinforcement?: AgentReinforcementMode;
  ignoreCreditSpendThresholdAlert?: boolean;
  // MCP action configurations to create atomically with the agent version. Created inside the same
  // transaction as the configuration row (see `agent-save-atomic`), so a failure rolls the whole
  // save back and no partial version is ever committed. Defaults to none.
  actions?: ServerSideMCPServerConfigurationType[];
  // Skill associations to attach atomically with the agent version, in the same transaction.
  // Defaults to none.
  skills?: SkillResource[];
};

export type AgentAuditOptions = { auditMetadata?: Record<string, string> };

// A partial update applied by `updateConfiguration`/`bulkUpdate`: any subset of an agent's
// configuration. Only provided properties are considered. `model` may itself be partial — the
// provided fields are merged into the agent's current model, so a bulk model change can set the
// provider/model/effort without discarding each agent's other model settings (e.g. temperature).
// `tags` may be given as a full set or, for a bulk tag edit across agents with differing current
// tags, as `addTags`/`removeTags` deltas resolved per agent (see `applyTagDelta`).
export type AgentConfigurationUpdate = Partial<
  Omit<SaveAgentConfigurationParams, "model">
> & {
  model?: Partial<AgentModelConfigurationType>;
  addTags?: TagResource[];
  removeTags?: TagResource[];
};

// Resolves a tag delta against a current tag set: drops `removeTags`, then adds `addTags` (deduped
// by `sId`). A tag present in both is dropped — a removal wins over an add. Used to turn a bulk tag
// edit (uniform add/remove across agents) into each agent's own resulting tag set. Takes
// `TagResource` deltas (callers pass resources, not serialized types) and serializes to `TagType`
// only here, where the save params are assembled — as `buildResaveParams` already does.
function applyTagDelta(
  currentTags: TagType[],
  {
    addTags = [],
    removeTags = [],
  }: { addTags?: TagResource[]; removeTags?: TagResource[] }
): TagType[] {
  const removeIds = new Set(removeTags.map((tag) => tag.sId));
  const byId = new Map<string, TagType>();
  for (const tag of currentTags) {
    if (!removeIds.has(tag.sId)) {
      byId.set(tag.sId, tag);
    }
  }
  for (const tag of addTags) {
    if (!removeIds.has(tag.sId)) {
      byId.set(tag.sId, tag.toJSON());
    }
  }
  return [...byId.values()];
}

// The `SaveAgentConfigurationParams` fields that define a configuration version (everything except
// `scope`/`editors`, which are applied in place, and `authorId`, which is version metadata). A save
// that changes any of these creates a new version; see `updateConfiguration`/`agent-edit-in-place`.
const AGENT_CONFIGURATION_KEYS = [
  "name",
  "description",
  "instructions",
  "instructionsHtml",
  "pictureUrl",
  "status",
  "model",
  "templateId",
  "requestedSpaceIds",
  "reinforcement",
  "ignoreCreditSpendThresholdAlert",
  "tags",
  "actions",
  "skills",
] as const satisfies readonly (keyof SaveAgentConfigurationParams)[];

// JSON-serializable model configuration: the optional `reasoningEffort`/`responseFormat` become
// `null` (JSON drops `undefined`), everything else is JSON-native.
type SerializedModelConfiguration = {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  temperature: number;
  reasoningEffort: ReasoningEffort | null;
  responseFormat: string | null;
};

// Cached shape of a caller-independent custom `AgentResource`. Hand-written (the resource spans two
// tables and reshapes columns), so `AGENT_RESOURCE_CACHE_VERSION` MUST be bumped on any change.
export type AgentResourceSnapshot = {
  agentModelId: ModelId;
  agentConfigurationModelId: ModelId;
  workspaceId: ModelId;
  sId: string;
  // The agent row's `createdAt` (epoch millis). Distinct from `versionCreatedAt`, which is the
  // configuration version's timestamp — `agents.createdAt` is independent since it is backfilled.
  createdAt: number;
  scope: AgentConfigurationScope;
  name: string;
  description: string;
  status: AgentConfigurationStatus;
  pictureUrl: string;
  templateId: ModelId | null;
  reinforcement: AgentReinforcementMode;
  lastReinforcementAnalysisAt: number | null;
  versionAuthorId: ModelId | null;
  requestedSpaceIds: ModelId[];
  modelConfiguration: SerializedModelConfiguration;
  version: number;
  maxStepsPerRun: number;
  creditSpendCheckpointThresholdAwuCredits: number | null;
  versionCreatedAt: number;
  versionUpdatedAt: number;
};

// Rollout mode for the agent read cache. Progression: "dryRun" (wired end to end but touching no
// Redis) -> "compare" (warm the cache and log any divergence from the database, which stays
// authoritative) -> "live" (serve from the cache).
/**
 * @cc [owner:tdraier,label:backend;performance] agent-cache-dry-run-bumps-version
 * A change that moves this mode from "live" or "compare" to "dryRun" MUST bump
 * `AGENT_RESOURCE_CACHE_VERSION` in the same change, so re-enabling never reads entries written
 * before the switch.
 */
const AGENT_RESOURCE_CACHE_MODE: CachedResourceMode = "live";

export interface AgentResource extends Omit<
  ReadonlyAttributesType<AgentModel>,
  "name" | "status" | "scope" | "reinforcement"
> {
  readonly agentConfigurationModelId: ModelId;
  readonly scope: AgentConfigurationScope;
  readonly name: string;
  readonly description: string;
  readonly status: AgentConfigurationStatus;
  readonly pictureUrl: string;
  readonly reinforcement: AgentReinforcementMode;
  readonly versionAuthorId: ModelId | null;
  readonly modelConfiguration: AgentModelConfigurationType;
  readonly version: number;
  readonly maxStepsPerRun: number;
  readonly creditSpendCheckpointThresholdAwuCredits: number | null;
  readonly versionCreatedAt: Date;
  readonly versionUpdatedAt: Date;
}

/**
 * @cc [owner:tdraier,label:backend] agent-resource-identity
 * The authoritative resolvers `fetchByModelIdWithAuth`/`fetchByModelIds`/`fetchById(s)` MUST resolve
 * a custom agent to its current configuration version — the row its `currentVersion` pointer
 * designates (see `fetch-current-version`) — so two fetched resources sharing an `id`
 * (= `agentModelId`) are consistent at a given time. `fetchVersion`/`listVersions` and
 * `fetchByIdsAndVersions` are the only resolvers that deliberately resolve other
 * versions (see `agent-versions`, `fetch-pinned-versions`); such a resource is told apart by
 * `isCurrentVersion` and is read-only. The `from*` factories are an unchecked fast
 * path: they build a resource from whatever configuration the caller supplies, and do NOT yet
 * guarantee it is the current version — a caller deciding about the agent's current state must pass
 * that version, or use `fetch*`. (`from*` are intended to become private and enforce this.) Global
 * agents are exempt from the `id`-consistency clause: they have no `agent` row, are identified by
 * `sId`, and all share the `id: -1` sentinel.
 */
/**
 * @cc [owner:sfriquet,label:security] unreadable-agent-content-hidden
 * A resource built for a caller who cannot view the agent's content (`canViewContent` false: no
 * `read`, outside the `admin_can_see_private_entities` admin override) MUST NOT expose the agent's
 * instructions (`instructions`, `instructionsHtml`) to that caller: `fetchInstructions`/
 * `batchFetchInstructions` never return them for it, whatever their role or key type. The only
 * exception is a Poke superuser authenticator (see `poke-agent-content-access`). The instructions
 * are the only private fields: the head fields (`name`, `status`, `scope`,
 * `templateId`, `reinforcement`, `lastReinforcementAnalysisAt`) are core and carried by every
 * resource. This holds for every `fetch*` resolver, for `listVersions`, for `fromModels` and for
 * global agents, so a caller allowed to enumerate agents they cannot read (an admin or manager
 * listing hidden agents, a superuser) sees identity and core fields only. Callers MUST NOT attach
 * the instructions to such a resource from another read path.
 */
/**
 * @cc [owner:philipperolet,label:security;product] agent-verbs
 * The verbs a caller holds on an agent mean:
 * - `read`: seeing the agent's full configuration and using it. Mentioning or running an agent
 *   MUST require `read`. A custom agent with scope `visible` grants workspace-wide read, except
 *   draft and pending agents, which are always authorized as hidden. Otherwise the caller needs
 *   editor access, except that a draft's current author owns that draft (see `draft-agent-owner`).
 *   The caller must also be able to read every space in `requestedSpaceIds` (see
 *   `agent-read-requires-space-read`).
 * - `write`: editing the agent's definition: configuration versions, tags, model, skills, linked
 *   Slack channels.
 * - `admin`: managing the agent's editors, archiving and restoring the agent (lifecycle changes,
 *   not definition edits; see `agent-archive-restore-requires-admin`), and — as the sole definition
 *   exceptions — changing the agent's model (see `model-change-requires-edit`) and, for a workspace
 *   admin, its tags (see `tags-change-requires-edit`). `admin` alone MUST NOT allow changing any
 *   other definition field, and `write` alone MUST NOT allow changing the editors. Like editor
 *   management, archiving/restoring is gated on `admin` and is not additionally space-gated, so a
 *   workspace admin may archive/restore an agent it cannot read (e.g. hidden agents surfaced by
 *   "Show hidden agents").
 * - `list`: seeing the agent's core fields, including its version author, but not its
 *   editors. `read` implies `list`. The `admin` and `manager` roles MUST hold it on every custom
 *   agent, regardless of scope, status, or `requestedSpaceIds`.
 * Holding any verb makes the agent fetchable, but without `read` only its core fields may be
 * exposed (see `unreadable-agent-content-hidden`). The explicit `admin_can_see_private_entities` admin
 * override and the Poke superuser authenticator (see `poke-agent-content-access`) are the only
 * exceptions and may expose the full configuration.
 * Global (code-defined) agents are `read`-only, for the roles in their audience.
 */
/**
 * @cc [owner:philipperolet,label:security;product] agent-create-capability
 * `create` on the `agent` type means bringing a new agent into the workspace: creating a pending
 * agent, saving an agent whose id does not exist yet, or importing one from YAML. Every such path
 * MUST require `hasWorkspacePermission("create", "agent")`. Saving a new version of an existing
 * agent MUST NOT.
 */
/**
 * @cc [owner:philipperolet,label:security;product] agent-publish-capability
 * `publish` on the `agent` type means deciding whether an active agent is visible to the whole
 * workspace. Creating or activating a visible agent, or changing an active agent's scope, MUST
 * require the `publish` capability — a workspace-wide capability resolved via
 * `auth.hasWorkspacePermission("publish", "agent")` (see `scope-change-requires-edit-and-publish`) —
 * even for its editors. Draft and pending agents MUST be persisted and authorized as hidden. An
 * archived agent's scope MUST remain stored and MUST NOT change until restore; archived versions with
 * stored scope `visible` remain readable so historical references keep working. Restoring a stored
 * visible scope MUST require `publish`. Editing an agent without changing its workspace visibility
 * MUST NOT require `publish`. Protected tags and linking Slack channels to an agent are gated by it
 * too.
 */
/**
 * @cc [owner:tdraier,label:security] agent-edit-requires-write
 * Creating a new configuration version of an existing agent by changing a definition field other
 * than the model and tags (see `agent-edit-in-place`) MUST require `write` on that agent
 * (`auth.can("write", this)`), enforced inside the resource (`updateConfiguration`) — callers may
 * double-check, but MUST NOT be the sole gate. `read` alone (any member can read a visible agent)
 * MUST NOT allow editing the definition. For human and system-key callers the workspace `admin` role
 * alone (which grants `admin`, not `write`, on agents they do not edit) MUST NOT allow editing such
 * a definition field — though it does allow changing that agent's model (see
 * `model-change-requires-edit`), its tags (see `tags-change-requires-edit`), or its editor set in
 * place. The `admin` verb held without the workspace admin role (an editor who lost read access to a
 * required space) allows the model but NOT the tags: a tags version is rebuilt from the caller's
 * readable view, so it is restricted to callers whose rebuild is faithful (workspace admins). Regular
 * API keys are the sole exception: the admin role grants them `write` (see `admin-key-agent-write`),
 * so an admin key may edit an agent it holds no editor grant on.
 */
/**
 * @cc [owner:tdraier,label:backend] batch-results-by-resource
 * Every `batch*` read (`batchListEditors`, `batchListActions`, `batchListTags`,
 * `batchCountFavorites`, `batchFetchInstructions`) MUST accept custom and global agents alike and return
 * a `Map` keyed by the input resource, with an entry for every input: a resource is one
 * configuration version, whereas `sId` spans every version of an agent and global agents share one
 * sentinel configuration id.
 */
export class AgentResource
  extends BaseResource<AgentModel>
  implements WithAccessControl
{
  private readonly requestedSpaceIds: ModelId[];
  private _codeDefinedSkillIds: string[] = [];
  // A resource not yet materialized for a caller (e.g. re-saved by `bulkUpdate`) may view its
  // content; `materialize` sets it for the caller.
  private _canViewContent = true;
  private _globalContent: AgentResourceInstructions | null = null;
  private _actions: MCPServerConfigurationType[] | null = null;

  private _verbs: Set<GrantVerb> = new Set();
  private _isRegularApiKey = false;
  private _adminCanSeePrivateEntities = false;

  private constructor(
    agent: Attributes<AgentModel>,
    agentConfiguration: Attributes<AgentConfigurationModel>
  ) {
    super(AgentModel, agent);

    Object.assign(this, {
      agentConfigurationModelId: agentConfiguration.id,
      scope: agentConfiguration.scope,
      name: agentConfiguration.name,
      description: agentConfiguration.description,
      status: agentConfiguration.status,
      pictureUrl: agentConfiguration.pictureUrl,
      templateId: agentConfiguration.templateId,
      reinforcement: agentConfiguration.reinforcement,
      lastReinforcementAnalysisAt:
        agentConfiguration.lastReinforcementAnalysisAt,
      versionAuthorId: agentConfiguration.authorId,
      modelConfiguration: {
        providerId: agentConfiguration.providerId,
        modelId: agentConfiguration.modelId,
        temperature: agentConfiguration.temperature,
        reasoningEffort: agentConfiguration.reasoningEffort ?? undefined,
        responseFormat: agentConfiguration.responseFormat ?? undefined,
      },
      version: agentConfiguration.version,
      maxStepsPerRun: agentConfiguration.maxStepsPerRun,
      creditSpendCheckpointThresholdAwuCredits:
        agentConfiguration.creditSpendCheckpointThresholdAwuCredits,
      versionCreatedAt: agentConfiguration.createdAt,
      versionUpdatedAt: agentConfiguration.updatedAt,
    } satisfies Pick<
      AgentResource,
      | "agentConfigurationModelId"
      | "scope"
      | "name"
      | "description"
      | "status"
      | "pictureUrl"
      | "templateId"
      | "reinforcement"
      | "lastReinforcementAnalysisAt"
      | "versionAuthorId"
      | "modelConfiguration"
      | "version"
      | "maxStepsPerRun"
      | "creditSpendCheckpointThresholdAwuCredits"
      | "versionCreatedAt"
      | "versionUpdatedAt"
    >);
    this.requestedSpaceIds = agentConfiguration.requestedSpaceIds;
  }

  // Whether the caller the resource was materialized for may view its content (see
  // `agent-content-visibility`).
  get canViewContent(): boolean {
    return this._canViewContent;
  }

  /**
   * @cc [owner:tdraier,label:backend;performance] agent-instructions-on-demand
   * The resolvers MUST NOT load a custom agent's instructions (`instructions`, `instructionsHtml`)
   * and the cache snapshot MUST NOT carry them: they are read on demand through `fetchInstructions`/
   * `batchFetchInstructions`, for the resource's own configuration version, and only for a caller
   * who `canViewContent` (see `unreadable-agent-content-hidden`). A global agent's instructions are
   * code-defined, built with the resource and served from memory.
   */
  async fetchInstructions(): Promise<AgentResourceInstructions> {
    assert(
      this.canViewContent,
      `Unexpected: fetching instructions the caller cannot view for agent ${this.sId}`
    );
    const contents = await AgentResource.batchFetchInstructions([this]);
    const content = contents.get(this);
    assert(content, `Unexpected: missing content for agent ${this.sId}`);

    return content;
  }

  static async batchFetchInstructions(
    resources: AgentResource[]
  ): Promise<Map<AgentResource, AgentResourceInstructions | null>> {
    const customResources = resources.filter(
      (resource) => resource.canViewContent && resource.scope !== "global"
    );
    const configurations =
      customResources.length > 0
        ? await AgentConfigurationModel.findAll({
            attributes: ["id", ...AGENT_INSTRUCTIONS_ATTRIBUTES],
            where: {
              id: uniq(
                customResources.map(
                  (resource) => resource.agentConfigurationModelId
                )
              ),
              workspaceId: uniq(
                customResources.map((resource) => resource.workspaceId)
              ),
            },
          })
        : [];
    const contentByConfigurationId = new Map(
      configurations.map((configuration) => [
        configuration.id,
        {
          instructions: configuration.instructions,
          instructionsHtml: configuration.instructionsHtml,
        },
      ])
    );

    return new Map(
      resources.map((resource) => {
        if (!resource.canViewContent) {
          return [resource, null];
        }
        if (resource.scope === "global") {
          return [resource, resource._globalContent];
        }
        return [
          resource,
          contentByConfigurationId.get(resource.agentConfigurationModelId) ??
            null,
        ];
      })
    );
  }

  static fromGlobalAgent(
    auth: Authenticator,
    configuration: AgentConfigurationType
  ): AgentResource {
    assert(isGlobalAgentId(configuration.sId));

    const workspaceId = auth.getNonNullableWorkspace().id;
    const now = new Date();

    const resource = new AgentResource(
      {
        id: -1,
        workspaceId,
        sId: configuration.sId,
        createdAt: now,
        updatedAt: now,
        currentVersion: configuration.version,
        name: null,
        status: null,
        scope: null,
        reinforcement: null,
        lastReinforcementAnalysisAt: null,
        templateId: null,
      },
      {
        id: configuration.id,
        workspaceId,
        sId: configuration.sId,
        createdAt: now,
        updatedAt: now,
        version: configuration.version,
        agentId: -1,
        status: "active",
        scope: "hidden",
        authorId: -1,
        name: configuration.name,
        description: configuration.description,
        instructions: configuration.instructions,
        instructionsHtml: configuration.instructionsHtml,
        providerId: configuration.model.providerId,
        modelId: configuration.model.modelId,
        temperature: configuration.model.temperature,
        reasoningEffort: configuration.model.reasoningEffort ?? null,
        responseFormat: configuration.model.responseFormat,
        pictureUrl: configuration.pictureUrl,
        maxStepsPerRun: configuration.maxStepsPerRun,
        creditSpendCheckpointThresholdAwuCredits:
          CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS,
        templateId: null,
        reinforcement: configuration.reinforcement ?? "auto",
        lastReinforcementAnalysisAt: null,
        requestedSpaceIds: [],
      }
    );
    Object.assign(resource, {
      scope: "global",
      status: configuration.status,
      versionAuthorId: null,
      // The code-defined model can carry `metaData` (e.g. the NOOP static reply), which no
      // configuration column holds, so it is taken as-is rather than from the row built above.
      modelConfiguration: configuration.model,
    } satisfies Pick<
      AgentResource,
      "scope" | "status" | "versionAuthorId" | "modelConfiguration"
    >);
    resource._codeDefinedSkillIds = configuration.codeDefinedSkillIds ?? [];
    resource._globalContent = {
      instructions: configuration.instructions,
      instructionsHtml: configuration.instructionsHtml,
    };

    return resource.materialize(auth);
  }

  // Binds a freshly built (never shared) resource to its caller: their verbs, and the content only
  // if they may view it. Every factory and resolver builds a new instance per read before calling it.
  private materialize(
    auth: Authenticator,
    {
      adminCanSeePrivateEntities = false,
    }: { adminCanSeePrivateEntities?: boolean } = {}
  ): AgentResource {
    this._verbs = this.getAllowedVerbs(auth);
    this._isRegularApiKey = auth.isKey() && !auth.isSystemKey();
    this._adminCanSeePrivateEntities = adminCanSeePrivateEntities;

    this._canViewContent = this.resolveCanViewContent(auth);

    return this;
  }

  // The feature flag is only looked up when it can change the outcome: an admin materializing a
  // custom agent they cannot read.
  private static async resolveAdminCanSeePrivateEntities(
    auth: Authenticator,
    resources: AgentResource[]
  ): Promise<boolean> {
    return (
      auth.isAdmin() &&
      resources.some(
        (resource) => !resource.getAllowedVerbs(auth).has("read")
      ) &&
      (await canAdminSeePrivateEntities(auth))
    );
  }

  /**
   * @cc [owner:tdraier,label:security] agent-content-visibility
   * The private content (instructions, tools) is visible to a caller who holds `read`, and to a
   * workspace admin of a workspace with the `admin_can_see_private_entities` feature flag, and to a
   * Poke superuser (see `poke-agent-content-access`), whichever resolver or factory built the
   * resource they are handed (`fetch*`, `dangerouslyFromConfigurationModels`). The flag MUST NOT
   * grant any verb: what such an admin may do with the agent is decided by their verbs alone (see
   * `agent-verbs`) — without `read` they cannot mention or run it, and the definition edits their
   * `admin` verb allows (model, tags) are unchanged.
   */
  /**
   * @cc [owner:tdraier,label:security] poke-agent-content-access
   * A Dust superuser authenticator (`auth.isDustSuperUser()`, only built by the Poke entrypoints)
   * MUST be able to view every agent's content, instructions and tools included, whatever its
   * verbs; it MUST NOT grant or change any verb.
   */
  private resolveCanViewContent(auth: Authenticator): boolean {
    return (
      auth.isDustSuperUser() ||
      auth.can("read", this) ||
      (this._adminCanSeePrivateEntities && auth.isAdmin())
    );
  }

  private static fromModels(
    auth: Authenticator,
    agent: AgentModel,
    agentConfiguration: AgentConfigurationModel,
    options: { adminCanSeePrivateEntities?: boolean } = {}
  ): AgentResource {
    return new AgentResource(agent.get(), agentConfiguration.get()).materialize(
      auth,
      options
    );
  }

  static async dangerouslyFromConfigurationModels(
    auth: Authenticator,
    agentConfigurations: AgentConfigurationModel[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<AgentResource[]> {
    if (agentConfigurations.length === 0) {
      return [];
    }

    const workspaceId = auth.getNonNullableWorkspace().id;
    const agentModelIds = [
      ...new Set(
        agentConfigurations.map((configuration) => configuration.agentId)
      ),
    ];
    const agents = await AgentModel.findAll({
      where: { id: agentModelIds, workspaceId },
      transaction,
    });
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));

    const resources = agentConfigurations.map((configuration) => {
      const agent = agentById.get(configuration.agentId);
      assert(
        agent,
        `Unexpected: missing agent ${configuration.agentId} for configuration ${configuration.id}`
      );
      return new AgentResource(agent.get(), configuration.get());
    });
    const adminCanSeePrivateEntities =
      await this.resolveAdminCanSeePrivateEntities(auth, resources);

    return resources.map((resource) =>
      resource.materialize(auth, { adminCanSeePrivateEntities })
    );
  }

  // -- Resolvers: current version, materialized for the caller --

  /**
   * @cc [owner:tdraier,label:backend] fetch-current-version
   * Resolves each requested custom agent to its current configuration version — the row whose
   * `version` equals the agent's `currentVersion` pointer (see `agent-current-version-pointer`) —
   * scoped to the authed workspace. Each is materialized for the caller, whose `canViewContent`
   * follows `agent-content-visibility`; a resource the caller cannot fetch at all (holds no verb on,
   * per `canFetch`) is dropped, except with `dangerouslySkipFetchCheck` (see
   * `agent-dangerous-fetch`). An agent with no configuration yields no resource, and at most one
   * resource is returned per `agentModelId`. `fetchById(s)` additionally resolve global agents by `sId` (they have no
   * configuration rows) via `getGlobalAgents`, gated by the same `canFetch` check;
   * `fetchByModelId(s)` cannot, since global agents have no `agentModelId`.
   */
  static async fetchByModelIds(
    auth: Authenticator,
    agentModelIds: ModelId[]
  ): Promise<AgentResource[]> {
    if (agentModelIds.length === 0) {
      return [];
    }

    const agents = await AgentModel.findAll({
      attributes: ["id", "sId"],
      where: {
        id: agentModelIds,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
    const idsByModelId = new Map(agents.map((agent) => [agent.id, agent.sId]));
    return this.fetchByIds(
      auth,
      removeNulls(agentModelIds.map((id) => idsByModelId.get(id)))
    );
  }

  // Named `...WithAuth` because `BaseResource.fetchByModelId` already occupies the bare name with an
  // unauthenticated signature.
  static async fetchByModelIdWithAuth(
    auth: Authenticator,
    agentModelId: ModelId
  ): Promise<AgentResource | null> {
    const [resource] = await this.fetchByModelIds(auth, [agentModelId]);
    return resource ?? null;
  }

  /**
   * @cc [owner:flvndvd,label:backend;security] agent-batch-reads
   * Results MUST follow first-occurrence input order, omitting missing and unfetchable agents.
   * All custom-agent cache misses in a call MUST load together, scoped to the caller's workspace.
   * Both cache hits and misses MUST undergo caller-dependent materialization and permission checks.
   */
  static async fetchByIds(
    auth: Authenticator,
    agentIds: string[],
    options: AgentFetchOptions = {}
  ): Promise<AgentResource[]> {
    const { dangerouslySkipFetchCheck = false } = options;
    if (agentIds.length === 0) {
      return [];
    }

    const uniqueAgentIds = uniq(agentIds);
    const globalAgentIds = uniqueAgentIds.filter(isGlobalAgentId);
    const customAgentIds = uniqueAgentIds.filter((id) => !isGlobalAgentId(id));

    const [customResources, globalResources] = await Promise.all([
      this.fetchManyFromStore(auth, customAgentIds),
      this.fetchGlobalAgents(auth, globalAgentIds, options),
    ]);

    const adminCanSeePrivateEntities =
      await this.resolveAdminCanSeePrivateEntities(auth, customResources);

    const fetchedCustomResources = customResources
      .map((resource) =>
        resource.materialize(auth, { adminCanSeePrivateEntities })
      )
      .filter(
        (resource) => dangerouslySkipFetchCheck || resource.canFetch(auth)
      );
    if (options.withActions) {
      await this.loadCustomAgentActions(auth, fetchedCustomResources);
    }

    const resourcesById = new Map(
      [...fetchedCustomResources, ...globalResources].map((resource) => [
        resource.sId,
        resource,
      ])
    );
    return removeNulls(uniqueAgentIds.map((id) => resourcesById.get(id)));
  }

  // Global agents are code-defined and have no `agent`/configuration rows, so they cannot be
  // resolved by the version query; they are built from `getGlobalAgents` (which enforces workspace
  // plan/availability) and gated by the same `canFetch` check as custom agents.
  private static async fetchGlobalAgents(
    auth: Authenticator,
    globalAgentIds: string[],
    {
      dangerouslySkipFetchCheck = false,
      globalAgentContext,
      withActions = false,
    }: AgentFetchOptions = {}
  ): Promise<AgentResource[]> {
    if (globalAgentIds.length === 0) {
      return [];
    }

    const configurations = await getGlobalAgents(
      auth,
      globalAgentIds,
      withActions ? "full" : "light",
      { globalAgentContext }
    );
    return configurations
      .map((configuration) => {
        const resource = this.fromGlobalAgent(auth, configuration);
        if (withActions) {
          resource._actions = configuration.actions;
        }
        return resource;
      })
      .filter(
        (resource) => dangerouslySkipFetchCheck || resource.canFetch(auth)
      );
  }

  /**
   * @cc [owner:tdraier,label:backend;security] fetch-pinned-versions
   * Resolves each requested `(agentId, agentVersion)` pair to that exact configuration version,
   * scoped to the authed workspace, whether or not it is the agent's current one. Each resource is
   * materialized for the caller as `agent-versions` requires (verbs from that version's own row,
   * `isCurrentVersion` from the pointer read together with it) and dropped when the caller cannot
   * fetch it. Results MUST follow first-occurrence input order, with at most one resource per pair,
   * omitting pairs matching no configuration. A global agent is not versioned: every pair naming it
   * resolves to its single code-defined version, returned once, whatever `agentVersion` the pair
   * asks for.
   */
  static async fetchByIdsAndVersions(
    auth: Authenticator,
    agentVersions: AgentVersionReference[],
    options: AgentFetchOptions = {}
  ): Promise<AgentResource[]> {
    const { dangerouslySkipFetchCheck = false } = options;
    const referenceKey = ({ agentId, agentVersion }: AgentVersionReference) =>
      isGlobalAgentId(agentId) ? agentId : `${agentId}:${agentVersion}`;
    const uniqueAgentVersions = uniqBy(agentVersions, referenceKey);
    const [globalAgentVersions, customAgentVersions] = partition(
      uniqueAgentVersions,
      ({ agentId }) => isGlobalAgentId(agentId)
    );

    const [customResources, globalResources] = await Promise.all([
      customAgentVersions.length > 0
        ? this.loadConfigurationVersions(auth, {
            where: {
              [Op.or]: customAgentVersions.map(({ agentId, agentVersion }) => ({
                sId: agentId,
                version: agentVersion,
              })),
            },
            dangerouslySkipFetchCheck,
          })
        : [],
      this.fetchGlobalAgents(
        auth,
        globalAgentVersions.map(({ agentId }) => agentId),
        options
      ),
    ]);

    if (options.withActions) {
      await this.loadCustomAgentActions(auth, customResources);
    }

    const resourcesByKey = new Map(
      [...customResources, ...globalResources].map((resource) => [
        referenceKey({
          agentId: resource.sId,
          agentVersion: resource.version,
        }),
        resource,
      ])
    );
    return removeNulls(
      uniqueAgentVersions.map((reference) =>
        resourcesByKey.get(referenceKey(reference))
      )
    );
  }

  static async fetchById(
    auth: Authenticator,
    agentId: string,
    options: AgentFetchOptions = {}
  ): Promise<AgentResource | null> {
    const [resource] = await this.fetchByIds(auth, [agentId], options);
    return resource ?? null;
  }

  /**
   * @cc [owner:avervaet,label:security] fetch-for-reader-or-workspace-admin
   * Returns `null` unless the caller holds `read` on the agent or is a workspace admin.
   */
  static async fetchByIdForReaderOrWorkspaceAdmin(
    auth: Authenticator,
    agentId: string
  ): Promise<AgentResource | null> {
    const agent = await this.fetchById(auth, agentId);
    if (!agent || (!auth.can("read", agent) && !auth.isAdmin())) {
      return null;
    }
    return agent;
  }

  // -- Versions: the configuration versions of an already-resolved agent --

  /**
   * @cc [owner:tdraier,label:backend;security] agent-versions
   * `fetchVersion`/`listVersions` resolve the configuration versions (current and previous) of this
   * agent, in its workspace. Each version is its own resource carrying that version's head fields,
   * version metadata, tools, tags and skills, and MUST be materialized for the supplied `auth`, like
   * every resolved resource, whatever authenticator `this` was resolved for: the caller's verbs are
   * those its own row grants (its stored scope, status and requested spaces, see `agent-verbs`), a
   * version the caller holds no verb on is dropped, and its `canViewContent` follows
   * `agent-content-visibility`. Their `isCurrentVersion` MUST compare against the
   * agent's current-version pointer read together with them, not the one `this` was loaded with. A
   * global agent is not versioned: it is its only version, resolved for `auth` as `fetchById` does.
   * A previous version is read-only: see `isCurrentVersion`.
   */
  async fetchVersion(
    auth: Authenticator,
    version: number
  ): Promise<AgentResource | null> {
    const [resource] = await this.loadVersions(auth, { version });
    return resource ?? null;
  }

  // Newest first, the `limit` newest ones when given.
  async listVersions(
    auth: Authenticator,
    { limit }: { limit?: number } = {}
  ): Promise<AgentResource[]> {
    return this.loadVersions(auth, { limit });
  }

  private async loadVersions(
    auth: Authenticator,
    { version, limit }: { version?: number; limit?: number }
  ): Promise<AgentResource[]> {
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);

    if (this.scope === "global") {
      return AgentResource.fetchGlobalAgents(auth, [this.sId]);
    }

    return AgentResource.loadConfigurationVersions(auth, {
      where: {
        agentId: this.id,
        ...(version !== undefined ? { version } : {}),
      },
      limit,
      dangerouslySkipFetchCheck: false,
    });
  }

  // The configuration versions matching `where` in the authed workspace, newest first, materialized
  // for the caller. One statement, so each row's agent `currentVersion` pointer is read
  // consistently with it. `dangerouslySkipFetchCheck` skips the `canFetch` drop (see
  // `agent-dangerous-fetch`).
  private static async loadConfigurationVersions(
    auth: Authenticator,
    {
      where,
      limit,
      dangerouslySkipFetchCheck,
    }: {
      where: WhereOptions<AgentConfigurationModel>;
      limit?: number;
      dangerouslySkipFetchCheck: boolean;
    }
  ): Promise<AgentResource[]> {
    const configurations = await AgentConfigurationModel.findAll({
      attributes: { exclude: [...AGENT_INSTRUCTIONS_ATTRIBUTES] },
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: [{ model: AgentModel, required: true }],
      order: [["version", "DESC"]],
      limit,
    });

    const versions = configurations.map((configuration) => {
      const { agent, ...configurationAttributes } =
        configuration.get() as Attributes<AgentConfigurationModel> & {
          agent: AgentModel;
        };
      return new AgentResource(agent.get(), configurationAttributes);
    });
    const adminCanSeePrivateEntities =
      await this.resolveAdminCanSeePrivateEntities(auth, versions);

    return versions
      .map((resource) =>
        resource.materialize(auth, { adminCanSeePrivateEntities })
      )
      .filter(
        (resource) => dangerouslySkipFetchCheck || resource.canFetch(auth)
      );
  }

  /**
   * @cc [owner:tdraier,label:backend] previous-version-read-only
   * A resource built on a configuration version other than the agent's current one (from
   * `fetchVersion`/`listVersions`, `fetchByIdsAndVersions` or
   * `dangerouslyFromConfigurationModels`) is read-only: the definition and lifecycle mutations that
   * act on the current version (`buildResaveParams`, `updateConfiguration`, `updateScopeInPlace`,
   * `archive`, `restore`) MUST refuse it, since they would rebuild or gate on a stale version.
   */
  get isCurrentVersion(): boolean {
    return this.version === this.currentVersion;
  }

  private assertCurrentVersion(): void {
    assert(
      this.isCurrentVersion,
      "Unexpected: mutating a previous version of an agent"
    );
  }

  // -- List resolvers: resolve matching agent ids, then hydrate through `fetchByIds` --

  /**
   * @cc [owner:tdraier,label:backend] agent-list-through-fetch-by-ids
   * The `listBy*`/`fetchByName` resolvers MUST NOT build resources themselves: they run a
   * lightweight id-only query for the matching agents, then hydrate through the shared
   * access-controlled resolver `fetchByIds`, so current-version resolution and access control stay
   * centralized (see `fetch-current-version`). Predicates on head fields (`name`, `status`, `scope`)
   * read the denormalized `agents` row directly; predicates on a version's rows (skills/tools/tags)
   * match the agent's CURRENT version only, joined via `agent.currentVersion`. The id queries against
   * `agents` never yield global agents; ids sourced elsewhere (e.g. favorites) may include globals,
   * which `fetchByIds` resolves through its global path.
   */
  private static async listCurrentVersionAgentIds(
    auth: Authenticator,
    {
      agentWhere,
      configurationWhere,
      configurationInclude,
    }: {
      agentWhere?: WhereOptions<AgentModel>;
      configurationWhere?: WhereOptions<AgentConfigurationModel>;
      configurationInclude?: Includeable[];
    } = {}
  ): Promise<string[]> {
    // Only join the configuration when a predicate targets the current version; head-field lists stay
    // on the `agents` row alone.
    const matchesCurrentVersion =
      configurationWhere !== undefined || configurationInclude !== undefined;

    const agents = await AgentModel.findAll({
      attributes: ["sId"],
      where: {
        ...agentWhere,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      include: matchesCurrentVersion
        ? [
            {
              model: AgentConfigurationModel,
              required: true,
              // Resolve the single current row via `agent.currentVersion` (mirrors `loadResource`).
              where: {
                version: { [Op.col]: "agent.currentVersion" },
                ...configurationWhere,
              },
              attributes: [],
              include: configurationInclude,
            },
          ]
        : undefined,
    });

    // A `hasMany` join (skills/tools/tags) can repeat an agent row per matching link; dedupe.
    return [...new Set(agents.map((agent) => agent.sId))];
  }

  /**
   * @cc [owner:tdraier,label:product] agent-fetch-by-name
   * Resolves the active agent the caller can fetch whose name equals `name`, ignoring case, or null.
   * A custom agent wins over a global one of the same name. When several custom agents match (active
   * names are unique only case-sensitively), the one named exactly `name` wins; otherwise the name
   * is ambiguous and nothing is returned.
   */
  static async fetchByName(
    auth: Authenticator,
    name: string
  ): Promise<AgentResource | null> {
    const lowerName = name.toLowerCase();
    const agentIds = await this.listCurrentVersionAgentIds(auth, {
      agentWhere: {
        status: "active",
        [Op.and]: [sequelizeWhere(fn("lower", col("agent.name")), lowerName)],
      },
    });
    const customMatches = await this.fetchByIds(auth, agentIds);
    if (customMatches.length > 0) {
      const exactMatch = customMatches.find(
        (resource) => resource.name === name
      );
      return (
        exactMatch ?? (customMatches.length === 1 ? customMatches[0] : null)
      );
    }

    const globalAgents = await this.listGlobalAgents(auth);
    return (
      globalAgents.find(
        (resource) =>
          resource.status === "active" &&
          resource.name.toLowerCase() === lowerName
      ) ?? null
    );
  }

  // Every global agent the workspace offers, disabled ones included (each carries its status), as
  // `getGlobalAgents` resolves them for the workspace's plan, flags and settings, filtered to what
  // the caller can fetch.
  static async listGlobalAgents(auth: Authenticator): Promise<AgentResource[]> {
    return this.fetchByIds(auth, listDefaultGlobalAgentIds());
  }

  /**
   * @cc [owner:tdraier,label:security;product] list-active-agents
   * Returns the active agents the caller can fetch, readable or not: the default global agents
   * (`listDefaultGlobalAgentIds`) first in their default order, then custom agents in name order.
   * Callers that surface the agents to be mentioned or run MUST use `listReadable` instead.
   */
  static async listActive(auth: Authenticator): Promise<AgentResource[]> {
    const [globalAgents, customAgents] = await Promise.all([
      this.listGlobalAgents(auth),
      this.listByWorkspace(auth),
    ]);

    return [
      ...globalAgents.filter((agent) => agent.status === "active"),
      ...customAgents.toSorted((a, b) => a.name.localeCompare(b.name)),
    ];
  }

  /**
   * @cc [owner:tdraier,label:security;product] list-readable-agents
   * Returns the agents of `listActive` (see `list-active-agents`, same order) the caller can
   * `read` (the ones they can mention and run), and no other. The default global agents leave out
   * Sidekick, Reinforcement, model-only and retired agents.
   */
  static async listReadable(auth: Authenticator): Promise<AgentResource[]> {
    return (await this.listActive(auth)).filter((agent) =>
      auth.can("read", agent)
    );
  }

  // Every agent of the authed workspace whose current status is in `status` (active by default),
  // filtered to what the caller can fetch.
  static async listByWorkspace(
    auth: Authenticator,
    {
      status = "active",
      scope,
      nameContains,
    }: {
      status?: AgentStatus | AgentStatus[];
      scope?: Exclude<AgentConfigurationScope, "global">;
      nameContains?: string;
    } = {}
  ): Promise<AgentResource[]> {
    const agentIds = await this.listCurrentVersionAgentIds(auth, {
      agentWhere: {
        status,
        ...(scope ? { scope } : {}),
        ...(nameContains !== undefined
          ? { name: { [Op.iLike]: `%${nameContains}%` } }
          : {}),
      },
    });
    return this.fetchByIds(auth, agentIds);
  }

  // Agents the current user has favorited. Favorites are keyed by agent `sId` (stable across
  // versions) and may include global agents, which `fetchByIds` resolves through its global path.
  /**
   * @cc [owner:adrsimon,label:product] favorites-exclude-non-default-global-agents
   * Favorited global agents MUST be returned only when among `listDefaultGlobalAgentIds`, so
   * retired and model-only global agents are never listed even if favorited.
   */
  static async listFavoritesForCurrentUser(
    auth: Authenticator
  ): Promise<AgentResource[]> {
    const defaultGlobalAgentIds = new Set<string>(listDefaultGlobalAgentIds());
    return this.fetchByIds(
      auth,
      (await this.listFavoriteIdsForCurrentUser(auth)).filter(
        (agentId) =>
          !isGlobalAgentId(agentId) || defaultGlobalAgentIds.has(agentId)
      )
    );
  }

  static async listFavoriteIdsForCurrentUser(
    auth: Authenticator
  ): Promise<string[]> {
    const user = auth.user();
    if (!user) {
      return [];
    }

    const relations = await AgentUserRelationModel.findAll({
      attributes: ["agentConfiguration"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        userId: user.id,
        favorite: true,
      },
    });

    return relations.map((relation) => relation.agentConfiguration);
  }

  // Agents `authorModelId` authored any version of (matches the legacy "created by me" view; the
  // current version's author may differ). The author lives on the configuration, not the denormalized
  // agent row, so this one predicate cannot read `AgentModel` alone.
  static async listByAuthor(
    auth: Authenticator,
    { authorModelId }: { authorModelId: ModelId }
  ): Promise<AgentResource[]> {
    const configurations = await AgentConfigurationModel.findAll({
      attributes: ["sId"],
      group: ["sId"],
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        authorId: authorModelId,
      },
    });

    return this.fetchByIds(
      auth,
      configurations.map((configuration) => configuration.sId)
    );
  }

  // Agents whose current version references one of the given skills (custom and/or code-defined).
  static async listBySkills(
    auth: Authenticator,
    {
      customSkillModelIds = [],
      globalSkillIds = [],
    }: { customSkillModelIds?: ModelId[]; globalSkillIds?: string[] }
  ): Promise<AgentResource[]> {
    if (customSkillModelIds.length === 0 && globalSkillIds.length === 0) {
      return [];
    }

    const skillMatchers = [
      ...(customSkillModelIds.length > 0
        ? [{ customSkillId: customSkillModelIds }]
        : []),
      ...(globalSkillIds.length > 0 ? [{ globalSkillId: globalSkillIds }] : []),
    ];
    const agentIds = await this.listCurrentVersionAgentIds(auth, {
      configurationInclude: [
        {
          model: AgentSkillModel,
          as: "skillAgentLinks",
          required: true,
          where: { [Op.or]: skillMatchers },
          attributes: [],
        },
      ],
    });

    return this.fetchByIds(auth, agentIds);
  }

  // Agents whose current version references one of the given MCP server views.
  static async listByMCPServerViewIds(
    auth: Authenticator,
    mcpServerViewModelIds: ModelId[]
  ): Promise<AgentResource[]> {
    if (mcpServerViewModelIds.length === 0) {
      return [];
    }

    const agentIds = await this.listCurrentVersionAgentIds(auth, {
      configurationInclude: [
        {
          model: AgentMCPServerConfigurationModel,
          as: "mcpServerConfigurations",
          required: true,
          where: { mcpServerViewId: mcpServerViewModelIds },
          attributes: [],
        },
      ],
    });

    return this.fetchByIds(auth, agentIds);
  }

  // Agents whose current version carries one of the given tags.
  static async listByTag(
    auth: Authenticator,
    tagModelIds: ModelId[]
  ): Promise<AgentResource[]> {
    if (tagModelIds.length === 0) {
      return [];
    }

    const agentIds = await this.listCurrentVersionAgentIds(auth, {
      configurationInclude: [
        {
          model: TagAgentModel,
          as: "agentTagLinks",
          required: true,
          where: { tagId: tagModelIds },
          attributes: [],
        },
      ],
    });

    return this.fetchByIds(auth, agentIds);
  }

  // Oldest first, the pending agents created before `createdBefore`, for the purge. Not
  // `canFetch`-filtered: the purge runs as an internal admin over every pending agent.
  static async dangerouslyListExpiredPendingAgents(
    auth: Authenticator,
    { createdBefore, limit }: { createdBefore: Date; limit: number }
  ): Promise<AgentResource[]> {
    const configurations = await AgentConfigurationModel.findAll({
      where: {
        status: "pending",
        createdAt: { [Op.lt]: createdBefore },
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      limit,
      order: [["createdAt", "ASC"]],
    });
    return this.dangerouslyFromConfigurationModels(auth, configurations);
  }

  // Caller-independent query: the current resource of each identified agent — the row whose
  // `version` equals the agent's `currentVersion` pointer, joined via the unique `(agentId, version)`
  // index — one per agent, scoped to the workspace. No read-access decision is folded in; that is the
  // caller's job (see `fetchByIds`). Takes a bare `workspaceId` so both the
  // access-controlled resolvers and the cache seam can share it.
  private static async loadResource(
    workspaceId: ModelId,
    identityWhere: { id: ModelId[] } | { sId: string[] }
  ): Promise<AgentResource[]> {
    // Driven from `agents` (its unique `sId` / PK index) with the current configuration inner-joined
    // on `agent_configuration.version = agent.currentVersion`, so the single current row is resolved
    // through the unique `(agentId, version)` index instead of scanning every version.
    const agents = await AgentModel.findAll({
      where: {
        ...identityWhere,
        workspaceId,
      },
      include: [
        {
          model: AgentConfigurationModel,
          required: true,
          attributes: { exclude: [...AGENT_INSTRUCTIONS_ATTRIBUTES] },
          where: { version: { [Op.col]: "agent.currentVersion" } },
        },
      ],
    });

    return agents.flatMap((agent) => {
      const { agent_configurations: configurations, ...agentAttributes } =
        agent.get() as Attributes<AgentModel> & {
          agent_configurations: AgentConfigurationModel[];
        };
      return configurations.map(
        (configuration) =>
          new AgentResource(agentAttributes, configuration.get())
      );
    });
  }

  /**
   * @cc [owner:flvndvd,label:backend] agent-batch-loader-alignment
   * Inputs MUST be a nonempty batch from one workspace. Results MUST preserve input positions,
   * returning null for each missing agent.
   */
  private static async loadManyFromDatabase(
    inputs: readonly AgentResourceCacheKey[]
  ): Promise<(AgentResource | null)[]> {
    assert(inputs.length > 0, "Agent cache batches must not be empty");
    const { workspaceModelId } = inputs[0];
    assert(
      inputs.every((input) => input.workspaceModelId === workspaceModelId),
      "Agent cache batches must belong to one workspace"
    );
    const resources = await this.loadResource(workspaceModelId, {
      sId: inputs.map(({ id }) => id),
    });
    const resourcesById = new Map(
      resources.map((resource) => [resource.sId, resource])
    );
    return inputs.map(({ id }) => resourcesById.get(id) ?? null);
  }

  /**
   * @cc [owner:tdraier,label:backend;performance] agent-resource-cache
   * The cache holds the caller-independent resource; the caller-dependent gates MUST NOT be cached:
   * `materialize` MUST run on every read, and the `canFetch` drop on every read except with
   * `dangerouslySkipFetchCheck` (see `agent-dangerous-fetch`). Entries have no TTL, so every write
   * that changes or deletes an agent's cached version MUST invalidate its entry — via
   * `AgentResource.invalidateCache` here, or the leaf `invalidateAgentResourceCache`/
   * `invalidateAgentResourceCaches` helpers that lower-level write and deletion paths can import
   * without forming a cycle back to this resource.
   */
  private static readonly store = defineCachedResourceValue<
    AgentResourceCacheKey,
    AgentResourceSnapshot,
    AgentResource
  >({
    id: AGENT_RESOURCE_CACHE_ID,
    version: AGENT_RESOURCE_CACHE_VERSION,
    key: agentResourceCacheKey,
    mode: AGENT_RESOURCE_CACHE_MODE,
    loadManyFromDatabase: (inputs) =>
      AgentResource.loadManyFromDatabase(inputs),
    toSnapshot: (cachedResource) => cachedResource.toSnapshot(),
    fromSnapshot: (snapshot) => AgentResource.fromSnapshot(snapshot),
  });

  /**
   * @cc [owner:flvndvd,label:backend;security] agent-store-workspace
   * Batch reads MUST derive the workspace for every lookup key from the supplied Authenticator.
   */
  private static fetchManyFromStore(
    auth: Authenticator,
    agentIds: readonly string[]
  ): Promise<AgentResource[]> {
    const workspaceModelId = auth.getNonNullableWorkspace().id;
    return this.store.fetchMany(
      agentIds.map((id) => ({ workspaceModelId, id }))
    );
  }

  static async invalidateCache(
    workspaceId: ModelId,
    sId: string,
    transaction?: Transaction
  ): Promise<void> {
    await invalidateAgentResourceCache(workspaceId, sId, transaction);
  }

  // Serializes a resource to its cached JSON snapshot. See `AgentResourceSnapshot`.
  // Only custom agents' current versions are cached (see `loadResource`); this tripwire refuses to
  // serialize a global resource even if a future path reaches it off the load path.
  toSnapshot(): AgentResourceSnapshot {
    assert(
      this.scope !== "global",
      "Unexpected: attempted to cache a global AgentResource"
    );
    const { modelConfiguration } = this;

    return {
      agentModelId: this.id,
      agentConfigurationModelId: this.agentConfigurationModelId,
      workspaceId: this.workspaceId,
      sId: this.sId,
      createdAt: this.createdAt.getTime(),
      scope: this.scope,
      name: this.name,
      description: this.description,
      status: this.status,
      pictureUrl: this.pictureUrl,
      templateId: this.templateId,
      reinforcement: this.reinforcement,
      lastReinforcementAnalysisAt:
        this.lastReinforcementAnalysisAt?.getTime() ?? null,
      versionAuthorId: this.versionAuthorId,
      requestedSpaceIds: this.requestedSpaceIds,
      modelConfiguration: {
        providerId: modelConfiguration.providerId,
        modelId: modelConfiguration.modelId,
        temperature: modelConfiguration.temperature,
        reasoningEffort: modelConfiguration.reasoningEffort ?? null,
        responseFormat: modelConfiguration.responseFormat ?? null,
      },
      version: this.version,
      maxStepsPerRun: this.maxStepsPerRun,
      creditSpendCheckpointThresholdAwuCredits:
        this.creditSpendCheckpointThresholdAwuCredits,
      versionCreatedAt: this.versionCreatedAt.getTime(),
      versionUpdatedAt: this.versionUpdatedAt.getTime(),
    };
  }

  static fromSnapshot(snapshot: AgentResourceSnapshot): AgentResource {
    const { modelConfiguration } = snapshot;
    assert(
      snapshot.versionAuthorId !== null,
      "Unexpected: cached custom agent is missing its author"
    );
    assert(
      isAgentStatus(snapshot.status),
      `Unexpected: cached agent has non-agent status "${snapshot.status}"`
    );
    assert(
      snapshot.scope !== "global",
      "Unexpected: cached a global AgentResource"
    );
    const lastReinforcementAnalysisAt =
      snapshot.lastReinforcementAnalysisAt !== null
        ? new Date(snapshot.lastReinforcementAnalysisAt)
        : null;

    return new AgentResource(
      {
        id: snapshot.agentModelId,
        workspaceId: snapshot.workspaceId,
        sId: snapshot.sId,
        createdAt: new Date(snapshot.createdAt),
        // `updatedAt` is not surfaced on the resource; the version's stands in harmlessly.
        updatedAt: new Date(snapshot.versionUpdatedAt),
        // The cached row is the current version, so its version is the agent's `currentVersion`.
        currentVersion: snapshot.version,
        name: null,
        status: null,
        scope: null,
        reinforcement: null,
        lastReinforcementAnalysisAt: null,
        templateId: null,
      },
      {
        id: snapshot.agentConfigurationModelId,
        workspaceId: snapshot.workspaceId,
        sId: snapshot.sId,
        createdAt: new Date(snapshot.versionCreatedAt),
        updatedAt: new Date(snapshot.versionUpdatedAt),
        version: snapshot.version,
        agentId: snapshot.agentModelId,
        status: snapshot.status,
        scope: snapshot.scope,
        name: snapshot.name,
        description: snapshot.description,
        instructions: null,
        instructionsHtml: null,
        providerId: modelConfiguration.providerId,
        modelId: modelConfiguration.modelId,
        temperature: modelConfiguration.temperature,
        reasoningEffort: modelConfiguration.reasoningEffort ?? null,
        responseFormat: modelConfiguration.responseFormat ?? undefined,
        pictureUrl: snapshot.pictureUrl,
        authorId: snapshot.versionAuthorId,
        maxStepsPerRun: snapshot.maxStepsPerRun,
        creditSpendCheckpointThresholdAwuCredits:
          snapshot.creditSpendCheckpointThresholdAwuCredits,
        templateId: snapshot.templateId,
        reinforcement: snapshot.reinforcement,
        lastReinforcementAnalysisAt,
        requestedSpaceIds: snapshot.requestedSpaceIds,
      }
    );
  }

  async listSuggestedPrompts(auth: Authenticator): Promise<string[]> {
    const row = await AgentSuggestedPromptsModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfigurationId: this.sId,
      },
    });

    return row?.prompts ?? [];
  }

  /**
   * @cc [owner:adrsimon,label:backend;product] set-suggested-prompts-replaces-list
   * After success, `listSuggestedPrompts` MUST return exactly `prompts`, in that order. The
   * replacement MUST be atomic: a failure leaves the previous list untouched.
   */
  async setSuggestedPrompts(
    auth: Authenticator,
    prompts: string[]
  ): Promise<void> {
    await AgentSuggestedPromptsModel.upsert(
      {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfigurationId: this.sId,
        prompts,
      },
      { conflictFields: ["workspaceId", "agentConfigurationId"] }
    );
  }

  async listEditors(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<UserResource[] | null> {
    const editorsByAgentId = await AgentResource.batchListEditors(
      auth,
      [this],
      {
        transaction,
      }
    );
    const editors = editorsByAgentId.get(this);
    assert(editors !== undefined);

    return editors;
  }

  /**
   * @cc [owner:philipperolet,label:backend] editor-results-by-agent
   * Each input agent has a map entry (see `batch-results-by-resource`): `null` for globals and
   * active workspace members of its editor grant for custom agents, or `[]` when there are none or
   * the caller holds neither `read` nor `admin` on it (see `editors-require-read-or-admin`).
   */
  /**
   * @cc [owner:sfriquet,label:security] editors-require-read-or-admin
   * A custom agent's editors MUST be `[]` unless the caller holds `read` or `admin` on it.
   */
  static async batchListEditors(
    auth: Authenticator,
    agents: AgentResource[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Map<AgentResource, UserResource[] | null>> {
    const result = new Map<AgentResource, UserResource[] | null>(
      agents.map((agent) => [agent, agent.scope === "global" ? null : []])
    );
    const customAgents = agents.filter(
      (agent) =>
        agent.scope !== "global" &&
        (auth.can("read", agent) || auth.can("admin", agent))
    );
    if (customAgents.length === 0) {
      return result;
    }

    const editorGrant = (agent: AgentResource) => ({
      grantType: "editor" as const,
      resourceType: "agent" as const,
      resourceId: agent.id,
    });
    const groupByGrant =
      await GroupPermissionResource.findRegularAutoGroupsForGrants(auth, {
        grants: customAgents.map(editorGrant),
        transaction,
      });
    const groupByAgentModelId = new Map<ModelId, GroupResource>(
      removeNulls(
        customAgents.map((agent) => {
          const group = groupByGrant.get(grantKey(editorGrant(agent)));
          return group ? ([agent.id, group] as const) : null;
        })
      )
    );
    const membershipsByGroupId =
      await GroupResource.getActiveMembershipsForGroups(
        auth,
        [...groupByAgentModelId.values()],
        { transaction }
      );
    const userModelIds = [
      ...new Set(Object.values(membershipsByGroupId).flat()),
    ];
    const users = await UserResource.fetchByModelIds(userModelIds, {
      transaction,
    });
    const activeUsers = await MembershipResource.filterActiveMembers({
      users,
      workspace: auth.getNonNullableWorkspace(),
      transaction,
    });
    const userByModelId = new Map(activeUsers.map((user) => [user.id, user]));

    for (const agent of customAgents) {
      const group = groupByAgentModelId.get(agent.id);
      const memberModelIds = group
        ? (membershipsByGroupId[group.id] ?? [])
        : [];
      result.set(
        agent,
        removeNulls(
          memberModelIds.map((userModelId) => userByModelId.get(userModelId))
        )
      );
    }

    return result;
  }

  // Global agents' tools are code-defined and depend on workspace data (data sources, tool views),
  // so they are only built, through the full global agent build, when asked for.
  // Loads, in one tools lookup, the tools of the custom resources whose content the caller can view
  // and keeps them on the resources (see `resolved-agent-actions`).
  private static async loadCustomAgentActions(
    auth: Authenticator,
    resources: AgentResource[]
  ): Promise<void> {
    const viewableResources = resources.filter(
      (resource) => resource.scope !== "global" && resource.canViewContent
    );
    if (viewableResources.length === 0) {
      return;
    }

    const actionsByConfigurationModelId =
      await fetchMCPServerActionConfigurations(auth, {
        configurationModelIds: uniq(
          viewableResources.map(
            (resource) => resource.agentConfigurationModelId
          )
        ),
        variant: "full",
      });
    for (const resource of viewableResources) {
      resource._actions =
        actionsByConfigurationModelId.get(resource.agentConfigurationModelId) ??
        [];
    }
  }

  async listActions(
    auth: Authenticator,
    options: AgentActionsFetchOptions = {}
  ): Promise<MCPServerConfigurationType[]> {
    const actionsByAgent = await AgentResource.batchListActions(
      auth,
      [this],
      options
    );
    const actions = actionsByAgent.get(this);
    assert(actions !== undefined);

    return actions;
  }

  /**
   * @cc [owner:tdraier,label:security] actions-require-read
   * Tools belong to a configuration version (see `batch-results-by-resource`). An agent whose
   * content the caller cannot view (see `agent-content-visibility`) MUST get `[]`: its tools carry
   * its knowledge (data sources, tables), as private as its instructions. The only exception is
   * `permissionFiltering: "dangerously_skip"`, reserved for carrying a version's tools over
   * unchanged when re-saving it (`buildResaveParams`); its result MUST NOT be exposed to the caller.
   */
  /**
   * @cc [owner:tdraier,label:performance] actions-batched-per-kind
   * A call MUST run at most one tools lookup for its custom agents (by configuration row) and one
   * full global agent build for its global agents, whatever the number of input agents: no lookup
   * or build per agent.
   */
  static async batchListActions(
    auth: Authenticator,
    agents: AgentResource[],
    { permissionFiltering = "default" }: AgentActionsFetchOptions = {}
  ): Promise<Map<AgentResource, MCPServerConfigurationType[]>> {
    const isListable = (agent: AgentResource) =>
      permissionFiltering === "dangerously_skip" ||
      agent.resolveCanViewContent(auth);
    const agentsToLookUp = agents.filter(
      (agent) => isListable(agent) && agent._actions === null
    );
    const [globalAgents, customAgents] = partition(
      agentsToLookUp,
      (agent) => agent.scope === "global"
    );

    const [actionsByConfigurationModelId, globalConfigurations] =
      await Promise.all([
        customAgents.length > 0
          ? fetchMCPServerActionConfigurations(auth, {
              configurationModelIds: customAgents.map(
                (agent) => agent.agentConfigurationModelId
              ),
              variant: "full",
            })
          : new Map<ModelId, MCPServerConfigurationType[]>(),
        globalAgents.length > 0
          ? getGlobalAgents(
              auth,
              uniq(globalAgents.map((agent) => agent.sId)),
              "full"
            )
          : [],
      ]);
    const globalActionsById = new Map(
      globalConfigurations.map((configuration) => [
        configuration.sId,
        configuration.actions,
      ])
    );

    return new Map(
      agents.map((agent) => {
        if (!isListable(agent)) {
          return [agent, []];
        }
        const actions =
          agent._actions ??
          (agent.scope === "global"
            ? globalActionsById.get(agent.sId)
            : actionsByConfigurationModelId.get(
                agent.agentConfigurationModelId
              ));
        return [agent, actions ?? []];
      })
    );
  }

  async listTags(auth: Authenticator): Promise<TagResource[]> {
    const tagsByAgent = await AgentResource.batchListTags(auth, [this]);
    const tags = tagsByAgent.get(this);
    assert(tags !== undefined);

    return tags;
  }

  /**
   * @cc [owner:tdraier,label:backend] tag-results-by-version
   * Tags attach to a configuration version, not to the agent across versions (see
   * `batch-results-by-resource`); an agent with no tag gets `[]`. Global agents MUST get `[]`
   * without a tag lookup: they hold no tag row and share a sentinel configuration id.
   */
  static async batchListTags(
    auth: Authenticator,
    agents: AgentResource[]
  ): Promise<Map<AgentResource, TagResource[]>> {
    const customAgents = agents.filter((agent) => agent.scope !== "global");
    const tagsByConfigurationModelId =
      customAgents.length > 0
        ? await TagResource.listForAgents(
            auth,
            uniq(customAgents.map((agent) => agent.agentConfigurationModelId))
          )
        : {};

    return new Map(
      agents.map((agent) => [
        agent,
        agent.scope === "global"
          ? []
          : (tagsByConfigurationModelId[agent.agentConfigurationModelId] ?? []),
      ])
    );
  }

  static async listEditorConfigModelIds(
    auth: Authenticator
  ): Promise<ModelId[]> {
    const resources = auth.getResourceIdsWithVerb("agent", "write");
    const where =
      resources.kind === "all" ? {} : { agentId: resources.resourceIds };
    // agentId is indexed for the normal per-user path; workspaceId indexes the rare type-wide path.
    const configurations = await AgentConfigurationModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      attributes: ["id"],
    });

    return configurations.map((configuration) => configuration.id);
  }

  async grantEditors(
    auth: Authenticator,
    { editors, transaction }: { editors: UserType[]; transaction: Transaction }
  ): Promise<void> {
    assert(this.scope !== "global");
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);

    const grantResult = await GroupPermissionResource.grantToUsers(auth, {
      users: editors,
      grantType: "editor",
      resourceType: "agent",
      resourceId: this.id,
      transaction,
    });
    if (grantResult.isErr()) {
      throw grantResult.error;
    }
  }

  async revokeEditors(
    auth: Authenticator,
    { editors, transaction }: { editors: UserType[]; transaction: Transaction }
  ): Promise<void> {
    assert(this.scope !== "global");
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);

    const revokeResult = await GroupPermissionResource.revokeFromUsers(auth, {
      users: editors,
      grantType: "editor",
      resourceType: "agent",
      resourceId: this.id,
      transaction,
    });
    if (revokeResult.isErr()) {
      throw revokeResult.error;
    }
  }

  /**
   * @cc [owner:philipperolet,label:security;product] editor-removal-uses-grants
   * Translating add/remove deltas MUST validate against the grant-backed editor set (`listEditors`):
   * removing a user who holds no editor grant MUST fail with `user_not_member`, and adding a user who
   * already holds one MUST fail with `user_already_member`. Neither changes any grant.
   */
  // Applies add/remove editor deltas by translating them into the complete editor set and persisting
  // it through `updateConfiguration` (the single editor-edit path, admin-gated and in place). The
  // caller owns fetching/gating `this`.
  async updateEditorsFromDelta(
    auth: Authenticator,
    {
      usersToAdd,
      usersToRemove,
    }: { usersToAdd: UserResource[]; usersToRemove: UserResource[] }
  ): Promise<Result<AgentResource, DustError<EditorDeltaErrorCode>>> {
    const currentEditors = (await this.listEditors(auth)) ?? [];
    const currentEditorModelIds = new Set(currentEditors.map((u) => u.id));

    if (usersToAdd.some((u) => currentEditorModelIds.has(u.id))) {
      return new Err(
        new DustError(
          "user_already_member",
          "The user is already a member of the agent editors group."
        )
      );
    }

    if (usersToRemove.some((u) => !currentEditorModelIds.has(u.id))) {
      return new Err(
        new DustError(
          "user_not_member",
          "The user is not a member of the agent editors group."
        )
      );
    }

    const removeEditorModelIds = new Set(usersToRemove.map((u) => u.id));
    const nextEditors = [
      ...currentEditors.filter((u) => !removeEditorModelIds.has(u.id)),
      ...usersToAdd,
    ].map((u) => u.toJSON());

    const updateRes = await this.updateConfiguration(auth, {
      editors: nextEditors,
    });
    if (updateRes.isErr()) {
      const { error } = updateRes;
      if (error instanceof DustError && error.code === "user_not_found") {
        return new Err(
          new DustError(
            "user_not_found",
            "The user was not found in the workspace."
          )
        );
      }
      return new Err(new DustError("internal_error", error.message));
    }

    return new Ok(updateRes.value.resource);
  }

  // Sets the requesting user's favorite flag for this agent. Favoriting is a per-user relation keyed
  // by the agent's stable `sId` (shared across versions), so it needs no `content`. Callers resolve
  // and read-gate the resource (e.g. `fetchById` + `auth.can("read", ...)`) before calling.
  async setUserFavorite(
    auth: Authenticator,
    favorite: boolean
  ): Promise<Result<undefined, Error>> {
    if (this.status !== "active") {
      return new Err(new Error("Agent is not active"));
    }

    await AgentUserRelationModel.upsert({
      userId: auth.getNonNullableUser().id,
      workspaceId: auth.getNonNullableWorkspace().id,
      agentConfiguration: this.sId,
      favorite,
    });

    await AgentResource.launchSearchIndexation(auth, [this.sId]);

    return new Ok(undefined);
  }

  /**
   * @cc [owner:tdraier,label:backend;architecture] agent-skill-links-created-by-agent-save
   * Runtime code MUST create `AgentSkillModel` rows only through this helper, called by the agent
   * save to link the given skills to the configuration version it writes. It performs no agent
   * refresh: the save owns the cache invalidation and search reindex of the saved agent.
   */
  private static async createSkillLinks(
    auth: Authenticator,
    {
      agentConfigurationModelId,
      skills,
      transaction,
    }: {
      agentConfigurationModelId: ModelId;
      skills: SkillResource[];
      transaction: Transaction;
    }
  ): Promise<void> {
    if (skills.length === 0) {
      return;
    }

    await AgentSkillModel.bulkCreate(
      skills.map((skill) => ({
        ...skill.skillReference,
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfigurationId: agentConfigurationModelId,
      })),
      { transaction }
    );
  }

  // Delegates to the standalone launcher shared with the write paths that cannot import this
  // resource (see the `agent-search-after-commit` contract).
  static async launchSearchIndexation(
    auth: Authenticator,
    agentIds: string[],
    transaction?: Transaction
  ): Promise<void> {
    await launchAgentSearchIndexation(
      auth.getNonNullableWorkspace().sId,
      agentIds,
      transaction
    );
  }

  // The agent's favorite relations are keyed by `sId`, so the count spans every version.
  async countFavorites(auth: Authenticator): Promise<number> {
    return AgentUserRelationModel.count({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfiguration: this.sId,
        favorite: true,
      },
    });
  }

  // Favorites are keyed by `sId`, so each count spans every version of its agent.
  static async batchCountFavorites(
    auth: Authenticator,
    agents: AgentResource[]
  ): Promise<Map<AgentResource, number>> {
    if (agents.length === 0) {
      return new Map();
    }

    const rows = await AgentUserRelationModel.count({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentConfiguration: uniq(agents.map((agent) => agent.sId)),
        favorite: true,
      },
      group: ["agentConfiguration"],
    });
    const countByAgentId = new Map<string, number>();
    for (const { agentConfiguration, count } of rows) {
      if (isString(agentConfiguration)) {
        countByAgentId.set(agentConfiguration, count);
      }
    }

    return new Map(
      agents.map((agent) => [agent, countByAgentId.get(agent.sId) ?? 0])
    );
  }

  /**
   * @cc [owner:tdraier,label:backend;performance] agent-user-merge-through-agent-domain
   * A user identity merge MUST move the secondary user's agent authorship (`authorId` on every
   * configuration version) and agent-user relations to the primary user through this method, so the
   * cache invalidation of every reassigned agent and the search reindex of every reassigned agent
   * and every agent whose duplicate relation was dropped stay owned by the agent domain. When both
   * users hold a relation to the same agent, the primary's is kept and the secondary's is deleted.
   * Callers MUST invoke it after migrating the secondary user's group memberships (which carry agent
   * editor grants), so the reindex sees the final editors. Returns the number of configuration
   * versions and relations transferred.
   */
  static async mergeUsers(
    auth: Authenticator,
    {
      primaryUserModelId,
      secondaryUserModelId,
    }: {
      primaryUserModelId: ModelId;
      secondaryUserModelId: ModelId;
    }
  ): Promise<{
    agentConfigurationsCount: number;
    agentUserRelationsCount: number;
  }> {
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    const [agentConfigurationsCount, reassignedConfigurations] =
      await AgentConfigurationModel.update(
        { authorId: primaryUserModelId },
        {
          where: {
            authorId: secondaryUserModelId,
            workspaceId: workspaceModelId,
          },
          returning: ["sId"],
        }
      );
    const reassignedAgentIds = reassignedConfigurations.map(
      (configuration) => configuration.sId
    );
    await invalidateAgentResourceCaches(workspaceModelId, reassignedAgentIds);

    const primaryRelations = await AgentUserRelationModel.findAll({
      attributes: ["agentConfiguration"],
      where: { userId: primaryUserModelId, workspaceId: workspaceModelId },
    });
    const duplicateRelations = await AgentUserRelationModel.findAll({
      attributes: ["agentConfiguration"],
      where: {
        userId: secondaryUserModelId,
        workspaceId: workspaceModelId,
        agentConfiguration: primaryRelations.map(
          (relation) => relation.agentConfiguration
        ),
      },
    });
    const deduplicatedAgentIds = duplicateRelations.map(
      (relation) => relation.agentConfiguration
    );
    await AgentUserRelationModel.destroy({
      where: {
        userId: secondaryUserModelId,
        workspaceId: workspaceModelId,
        agentConfiguration: deduplicatedAgentIds,
      },
    });
    const [agentUserRelationsCount] = await AgentUserRelationModel.update(
      { userId: primaryUserModelId },
      { where: { userId: secondaryUserModelId, workspaceId: workspaceModelId } }
    );

    // The indexed `last_edited_by_user_id` follows the version author and `favorite_count` drops
    // with a deleted duplicate favorite.
    await AgentResource.launchSearchIndexation(auth, [
      ...reassignedAgentIds,
      ...deduplicatedAgentIds,
    ]);

    return { agentConfigurationsCount, agentUserRelationsCount };
  }

  // Applies the same partial change to a batch of agents by running each through `updateConfiguration`,
  // so every rule holds per agent: per-property permissions, the version-or-in-place routing, the
  // no-op skip, and the scope/editor in-place writes with their audit and trigger side effects.
  // `loadResource` resolves rows caller-independently so an editor/admin is not blocked on agents
  // backed by spaces they cannot read ("Show hidden agents"). An archived agent, one the caller may
  // not change, or one that fails to save is reported as skipped.
  static async bulkUpdate(
    auth: Authenticator,
    agentIds: string[],
    update: AgentConfigurationUpdate
  ): Promise<BulkAgentUpdateResult> {
    if (agentIds.length === 0) {
      return { updatedAgentIds: [], skippedAgentIds: [] };
    }

    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const resources = (
      await this.loadResource(workspaceModelId, { sId: agentIds })
    ).filter((r) => r.status !== "archived");

    const saveResults = await concurrentExecutor(
      resources,
      async (r): Promise<{ sId: string; isUpdated: boolean }> => {
        const res = await r.updateConfiguration(auth, update);
        if (res.isErr()) {
          logger.warn(
            {
              workspaceId: auth.getNonNullableWorkspace().sId,
              agentConfigurationId: r.sId,
              error: res.error,
            },
            "Skipped agent in bulk update"
          );
        }
        return { sId: r.sId, isUpdated: res.isOk() };
      },
      { concurrency: BULK_UPDATE_CONCURRENCY }
    );

    const updatedAgentIds = saveResults
      .filter((result) => result.isUpdated)
      .map((result) => result.sId);
    const updatedIdSet = new Set(updatedAgentIds);
    const skippedAgentIds = agentIds.filter((id) => !updatedIdSet.has(id));
    return { updatedAgentIds, skippedAgentIds };
  }

  // Builds the save params that recreate this agent's current version as-is — its full configuration,
  // including tags, editors, tools and skills. Override a field on the result to save a new version
  // that changes only that (e.g. the model in a bulk model update). Requires `canViewContent`.
  async buildResaveParams(
    auth: Authenticator
  ): Promise<SaveAgentConfigurationParams> {
    // Loaded custom agents are never global, and their stored status is always an `AgentStatus`
    // (the `disabled_*` values are global-only); narrow both from the resource's wider types.
    assert(this.scope !== "global");
    assert(
      this.canViewContent,
      "Unexpected: re-saving an agent whose content the caller cannot view"
    );
    this.assertCurrentVersion();
    if (!isAgentStatus(this.status)) {
      throw new Error(
        `Unexpected: non-global agent ${this.sId} has status "${this.status}".`
      );
    }

    const [content, tags, editors, skills, allActions] = await Promise.all([
      this.fetchInstructions(),
      this.listTags(auth),
      this.listEditors(auth),
      // No space filtering: tools and skills are carried over as-is, so re-saving an agent behind a
      // space the caller cannot read keeps them rather than dropping them.
      this.listSkills(auth, { permissionFiltering: "dangerously_skip" }),
      this.listActions(auth, { permissionFiltering: "dangerously_skip" }),
    ]);
    const actions = allActions.filter(isServerSideMCPServerConfiguration);

    return {
      name: this.name,
      description: this.description,
      instructions: content.instructions,
      instructionsHtml: content.instructionsHtml,
      pictureUrl: this.pictureUrl,
      status: this.status,
      scope: this.scope,
      model: this.modelConfiguration,
      templateId: this.templateId
        ? TemplateResource.modelIdToSId({ id: this.templateId })
        : null,
      requestedSpaceIds: this.requestedSpaceIds,
      tags: tags.map((tag) => tag.toJSON()),
      editors: (editors ?? []).map((editor) => editor.toJSON()),
      // Preserve the version's author rather than re-attributing it to the caller.
      authorId: this.versionAuthorId ?? auth.getNonNullableUser().id,
      reinforcement: this.reinforcement,
      ignoreCreditSpendThresholdAlert:
        this.creditSpendCheckpointThresholdAwuCredits === null,
      actions,
      skills,
    };
  }

  private static async disableTriggersForNonEditors(
    auth: Authenticator,
    agents: AgentResource[]
  ): Promise<void> {
    const triggers = await TriggerResource.listByAgentConfigurationIds(
      auth,
      agents.map((a) => a.sId)
    );
    if (triggers.length === 0) {
      return;
    }

    const editorsByAgent = await this.batchListEditors(auth, agents);
    const editorModelIdsByAgentId = new Map(
      [...editorsByAgent].map(([agent, editors]) => [
        agent.sId,
        new Set((editors ?? []).map((editor) => editor.id)),
      ])
    );
    const triggersToDisable = triggers.filter(
      (trigger) =>
        !editorModelIdsByAgentId
          .get(trigger.agentConfigurationId)
          ?.has(trigger.editor)
    );
    if (triggersToDisable.length === 0) {
      return;
    }

    const res = await TriggerResource.disableMany(auth, triggersToDisable);
    if (res.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          error: res.error,
        },
        "Failed to disable triggers when changing agent scope to hidden"
      );
    }
  }

  /**
   * Makes `configuration`, one of the agent's own rows, the current one and mirrors its head
   * fields. Called by every path that inserts a configuration row, activates a pending one or
   * deletes the current one (see `agent-current-version-pointer` on `AgentModel`).
   */
  async setCurrentConfiguration(
    auth: Authenticator,
    configuration: AgentConfigurationModel,
    { transaction }: { transaction: Transaction }
  ): Promise<void> {
    assert(this.scope !== "global");
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);
    assert(
      configuration.agentId === this.id,
      "Unexpected: configuration belongs to another agent"
    );

    // Moves the version pointer and mirrors the head fields of the row becoming current.
    await AgentModel.update(
      {
        currentVersion: configuration.version,
        name: configuration.name,
        status: configuration.status,
        scope: configuration.scope,
        reinforcement: configuration.reinforcement,
        lastReinforcementAnalysisAt: configuration.lastReinforcementAnalysisAt,
        templateId: configuration.templateId,
      },
      { where: { id: this.id, workspaceId: this.workspaceId }, transaction }
    );
  }

  private async updateAgentIdentity(
    auth: Authenticator,
    fields: Partial<
      Pick<
        AgentConfigurationModel,
        | "name"
        | "status"
        | "scope"
        | "reinforcement"
        | "lastReinforcementAnalysisAt"
        | "templateId"
      >
    >,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<boolean> {
    const workspaceId = auth.getNonNullableWorkspace().id;
    assert(workspaceId === this.workspaceId);

    return withTransaction(async (t) => {
      const agent = await AgentModel.findOne({
        where: { id: this.id, workspaceId },
        transaction: t,
      });
      if (!agent) {
        return false;
      }

      const [updatedCount] = await AgentConfigurationModel.update(fields, {
        where: {
          agentId: this.id,
          workspaceId,
          version: agent.currentVersion,
        },
        transaction: t,
      });

      await AgentModel.update(fields, {
        where: { id: this.id, workspaceId },
        transaction: t,
      });

      return updatedCount > 0;
    }, transaction);
  }

  // Front door for the requested-spaces cascade. The write, cache invalidation and reindex live in
  // the leaf `agent_requested_spaces` module (see `requested-spaces-cascade-through-agent-domain`),
  // which callers below `AgentResource` in the module graph (e.g. `SkillResource`) import directly —
  // they cannot value-import this class without forming a cycle (`agent_resource` already depends on
  // `skill_resource`). Callers that can import the class should prefer this method.
  static async updateRequestedSpaceIdsInPlace(
    auth: Authenticator,
    args: { agentConfigurationModelId: ModelId; newSpaceIds: ModelId[] },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<boolean, Error>> {
    return updateAgentRequestedSpaceIdsInPlace(auth, args, { transaction });
  }

  /**
   * Deletes the agent's permission rows and their regular_auto groups.
   * Only call after deleting the last configuration of the logical agent.
   */
  async destroyPermissionsAndGroups(
    auth: Authenticator,
    { transaction }: { transaction: Transaction }
  ): Promise<void> {
    assert(this.scope !== "global");
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);

    await AgentResource.batchDestroyPermissionsAndGroups(auth, [this], {
      transaction,
    });
  }

  // Removes the agent grants and deletes the now-orphaned `regular_auto` editor groups for a set of
  // agents, batched so the work does not scale per agent (see `batch-database-queries`).
  private static async batchDestroyPermissionsAndGroups(
    auth: Authenticator,
    agents: AgentResource[],
    { transaction }: { transaction: Transaction }
  ): Promise<void> {
    if (agents.length === 0) {
      return;
    }

    const resourceIds = agents.map((agent) => agent.id);
    const grantGroups =
      await GroupPermissionResource.listRegularAutoGroupsForResources(auth, {
        resourceType: "agent",
        resourceIds,
        transaction,
      });
    await GroupPermissionResource.deleteAllForResources(auth, {
      resourceType: "agent",
      resourceIds,
      transaction,
    });

    const deleteResult = await GroupResource.batchDelete(auth, grantGroups, {
      transaction,
    });
    if (deleteResult.isErr()) {
      throw deleteResult.error;
    }
  }

  // Cancels every wake-up of the agent (best-effort: a wake-up whose Temporal state cannot be
  // cancelled is logged and left in place). Shared by `archive` and available to `delete`.
  private async cancelWakeUps(auth: Authenticator): Promise<void> {
    const owner = auth.getNonNullableWorkspace();
    const wakeUps = await WakeUpResource.listByAgentConfigurationId(
      auth,
      this.sId
    );

    await concurrentExecutor(
      wakeUps,
      async (wakeUp) => {
        const cancelResult = await wakeUp.forceCancel(auth);
        if (cancelResult.isErr()) {
          logger.error(
            {
              workspaceId: owner.sId,
              agentConfigurationId: this.sId,
              wakeUpId: wakeUp.sId,
              error: cancelResult.error,
            },
            `Failed to cancel wake-up ${wakeUp.sId} for agent ${this.sId}`
          );
        }
      },
      { concurrency: 5 }
    );
  }

  // Archives the agent in place: flips the current version row to `archived` (older versions were
  // already archived when they were superseded, so the agent has no active version afterwards),
  // disables its triggers, cancels its wake-ups, then invalidates the cache and reindexes. Returns
  // `Ok(whether a row changed)`, or `Err` when a trigger cannot be disabled (nothing is archived).
  /**
   * @cc [owner:tdraier,label:security] agent-archive-restore-requires-admin
   * Archiving, restoring, or hard-deleting a custom agent MUST require the agent `admin` verb,
   * checked inside the resource (`auth.can("admin", this)`) and never delegated to the caller: no
   * caller may archive, restore, or delete an agent it does not hold `admin` on, and `write` alone
   * MUST NOT suffice. `admin` alone MUST be enough, whether or not the caller can `read` the agent,
   * and callers MUST NOT add a space-read check on top. Editors and workspace admins hold it; a Poke
   * superuser session holds it through its admin role.
   */
  /**
   * @cc [owner:tdraier,label:product] archive-disables-triggers
   * Archiving MUST first disable every trigger of the agent (removing its Temporal schedule); if any
   * trigger cannot be disabled, archiving MUST abort before flipping the status, so the agent is
   * never left `archived` while a trigger keeps firing. Disabling is idempotent, so a retry after a
   * transient failure converges.
   */
  async archive(
    auth: Authenticator,
    { auditMetadata }: AgentAuditOptions = {}
  ): Promise<Result<boolean, Error>> {
    assert(this.scope !== "global", "Global agents cannot be archived.");
    this.assertCurrentVersion();
    if (!auth.can("admin", this)) {
      return new Err(
        new DustError(
          "unauthorized",
          "Archiving an agent requires the agent `admin` verb."
        )
      );
    }
    const owner = auth.getNonNullableWorkspace();

    // Disable all triggers before archiving. If a trigger cannot be disabled (its Temporal schedule
    // could not be removed), abort without archiving rather than leave an archived agent with a live
    // trigger (see the `archive-disables-triggers` contract). The failure is returned so callers can
    // surface it (see `no-catching-own-errors`).
    const triggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      this.sId
    );
    for (const trigger of triggers) {
      const disableResult = await trigger.disable(auth);
      if (disableResult.isErr()) {
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId: this.sId,
            triggerId: trigger.sId,
            error: disableResult.error,
          },
          `Failed to disable trigger ${trigger.sId} when archiving agent ${this.sId}`
        );
        return new Err(disableResult.error);
      }
    }

    await this.cancelWakeUps(auth);

    // Only the current version is `active` (older versions were archived when superseded), so
    // flipping the current row suffices (see the `archive-current-version-only` behavior mirrored by
    // `restore`).
    const affected = await this.updateAgentIdentity(auth, {
      status: "archived",
    });

    if (affected) {
      void emitAuditLogEvent({
        auth,
        action: "agent.archived",
        targets: [
          buildAuditLogTarget("workspace", owner),
          buildAuditLogTarget("agent", this),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          agent_name: this.name,
          ...auditMetadata,
        },
      });

      // The agent no longer has an active version, so drop its cached AgentResource and reindex.
      await AgentResource.invalidateCache(owner.id, this.sId);
      await AgentResource.launchSearchIndexation(auth, [this.sId]);
    }

    return new Ok(affected);
  }

  // Re-enables the agent's triggers as their respective editors. Shared by `restore`.
  private async reEnableTriggers(auth: Authenticator): Promise<void> {
    const owner = auth.getNonNullableWorkspace();
    const triggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      this.sId
    );
    const editors = await UserResource.fetchByModelIds([
      ...new Set(triggers.map((trigger) => trigger.editor)),
    ]);
    const editorByModelId = new Map(
      editors.map((editor) => [editor.id, editor])
    );

    for (const trigger of triggers) {
      const editor = editorByModelId.get(trigger.editor);
      if (!editor) {
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId: this.sId,
            triggerId: trigger.sId,
          },
          `Could not find editor ${trigger.editor} for trigger ${trigger.sId} when restoring agent ${this.sId}`
        );
        continue;
      }

      const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
        editor.sId,
        owner.sId
      );
      const enableResult = await trigger.enable(editorAuth);
      if (enableResult.isErr()) {
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId: this.sId,
            triggerId: trigger.sId,
            error: enableResult.error,
          },
          `Failed to enable trigger ${trigger.sId} when restoring agent ${this.sId}`
        );
      }
    }
  }

  // Restores the current (archived) version in place: reactivates it, re-enables its triggers, then
  // invalidates the cache and reindexes. Restoring a `visible` agent republishes it and therefore
  // needs the `publish` capability. Fails when the agent is not archived or an active agent already
  // holds its name (the unique `(workspaceId, name)` constraint).
  async restore(
    auth: Authenticator
  ): Promise<
    Result<
      { restored: boolean },
      DustError<"name_conflict" | "internal_error" | "unauthorized">
    >
  > {
    assert(this.scope !== "global", "Global agents cannot be restored.");
    this.assertCurrentVersion();
    const owner = auth.getNonNullableWorkspace();

    // Enforce the agent `admin` verb here regardless of any caller-side gate (see the
    // `agent-archive-restore-requires-admin` contract).
    if (!auth.can("admin", this)) {
      return new Err(
        new DustError(
          "unauthorized",
          "Restoring an agent requires the agent `admin` verb."
        )
      );
    }

    if (this.status !== "archived") {
      return new Err(
        new DustError("internal_error", "Agent configuration is not archived")
      );
    }

    // Restoring a visible agent is equivalent to publishing it.
    if (this.scope === "visible") {
      const canPublish = auth.hasWorkspacePermission("publish", "agent");
      if (!canPublish) {
        return new Err(
          new DustError("unauthorized", "Publishing agents is restricted.")
        );
      }
    }

    // Check for an active agent with the same name to avoid a unique constraint violation on
    // (workspaceId, name) during the update.
    const existingActive = await AgentConfigurationModel.findOne({
      where: {
        workspaceId: owner.id,
        name: this.name,
        status: "active",
      },
    });
    if (existingActive) {
      return new Err(
        new DustError(
          "name_conflict",
          `Cannot restore: an active agent named "${this.name}" already exists.`
        )
      );
    }

    const affected = await this.updateAgentIdentity(auth, { status: "active" });

    if (affected) {
      // The restored version is active again, so the cached AgentResource is now stale.
      await AgentResource.invalidateCache(owner.id, this.sId);
      await AgentResource.launchSearchIndexation(auth, [this.sId]);

      await this.reEnableTriggers(auth);

      void emitAuditLogEvent({
        auth,
        action: "agent.restored",
        targets: [
          buildAuditLogTarget("workspace", owner),
          buildAuditLogTarget("agent", this),
        ],
        context: getAuditLogContext(auth),
        metadata: {
          agent_name: this.name,
        },
      });
    }

    return new Ok({ restored: affected });
  }

  // Tears down the agent-scoped resources keyed by `sId` (stable across versions) that carry
  // external Temporal state or have no DB FK to cascade: triggers (schedule), wake-ups
  // (schedule / pending workflow) and favorite / agent-user-relation rows. Returns an error when the
  // Temporal-backed cleanup did not fully complete, so `delete` can abort before removing the
  // versions and a retry can finish it.
  // Cancels/deletes the scoped resources (triggers, wake-ups, favorites) of a set of agents before
  // their versions are destroyed. Rows are listed and deleted with scoped (`IN`) queries so DB work
  // does not scale per agent (see `batch-database-queries`); the unavoidable per-item Temporal calls
  // (trigger schedule removal, wake-up cancellation) go through `concurrentExecutor`, which the
  // contract allows for external services. A Temporal failure leaves its row in place, so this
  // re-checks and returns `Err` if anything survives — after some rows may already be gone (see the
  // `batch-delete-atomic` contract).
  private static async batchCleanupScopedResourcesForDeletion(
    auth: Authenticator,
    agents: AgentResource[]
  ): Promise<Result<undefined, Error>> {
    const owner = auth.getNonNullableWorkspace();
    const sIds = agents.map((agent) => agent.sId);

    const triggers = await TriggerResource.listByAgentConfigurationIds(
      auth,
      sIds
    );
    await concurrentExecutor(
      triggers,
      async (trigger) => {
        const deleteResult = await trigger.delete(auth);
        if (deleteResult.isErr()) {
          logger.error(
            {
              workspaceId: owner.sId,
              agentConfigurationId: trigger.agentConfigurationId,
              triggerId: trigger.sId,
              error: deleteResult.error,
            },
            `Failed to delete trigger ${trigger.sId} while hard-deleting agent ${trigger.agentConfigurationId}`
          );
        }
      },
      { concurrency: 4 }
    );

    const wakeUps = await WakeUpResource.listByAgentConfigurationIds(
      auth,
      sIds
    );
    const cancelResults = await concurrentExecutor(
      wakeUps,
      async (wakeUp) => ({ wakeUp, result: await wakeUp.forceCancel(auth) }),
      { concurrency: 4 }
    );
    const deletableWakeUpIds: ModelId[] = [];
    for (const { wakeUp, result } of cancelResults) {
      if (result.isErr()) {
        logger.error(
          {
            workspaceId: owner.sId,
            agentConfigurationId: wakeUp.agentConfigurationId,
            wakeUpId: wakeUp.sId,
            error: result.error,
          },
          `Failed cleaning up wake-up ${wakeUp.sId} Temporal state while hard-deleting agent ${wakeUp.agentConfigurationId}; leaving row for retry`
        );
        continue;
      }
      deletableWakeUpIds.push(wakeUp.id);
    }
    await WakeUpResource.deleteByModelIds(auth, deletableWakeUpIds);

    await AgentUserRelationResource.deleteForAgents(auth, sIds);
    await AgentSuggestedPromptsModel.destroy({
      where: { workspaceId: owner.id, agentConfigurationId: sIds },
    });

    // Three independent, bounded verification reads — run together (not a per-item fan-out, so this
    // stays within `batch-database-queries`).
    const [remainingTriggers, remainingWakeUps, remainingFavoriteCount] =
      await Promise.all([
        TriggerResource.listByAgentConfigurationIds(auth, sIds),
        WakeUpResource.listByAgentConfigurationIds(auth, sIds),
        AgentUserRelationResource.countForAgents(auth, sIds),
      ]);

    if (
      remainingTriggers.length > 0 ||
      remainingWakeUps.length > 0 ||
      remainingFavoriteCount > 0
    ) {
      logger.error(
        {
          workspaceId: owner.sId,
          agentConfigurationIds: sIds,
          remainingTriggerIds: remainingTriggers.map((t) => t.sId),
          remainingWakeUpIds: remainingWakeUps.map((w) => w.sId),
          remainingFavoriteCount,
        },
        "Agent scoped cleanup incomplete; aborting hard-delete of agent versions. " +
          "Resolve the underlying Temporal failure and rerun."
      );
      return new Err(
        new Error(
          `Agent scoped cleanup incomplete for [${sIds.join(", ")}]; aborted before deleting versions.`
        )
      );
    }

    return new Ok(undefined);
  }

  // Hard-deletes the agent: every version and its satellites (tools and their data-source / table /
  // child-agent links, tags, skills, suggestions), the scoped resources (triggers, wake-ups,
  // favorites, agent memories, group discovery pins), the agent's permission grants and groups, and
  // finally the `agents` identity row. The cached entry is invalidated on commit and the agent is
  // removed from the search index. This permanently destroys the agent. Like archive/restore, it
  // requires the agent `admin` verb (checked in `batchDelete`, regardless of any caller-side gate;
  // see `agent-archive-restore-requires-admin`).
  async delete(auth: Authenticator): Promise<Result<undefined, Error>> {
    return AgentResource.batchDelete(auth, [this]);
  }

  // Hard-deletes every agent of the workspace with its tools, favorites, tags and memories, for
  // workspace deletion only: no archive, no search-index work per agent.
  static async dangerouslyDeleteAllForWorkspace(
    auth: Authenticator
  ): Promise<void> {
    // A workspace admin holds `admin` on every custom agent (see
    // `agent-archive-restore-requires-admin`), so the whole workspace may be deleted.
    assert(auth.isAdmin(), "Deleting every agent requires a workspace admin.");
    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const agents = await AgentConfigurationModel.findAll({
      where: { workspaceId: workspaceModelId },
    });

    for (const agent of agents) {
      const mcpServerConfigurations =
        await AgentMCPServerConfigurationModel.findAll({
          where: {
            agentConfigurationId: agent.id,
            workspaceId: workspaceModelId,
          },
        });
      const mcpServerConfigurationModelIds = mcpServerConfigurations.map(
        (r) => r.id
      );
      await AgentDataSourceConfigurationModel.destroy({
        where: {
          mcpServerConfigurationId: { [Op.in]: mcpServerConfigurationModelIds },
          workspaceId: workspaceModelId,
        },
      });
      await AgentTablesQueryConfigurationTableModel.destroy({
        where: {
          mcpServerConfigurationId: { [Op.in]: mcpServerConfigurationModelIds },
          workspaceId: workspaceModelId,
        },
      });
      await AgentChildAgentConfigurationModel.destroy({
        where: {
          mcpServerConfigurationId: {
            [Op.in]: mcpServerConfigurationModelIds.map((id) => `${id}`),
          },
          workspaceId: workspaceModelId,
        },
      });
      await AgentMCPServerConfigurationModel.destroy({
        where: {
          agentConfigurationId: agent.id,
          workspaceId: workspaceModelId,
        },
      });
      await AgentUserRelationModel.destroy({
        where: { agentConfiguration: agent.sId, workspaceId: workspaceModelId },
      });
      await TagAgentModel.destroy({
        where: {
          agentConfigurationId: agent.id,
          workspaceId: workspaceModelId,
        },
      });
      await AgentMemoryModel.destroy({
        where: {
          agentConfigurationId: agent.sId,
          workspaceId: workspaceModelId,
        },
      });
      await AgentSuggestedPromptsModel.destroy({
        where: {
          agentConfigurationId: agent.sId,
          workspaceId: workspaceModelId,
        },
      });

      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          agentId: agent.sId,
        },
        "Deleting agent"
      );
      await agent.destroy();
    }

    await AgentModel.destroy({ where: { workspaceId: workspaceModelId } });

    // Cache entries have no TTL, so workspace deletion must drop every agent's cached snapshot.
    await invalidateAgentResourceCaches(
      workspaceModelId,
      agents.map((agent) => agent.sId)
    );
  }

  /**
   * @cc [owner:tdraier,label:backend] batch-delete-atomic
   * `batchDelete` MUST hard-delete every passed agent as a set: for each agent it destroys all of its
   * configuration versions and their satellites (tools and their data-source / table / child-agent
   * links, tags, skills, suggestions), the rows keyed off the stable `sId` with no FK to cascade
   * (agent memories, group discovery pins), the permission grants and groups, and the `agents`
   * identity row. All of these database deletions MUST run in a single transaction so the batch commits
   * all-or-nothing (destroying every version before its identity keeps the delete valid for any agent,
   * not only single-version pending drafts). Because the whole identity is removed, `batchDelete` MUST
   * NOT be called with two resources sharing an `id`. Scoped resources (triggers, wake-ups, favorites)
   * are cleaned up before the transaction; if any cannot be removed (e.g. a Temporal cancellation
   * fails), `batchDelete` MUST abort before destroying any configuration version or identity row —
   * best-effort scoped rows already deleted are tolerated, but no agent is left version-less. `delete`
   * MUST delegate here so the two paths cannot diverge.
   */
  /**
   * @cc [owner:tdraier,label:backend] batch-delete-search-index
   * After the deletion commits, `batchDelete` MUST remove from the search index every deleted agent
   * whose status could have been indexed — one `launchDeleteAgentSearchWorkflow` per such agent (see
   * `agent-search-after-commit`). Agents whose status is in `NON_INDEXABLE_AGENT_STATUSES` are never
   * indexed (enforced on write in `makeNew`) and MUST be skipped, so the purge of pending drafts adds
   * no workflows. Every eligible launch MUST be attempted even if an earlier one fails; the first
   * error is returned only after all have been attempted.
   */
  static async batchDelete(
    auth: Authenticator,
    agents: AgentResource[]
  ): Promise<Result<undefined, Error>> {
    if (agents.length === 0) {
      return new Ok(undefined);
    }

    const owner = auth.getNonNullableWorkspace();
    const workspaceId = owner.id;

    for (const agent of agents) {
      assert(agent.scope !== "global", "Global agents cannot be deleted.");
      assert(
        workspaceId === agent.workspaceId,
        "Unexpected: agent belongs to another workspace"
      );
      if (!auth.can("admin", agent)) {
        return new Err(
          new DustError(
            "unauthorized",
            "Deleting an agent requires the agent `admin` verb."
          )
        );
      }
    }

    // Scoped-resource cleanup (triggers, wake-ups, favorites) happens before the transaction and must
    // fully succeed; a failure aborts before any configuration version or identity row is destroyed.
    const cleanupRes =
      await AgentResource.batchCleanupScopedResourcesForDeletion(auth, agents);
    if (cleanupRes.isErr()) {
      return cleanupRes;
    }

    const agentModelIds = agents.map((agent) => agent.id);
    const sIds = agents.map((agent) => agent.sId);

    await withTransaction(async (t) => {
      const configurations = await AgentConfigurationModel.findAll({
        where: { agentId: { [Op.in]: agentModelIds }, workspaceId },
        attributes: ["id"],
        transaction: t,
      });
      const configurationModelIds = configurations.map(
        (configuration) => configuration.id
      );

      if (configurationModelIds.length > 0) {
        // Tools first: their data-source / table / child-agent links reference the MCP server
        // configuration rows, which reference the configurations.
        const mcpConfigurations =
          await AgentMCPServerConfigurationModel.findAll({
            where: {
              agentConfigurationId: { [Op.in]: configurationModelIds },
              workspaceId,
            },
            attributes: ["id"],
            transaction: t,
          });
        const mcpConfigurationModelIds = mcpConfigurations.map(
          (configuration) => configuration.id
        );
        if (mcpConfigurationModelIds.length > 0) {
          await AgentDataSourceConfigurationModel.destroy({
            where: {
              workspaceId,
              mcpServerConfigurationId: { [Op.in]: mcpConfigurationModelIds },
            },
            transaction: t,
          });
          await AgentTablesQueryConfigurationTableModel.destroy({
            where: {
              workspaceId,
              mcpServerConfigurationId: { [Op.in]: mcpConfigurationModelIds },
            },
            transaction: t,
          });
          await AgentChildAgentConfigurationModel.destroy({
            where: {
              workspaceId,
              mcpServerConfigurationId: { [Op.in]: mcpConfigurationModelIds },
            },
            transaction: t,
          });
          await AgentMCPServerConfigurationModel.destroy({
            where: { workspaceId, id: { [Op.in]: mcpConfigurationModelIds } },
            transaction: t,
          });
        }

        await TagAgentModel.destroy({
          where: {
            workspaceId,
            agentConfigurationId: { [Op.in]: configurationModelIds },
          },
          transaction: t,
        });
        await AgentSkillModel.destroy({
          where: {
            workspaceId,
            agentConfigurationId: { [Op.in]: configurationModelIds },
          },
          transaction: t,
        });
        await AgentSuggestionModel.destroy({
          where: {
            workspaceId,
            agentConfigurationId: { [Op.in]: configurationModelIds },
          },
          transaction: t,
        });

        await AgentConfigurationModel.destroy({
          where: { workspaceId, id: { [Op.in]: configurationModelIds } },
          transaction: t,
        });
      }

      // Agent memories are keyed by the stable `sId` (not by version) and have no FK to `agents`,
      // so they are removed here along with the identities.
      await AgentMemoryModel.destroy({
        where: { workspaceId, agentConfigurationId: { [Op.in]: sIds } },
        transaction: t,
      });

      // Group discovery pins reference the agent by its stable `sId` with no FK to cascade, so they
      // are removed here along with the identities. Deleted through the model (not
      // `DiscoveryItemResource`) to avoid an import cycle back into `AgentResource`.
      await GroupPinnedItemModel.destroy({
        where: { workspaceId, type: "agent", itemId: { [Op.in]: sIds } },
        transaction: t,
      });

      // The `agent_configurations` rows (and their FK to `agents`) are gone, so the grants, groups
      // and the identity rows can be removed.
      await AgentResource.batchDestroyPermissionsAndGroups(auth, agents, {
        transaction: t,
      });
      await AgentModel.destroy({
        where: { id: { [Op.in]: agentModelIds }, workspaceId },
        transaction: t,
      });

      // Drop the cached entries once the deletion commits.
      await invalidateAgentResourceCaches(workspaceId, sIds, t);
    });

    // Remove every deleted agent that could have been indexed from the search index after the
    // deletion commits (see `agent-search-after-commit` / `batch-delete-search-index`). Never-indexed
    // statuses (pending drafts) are skipped. Launches go through `concurrentExecutor` so every one is
    // attempted; the first failure is surfaced afterwards.
    const indexedAgents = agents.filter(
      (agent) => !NON_INDEXABLE_AGENT_STATUSES.includes(agent.status)
    );
    const launchResults = await concurrentExecutor(
      indexedAgents,
      (agent) =>
        launchDeleteAgentSearchWorkflow({
          workspaceId: owner.sId,
          agentId: agent.sId,
        }),
      { concurrency: 8 }
    );
    const failedLaunch = launchResults.find((result) => result.isErr());
    if (failedLaunch?.isErr()) {
      return failedLaunch;
    }

    return new Ok(undefined);
  }

  requestedSpaceModelIds(): readonly ModelId[] {
    return this.requestedSpaceIds;
  }

  // Whether the caller can read every space backing the agent's tools/skills/data. Space read comes
  // from the caller's governance snapshot (`getReadableSpaceModelIds`), so this needs no extra query.
  // A `kind: "all"` result is the type-wide wildcard grant (a full system key) and reads every space;
  // a system key downscoped to a group subset (see `Authenticator.fromKey` with `requestedGroupIds`)
  // enumerates only what those groups grant, so it is checked like any other caller. A missing or
  // deleted space is absent from the snapshot and therefore fails closed.
  requestedSpacesReadable(auth: Authenticator): boolean {
    const readableSpaces = auth.getReadableSpaceModelIds();
    return (
      readableSpaces.kind === "all" ||
      this.requestedSpaceIds.every((spaceId) =>
        readableSpaces.resourceIds.includes(spaceId)
      )
    );
  }

  /**
   * @cc [owner:philipperolet,label:security] admin-key-agent-write
   * The admin role grants `write` on custom agents to regular API keys only; human and system-key
   * callers receive no agent write access from their role. Global agents remain read-only.
   */
  /**
   * @cc [owner:philipperolet,label:security] hidden-agent-content
   * Admin role alone must not grant `read` on hidden agents, including for regular API keys
   * with role-based write access. Agent details may separately override admin redaction.
   */
  /**
   * @cc [owner:tdraier,label:security;product] agent-read-requires-space-read
   * `read` on a custom agent requires read access to every space in `requestedSpaceIds` (the spaces
   * backing its tools/skills/data): a caller who cannot read one of them does not get `read`.
   * `requestedSpaceIds` is a core field carried by every resource, so the gate applies whether or
   * not the caller can view the content. Global agents have no requested spaces and are unaffected.
   */
  /**
   * @cc [owner:philipperolet,label:security;product] draft-agent-owner
   * The current author of a draft custom agent owns that draft and holds `read`, `write`, and
   * `admin` on it. As with explicit editor grants, `read` and `write` remain subject to
   * `agent-read-requires-space-read`. Authorship alone MUST NOT grant any verb once the agent is
   * active, archived, pending, or disabled; editorship on those agents comes only from explicit
   * grants.
   */
  getAllowedVerbs(auth: Authenticator): Set<GrantVerb> {
    if (this.scope === "global") {
      assert(isGlobalAgentId(this.sId));

      const roleGrants: RoleGrant[] = globalAgentReaderRoles(this.sId).map(
        (role) => ({ role, permissions: ["read", "list"] })
      );

      return new Set(verbsFromRoleGrants(auth, roleGrants, this.workspaceId));
    }

    assert(this.versionAuthorId !== null);

    const grants = auth.getGovernanceGrantVerbs(
      "agent",
      this.id,
      this.workspaceId
    );
    const isDraftOwner =
      this.status === "draft" &&
      auth.workspace()?.id === this.workspaceId &&
      auth.user()?.id === this.versionAuthorId;
    const roles =
      this.status !== "draft" &&
      this.status !== "pending" &&
      this.scope === "visible"
        ? VISIBLE_AGENT_ROLE_GRANTS
        : HIDDEN_AGENT_ROLE_GRANTS;
    const roleGrants: RoleGrant[] =
      auth.isKey() && !auth.isSystemKey()
        ? [...roles, { role: "admin", permissions: ["write"] }]
        : roles;

    const verbs = new Set([
      ...(isDraftOwner ? [...grants, ...DRAFT_OWNER_VERBS] : grants),
      ...verbsFromRoleGrants(auth, roleGrants, this.workspaceId),
    ]);

    // `read` additionally requires read access to every space backing the agent (see
    // `requestedSpacesReadable`): a caller who cannot read one of them cannot read the agent.
    if (!this.requestedSpacesReadable(auth)) {
      verbs.delete("read");
      verbs.delete("write");
      verbs.delete("list");
      // The hidden-agent role verbs hold on every custom agent, whatever its spaces.
      for (const verb of verbsFromRoleGrants(
        auth,
        HIDDEN_AGENT_ROLE_GRANTS,
        this.workspaceId
      )) {
        verbs.add(verb);
      }
    }

    return verbs;
  }

  /**
   * Skills equipped on this agent: the `AgentSkillModel` rows of a custom agent, the code-defined
   * skills a global agent declares.
   */
  /**
   * @cc [owner:sfriquet,label:backend] agent-skills-by-scope
   * A global agent's skills MUST be resolved from the `codeDefinedSkillIds` its configuration
   * declares, never from `AgentSkillModel`: global agents hold no such row and share the `id: -1`
   * sentinel, so a row lookup would be cross-agent (see
   * `skill-references-by-configuration-model-id`). A custom agent's skills MUST be resolved from
   * its `agent_configurations` row (`agentConfigurationModelId`), never from
   * `codeDefinedSkillIds`, which is always empty for them.
   */
  async listSkills(
    auth: Authenticator,
    fetchContext: SkillFetchContext = {}
  ): Promise<SkillResource[]> {
    const skillsByAgent = await SkillResource.listByAgents(
      auth,
      [this],
      fetchContext
    );
    return skillsByAgent.get(this) ?? [];
  }

  /**
   * @cc [owner:sfriquet,label:backend;security] agent-search-serialization
   * Serialize listing metadata from the core fields, deriving user sIds from supplied editor
   * resources; perform no I/O and never include private agent content. `model.reasoning_effort`
   * MUST always carry the effort the agent runs at, never null: an agent that configures none
   * runs at its model's default.
   * Custom agents use the authenticator's workspace; global agents use the global namespace, as
   * always active and without workspace-specific relationships, usage or dates.
   */
  toSearchDocument(
    auth: Authenticator,
    {
      activeUsersCount,
      editors,
      favoriteCount,
      feedbackNegativeCount,
      feedbackPositiveCount,
      lastEditedByUser,
      mcpServerViewIds,
      skillIds,
      tagIds,
    }: {
      activeUsersCount: number | null;
      editors: UserResource[];
      favoriteCount: number;
      feedbackNegativeCount: number;
      feedbackPositiveCount: number;
      lastEditedByUser: UserResource | null;
      mcpServerViewIds: string[];
      skillIds: string[];
      tagIds: string[];
    }
  ): AgentSearchDocument {
    const isGlobal = this.scope === "global";
    return {
      workspace_id: isGlobal
        ? GLOBAL_AGENTS_WORKSPACE_ID
        : auth.getNonNullableWorkspace().sId,
      agent_id: this.sId,
      status: isGlobal ? "active" : this.status,
      scope: this.scope,
      model: {
        provider_id: this.modelConfiguration.providerId,
        model_id: this.modelConfiguration.modelId,
        reasoning_effort: getEffectiveReasoningEffort(this.modelConfiguration),
      },
      name: this.name,
      picture_url: this.pictureUrl,
      last_edited_by_user_id: isGlobal ? null : (lastEditedByUser?.sId ?? null),
      editor_ids: isGlobal
        ? []
        : uniq(editors.map((editor) => editor.sId)).sort(),
      requested_space_ids: isGlobal
        ? []
        : this.requestedSpaceIds.map((id) =>
            SpaceResource.modelIdToSId({ id, workspaceId: this.workspaceId })
          ),
      created_at: isGlobal ? null : this.createdAt.toISOString(),
      updated_at: isGlobal ? null : this.updatedAt.toISOString(),
      description: this.description,
      skill_ids: uniq(skillIds).sort(),
      mcp_server_view_ids: isGlobal ? [] : uniq(mcpServerViewIds).sort(),
      tag_ids: isGlobal ? [] : uniq(tagIds).sort(),
      feedback_positive_count: isGlobal ? 0 : feedbackPositiveCount,
      feedback_negative_count: isGlobal ? 0 : feedbackNegativeCount,
      active_users_count: isGlobal ? null : activeUsersCount,
      favorite_count: isGlobal ? 0 : favoriteCount,
    };
  }

  toMentionSuggestionJSON({
    userFavorite,
  }: {
    userFavorite: boolean;
  }): RichAgentMention {
    return {
      type: "agent",
      id: this.sId,
      label: this.name,
      pictureUrl: this.pictureUrl,
      description: this.description,
      userFavorite,
    };
  }

  toSearchModelJSON(): Pick<AgentSearchListItemType, "model" | "status"> {
    return {
      model: {
        providerId: this.modelConfiguration.providerId,
        modelId: this.modelConfiguration.modelId,
        reasoningEffort: getEffectiveReasoningEffort(this.modelConfiguration),
      },
      status: this.status,
    };
  }

  // The code-defined skills a global agent declares; always empty for custom agents.
  get codeDefinedSkillIds(): string[] {
    return [...this._codeDefinedSkillIds];
  }

  // The model the agent runs on (see `agent-json-effective-reasoning-effort`).
  get effectiveModelConfiguration(): AgentModelConfigurationType {
    if (this.scope === "global") {
      return this.modelConfiguration;
    }
    return {
      ...this.modelConfiguration,
      reasoningEffort:
        this.modelConfiguration.reasoningEffort ??
        getSupportedModelConfig(this.modelConfiguration)
          ?.defaultReasoningEffort,
    };
  }

  /**
   * @cc [owner:tdraier,label:security;backend] agent-json-without-instructions
   * `toJSON` serializes every resource, custom or global, with its head fields,
   * version metadata and the caller's permission snapshot, and MUST NOT carry the instructions: the
   * configuration builders add them (see `agent-json-redaction`). It MUST carry the resource's
   * `canViewContent`.
   */
  /**
   * @cc [owner:tdraier,label:backend] agent-json-effective-reasoning-effort
   * For a custom agent with no stored `reasoningEffort`, `toJSON().model.reasoningEffort` (built from
   * `effectiveModelConfiguration`) MUST be the model's default reasoning effort (unset for an unknown
   * model), as the legacy loaders served it: the agent loop runs on it. `modelConfiguration` and the save paths keep the stored value.
   * A global agent's model is served as its builder produced it.
   */
  /**
   * @cc [owner:philipperolet,label:security] regular-key-agent-editability
   * For regular keys on custom agents, `canEdit` requires the agent `write` verb (from an editor
   * grant, or the admin role), active status, and read access to every requested space.
   */
  /**
   * @cc [owner:philipperolet,label:security] agent-editability
   * Outside regular API keys, `canEdit` is agent `write` permission; the workspace admin role alone
   * does not grant it.
   */
  toJSON(): AgentConfigurationBaseType {
    const isGlobal = this.scope === "global";

    return {
      id: this.agentConfigurationModelId,
      agentModelId: isGlobal ? null : this.id,
      versionCreatedAt: isGlobal ? null : this.versionCreatedAt.toISOString(),
      sId: this.sId,
      version: this.version,
      versionAuthorId: this.versionAuthorId,
      model: this.effectiveModelConfiguration,
      status: this.status,
      scope: this.scope,
      name: this.name,
      description: this.description,
      pictureUrl: this.pictureUrl,
      maxStepsPerRun: this.maxStepsPerRun,
      templateId: this.templateId
        ? TemplateResource.modelIdToSId({ id: this.templateId })
        : null,
      // TODO(2025-10-20 flav): Remove once SDK JS does not rely on it anymore.
      visualizationEnabled: false,
      // Deprecated: access is modeled by space membership; kept for wire compatibility.
      requestedGroupIds: [],
      requestedSpaceIds: this.requestedSpaceIds.map((spaceId) =>
        SpaceResource.modelIdToSId({
          id: spaceId,
          workspaceId: this.workspaceId,
        })
      ),
      reinforcement: this.reinforcement,
      lastReinforcementAnalysisAt:
        this.lastReinforcementAnalysisAt?.toISOString() ?? null,
      ignoreCreditSpendThresholdAlert:
        this.creditSpendCheckpointThresholdAwuCredits === null,
      canRead: this._verbs.has("read"),
      // Regular API keys hold `write` from the admin role but may only edit an active version
      // (see `regular-key-agent-editability`).
      canEdit:
        this._verbs.has("write") &&
        (!this._isRegularApiKey || this.status === "active"),
      canViewContent: this.canViewContent,
    };
  }

  // What the sidekick's `inspect_available_agent` tool exposes; the instructions require
  // `canViewContent`.
  toInspectionJSON({
    instructions,
    toolIds,
    skillIds,
  }: {
    instructions: string | null;
    toolIds: string[];
    skillIds: string[];
  }): {
    sId: string;
    name: string;
    description: string;
    instructions: string | null;
    toolIds: string[];
    skillIds: string[];
  } {
    return {
      sId: this.sId,
      name: this.name,
      description: this.description,
      instructions,
      toolIds,
      skillIds,
    };
  }

  // What the sidekick's `get_agent_info` tool exposes; the instructions require `canViewContent`.
  toSidekickAgentInfoJSON({
    instructions,
    tags,
    actions,
    skills,
  }: {
    instructions: string | null;
    tags: TagResource[];
    actions: MCPServerConfigurationType[];
    skills: SkillResource[];
  }): {
    sId: string;
    version: number;
    name: string;
    description: string;
    instructions: string | null;
    model: Pick<
      AgentModelConfigurationType,
      "providerId" | "modelId" | "temperature" | "reasoningEffort"
    >;
    scope: AgentConfigurationScope;
    status: AgentConfigurationStatus;
    tags: { sId: string; name: string }[];
    tools: { sId: string; name: string; description: string | null }[];
    skills: { sId: string; name: string; userFacingDescription: string }[];
  } {
    const { providerId, modelId, temperature, reasoningEffort } =
      this.modelConfiguration;

    return {
      sId: this.sId,
      version: this.version,
      name: this.name,
      description: this.description,
      instructions,
      model: { providerId, modelId, temperature, reasoningEffort },
      scope: this.scope,
      status: this.status,
      tags: tags.map((tag) => ({ sId: tag.sId, name: tag.name })),
      tools: actions.map((action) => ({
        sId: action.sId,
        name: action.name,
        description: action.description,
      })),
      skills: skills.map((skill) => ({
        sId: skill.sId,
        name: skill.name,
        userFacingDescription: skill.userFacingDescription,
      })),
    };
  }

  toDiscoveryJSON({
    lastAuthors,
  }: {
    lastAuthors: readonly string[];
  }): DiscoveryAgentType {
    return {
      sId: this.sId,
      name: this.name,
      description: this.description,
      pictureUrl: this.pictureUrl,
      scope: this.scope,
      lastAuthors,
    };
  }

  // Creates a brand-new custom agent atomically: its `AgentModel` identity, first
  // `AgentConfigurationModel` version, editor grants, tags, MCP actions and skill associations.
  // Bringing a new agent into the workspace requires the type-wide `create` capability, enforced
  // here (see the `agent-create-capability` contract).
  static async makeNew(
    auth: Authenticator,
    params: SaveAgentConfigurationParams,
    { auditMetadata }: AgentAuditOptions = {}
  ): Promise<Result<AgentResource, Error>> {
    if (!auth.hasWorkspacePermission("create", "agent")) {
      return new Err(new Error("Creating agents is restricted."));
    }

    return AgentResource._saveConfiguration(
      auth,
      { ...params, agentConfigurationId: undefined },
      { auditMetadata }
    );
  }

  static async createPending(
    auth: Authenticator,
    name?: string
  ): Promise<Result<AgentResource, Error>> {
    const pendingAgents = await this.createPendings(auth, [
      name ?? PENDING_AGENT_PLACEHOLDER_NAME,
    ]);
    if (pendingAgents.isErr()) {
      return pendingAgents;
    }

    return new Ok(pendingAgents.value[0]);
  }

  static async createPendings(
    auth: Authenticator,
    names: string[]
  ): Promise<Result<AgentResource[], Error>> {
    if (names.length === 0) {
      return new Ok([]);
    }

    const user = auth.getNonNullableUser();
    const { defaultModel } = await getModelsForAuth(auth);

    const results = await concurrentExecutor(
      names,
      (name) =>
        this.makeNew(auth, {
          name,
          description: PENDING_AGENT_PLACEHOLDER_DESCRIPTION,
          instructions: null,
          instructionsHtml: null,
          pictureUrl: PENDING_AGENT_PLACEHOLDER_PICTURE_URL,
          status: "pending",
          scope: "hidden",
          model: getNewAgentModelDefaults(defaultModel),
          templateId: null,
          requestedSpaceIds: [],
          tags: [],
          editors: [user.toJSON()],
          authorId: user.id,
        }),
      { concurrency: 8 }
    );

    const pendingAgents: AgentResource[] = [];
    for (const result of results) {
      if (result.isErr()) {
        return result;
      }
      pendingAgents.push(result.value);
    }

    return new Ok(pendingAgents);
  }

  // Applies a partial update to `this` existing agent: only properties present in `update` are
  // considered, an omitted property is left untouched, and a provided property equal to the current
  // value is a no-op. Each changed property is routed to its own path and permission (see
  // `agent-edit-in-place`): definition fields create a new version, `scope`/`editors` are applied in
  // place. When only `scope`/`editors` are provided the private configuration is never read.
  /**
   * @cc [owner:tdraier,label:security;product] agent-edit-in-place
   * Saving an existing agent MUST route each changed property by kind and gate it on its own
   * permission: a definition field other than the model and tags (name, description, instructions,
   * picture, status, template, requested spaces, reinforcement, credit spend alert bypass, tools or
   * skills) creates a new version and MUST require `write`; the `model` creates a new version but
   * MUST require `write` OR
   * `admin`, and `tags` a new version requiring `write` OR workspace-admin (see
   * `model-change-requires-edit`/`tags-change-requires-edit`); `scope` is
   * applied in place (no new version) and MUST satisfy
   * `scope-change-requires-edit-and-publish`; an editor-set change is applied in place and MUST
   * require `admin` (see `agent-verbs`). A property whose provided value equals the current one MUST
   * be a no-op (no version, no permission check). A new version created alongside a scope/editor
   * change MUST carry the current scope/editors, so those take effect only through their own gated
   * path. A pending agent is the sole versioning exception: a definition edit updates its single row
   * in place (preserving version 0 and its FK relationships, see `writeAgentConfigurationRow`) rather
   * than archiving it and creating a new version. All required permissions MUST be checked before any
   * change is applied so a save never partially succeeds. A caller that cannot view the agent's
   * content (`canViewContent` false, see `agent-content-visibility`) and does not hold `write` cannot
   * create a version, so provided definition fields are ignored; it may still change scope/editors
   * it is authorized for. A caller that holds `write` without viewing the content (a regular admin
   * API key on a hidden agent, see `admin-key-agent-write`) MUST NOT have its definition fields
   * ignored: they are diffed and versioned like any writer's, without the current content ever being
   * returned to it (see `unreadable-agent-content-hidden`). A
   * caller that views the content without `read` (the `admin_can_see_private_entities` admin
   * override) can view the content, so its definition fields are NOT ignored but gated as above: only
   * the model and tags may produce a version, through their `admin` paths.
   */
  /**
   * @cc [owner:tdraier,label:backend] save-skips-noop-version
   * A save whose provided properties all equal the agent's current configuration MUST NOT create a
   * new version and MUST NOT change anything: it returns the current resource unchanged. Definition
   * equality is compared conservatively over the persisted fields (author excluded); any uncertainty
   * MUST fall through to a real save so an edit is never silently dropped.
   */
  /**
   * @cc [owner:tdraier,label:security] model-change-requires-edit
   * Only callers who hold `write` or `admin` on an agent may change its model: `updateConfiguration`
   * MUST gate a model change on `auth.can("write", this) || auth.can("admin", this)`, so the model of
   * an agent the caller cannot edit MUST NOT be written (including through `bulkUpdate`).
   */
  /**
   * @cc [owner:tdraier,label:security] tags-change-requires-edit
   * A tags change creates a new version and MUST be gated on `auth.can("write", this) ||
   * auth.isAdmin()`. A workspace admin is required for the non-`write` path (rather than the agent
   * `admin` verb) because the new version is rebuilt from the caller's readable view of the agent
   * (`buildResaveParams`): only a workspace admin is guaranteed to read every space, so their
   * rebuild carries every tool/skill faithfully and no non-tag definition field is silently altered
   * (see `agent-edit-requires-write`). This lets an admin (bulk-)tag agents they do not edit —
   * including ones they cannot read, since `bulkUpdate` resolves rows caller-independently. Protected
   * tags remain separately gated on the `publish` capability in `syncAgentTags`.
   */
  /**
   * @cc [owner:philipperolet,label:security;product] complete-editor-set-replaces-grants
   * Saving an existing agent with its complete editor set MUST revoke every current editor grant
   * omitted from that set.
   */
  async updateConfiguration(
    auth: Authenticator,
    update: AgentConfigurationUpdate,
    { auditMetadata }: AgentAuditOptions = {}
  ): Promise<Result<{ resource: AgentResource; changed: boolean }, Error>> {
    if (this.scope === "global") {
      return new Err(new Error("Global agents cannot be updated."));
    }
    this.assertCurrentVersion();

    // A scope change needs no private content — `scope` is a core field carried by every resource.
    const scopeChange =
      update.scope !== undefined && update.scope !== this.scope
        ? update.scope
        : null;
    const targetStatus = update.status ?? this.status;

    // An editor-set change needs no private content either — editors are a separate grant list.
    let editorsChange: UserType[] | null = null;
    if (update.editors !== undefined) {
      const currentEditors = (await this.listEditors(auth)) ?? [];
      const currentIds = new Set(currentEditors.map((e) => e.id));
      const nextIds = new Set(update.editors.map((e) => e.id));
      const changed =
        currentIds.size !== nextIds.size ||
        [...nextIds].some((id) => !currentIds.has(id));
      editorsChange = changed ? update.editors : null;
    }

    // A new version is needed only when a definition field actually changes. The current
    // configuration is read (to diff and to fill the new version's unchanged columns) ONLY when a
    // definition field is provided AND the caller can view the content or holds `write` — any other
    // caller cannot create a version, so its definition fields are ignored (it may still change
    // scope/editors).
    const hasTagDelta =
      (update.addTags?.length ?? 0) > 0 || (update.removeTags?.length ?? 0) > 0;
    const providedDefinitionKeys = AGENT_CONFIGURATION_KEYS.filter(
      (key) => update[key] !== undefined
    );
    let versionParams: SaveAgentConfigurationParams | null = null;
    // Only the model and tags may be changed without `write`; any other changed definition field
    // forces the `write` gate below (see `model-change-requires-edit`/`tags-change-requires-edit`).
    let definitionChangeAllowsAdmin = false;
    let tagsChanged = false;
    // A protected-tag add/removal additionally requires the `publish` capability; captured here so
    // it can be enforced up front (see `agent-edit-in-place`), before any editor/version write.
    let protectedTagsChanged = false;
    if (
      (providedDefinitionKeys.length > 0 || hasTagDelta) &&
      (this.canViewContent || auth.can("write", this))
    ) {
      const resaveSourceRes = await this.getResaveSource(auth);
      if (resaveSourceRes.isErr()) {
        return resaveSourceRes;
      }
      const currentParams = await resaveSourceRes.value.buildResaveParams(auth);
      const mergedParams: SaveAgentConfigurationParams = { ...currentParams };
      for (const key of providedDefinitionKeys) {
        // Override each provided definition field; `model` is merged into the current one (the
        // update may be partial) rather than replaced. Scope/editors stay current (applied in place
        // below) and the author defaults to the current version's unless the caller sets it.
        if (key === "model") {
          mergedParams.model = { ...currentParams.model, ...update.model };
        } else {
          (mergedParams as Record<string, unknown>)[key] = update[key];
        }
      }
      // Tag deltas resolve against the (possibly just-overridden) tag set, so a bulk tag edit keeps
      // each agent's other tags while adding/removing the requested ones.
      if (hasTagDelta) {
        mergedParams.tags = applyTagDelta(mergedParams.tags, update);
      }
      mergedParams.authorId = update.authorId ?? currentParams.authorId;

      const currentCanonical =
        canonicalizeSaveParamsForComparison(currentParams);
      const mergedCanonical = canonicalizeSaveParamsForComparison(mergedParams);
      const changedDefinitionKeys = Object.keys(currentCanonical).filter(
        (key) =>
          key !== "scope" &&
          key !== "editors" &&
          !isEqual(currentCanonical[key], mergedCanonical[key])
      );
      if (changedDefinitionKeys.length > 0) {
        versionParams = mergedParams;
        definitionChangeAllowsAdmin = changedDefinitionKeys.every(
          (key) => key === "model" || key === "tags"
        );
        tagsChanged = changedDefinitionKeys.includes("tags");
        const protectedBefore = new Set(
          currentParams.tags
            .filter((tag) => tag.kind === "protected")
            .map((tag) => tag.sId)
        );
        const protectedAfter = new Set(
          mergedParams.tags
            .filter((tag) => tag.kind === "protected")
            .map((tag) => tag.sId)
        );
        protectedTagsChanged =
          protectedBefore.size !== protectedAfter.size ||
          [...protectedBefore].some((sId) => !protectedAfter.has(sId));
      }
    }

    if (!versionParams && !scopeChange && !editorsChange) {
      // Nothing changed: no version, no in-place write, no permission check (see
      // `save-skips-noop-version`).
      return new Ok({ resource: this, changed: false });
    }

    // Check every required permission up front so a save never partially succeeds.
    if (versionParams) {
      // Every changed definition field requires `write`, with two exceptions: the model may also be
      // changed with the agent `admin` verb (`model-change-requires-edit`), and tags may also be
      // changed by a workspace admin (`tags-change-requires-edit`) — a workspace admin because the
      // version is rebuilt from their readable view and only they read every space faithfully (see
      // `agent-edit-requires-write`).
      const adminCanEdit = tagsChanged
        ? auth.isAdmin()
        : auth.can("admin", this);
      const canEditDefinition =
        auth.can("write", this) ||
        (definitionChangeAllowsAdmin && adminCanEdit);
      if (!canEditDefinition) {
        return new Err(
          new Error("You don't have permission to edit this agent.")
        );
      }
      // A protected-tag add/removal requires `publish`; enforce it here — before editors or the
      // version are written — so a rejected protected-tag change never leaves other changes behind
      // (`syncAgentTags` re-checks it inside the transaction as defense in depth).
      if (
        protectedTagsChanged &&
        !auth.hasWorkspacePermission("publish", "agent")
      ) {
        return new Err(new Error("Protected tags cannot be added or removed."));
      }
    }
    if (scopeChange) {
      if (this.status === "archived" || targetStatus !== "active") {
        return new Err(new Error("Only active agents can change scope."));
      }
      if (!this.canChangeScope(auth)) {
        return new Err(
          new Error("You don't have permission to publish agents.")
        );
      }
    }
    if (editorsChange && !auth.can("admin", this)) {
      return new Err(
        new Error("You don't have permission to change this agent's editors.")
      );
    }

    // Editors are applied first: they are agent-level grants on the stable identity, so an invalid
    // editor set fails here — before a new version is written — rather than leaving a committed
    // version behind (see the no-partial-success clause of `agent-edit-in-place`).
    if (editorsChange) {
      const editorsRes = await syncAgentEditors(auth, {
        agentResource: this,
        editors: editorsChange,
        auditMetadata,
      });
      if (editorsRes.isErr()) {
        return editorsRes;
      }
    }
    // A new version carries only the definition change; scope/editors stay current on it and are
    // (re)applied in place through their own gated paths. `_saveConfiguration` archives the current
    // row and returns the resource for the NEW active version, which subsequent in-place changes must
    // target (the old row is now archived).
    let target: AgentResource = this;
    if (versionParams) {
      const versionRes = await AgentResource._saveConfiguration(
        auth,
        { ...versionParams, agentConfigurationId: this.sId },
        { auditMetadata }
      );
      if (versionRes.isErr()) {
        return versionRes;
      }
      target = versionRes.value;
    }
    // Scope is applied last, to the current version, so its trigger reconciliation (disabling the
    // triggers of users who are no longer editors of a now-hidden agent) sees the final editor set.
    if (scopeChange) {
      const scopeRes = await target.updateScopeInPlace(auth, scopeChange, {
        auditMetadata,
      });
      if (scopeRes.isErr()) {
        return scopeRes;
      }
    }

    // A new version already enqueues search indexation (see `_saveConfiguration`); an in-place-only
    // scope/editor change must enqueue it here so the agent's search document reflects the update.
    if (!versionParams) {
      await AgentResource.launchSearchIndexation(auth, [this.sId]);
    }

    const updated = await AgentResource.fetchById(auth, this.sId);
    return new Ok({ resource: updated ?? target, changed: true });
  }

  // A writer who cannot view the content (a regular admin API key on a hidden agent, see
  // `admin-key-agent-write`) rebuilds the new version from a caller-independent copy of the current
  // one.
  /**
   * @cc [owner:tdraier,label:security] resave-source-content
   * `getResaveSource` returns this resource to a caller who can view its content, a
   * caller-independent copy of the current version to a caller holding `write`, and an error to any
   * other caller. The copy's content MUST only flow into a new version of the agent
   * (`updateConfiguration`, the YAML patch of `patchAgentConfigurationFromJSON`) and MUST
   * NOT be returned to the caller (see `unreadable-agent-content-hidden`).
   */
  async getResaveSource(
    auth: Authenticator
  ): Promise<Result<AgentResource, Error>> {
    if (this.canViewContent) {
      return new Ok(this);
    }
    if (!auth.can("write", this)) {
      return new Err(
        new Error("Re-saving this agent requires write access to it.")
      );
    }
    const [current] = await AgentResource.loadResource(this.workspaceId, {
      id: [this.id],
    });
    if (
      !current ||
      current.agentConfigurationModelId !== this.agentConfigurationModelId
    ) {
      return new Err(
        new Error("The agent was modified concurrently, please retry.")
      );
    }
    return new Ok(current);
  }

  // Whether `auth` may publish or unpublish this agent. `write` never appears without `admin` on an
  // agent (editor grants bundle both, workspace admins hold `admin` by role), so `admin` alone is the
  // edit gate here.
  private canChangeScope(auth: Authenticator): boolean {
    return (
      auth.can("admin", this) && auth.hasWorkspacePermission("publish", "agent")
    );
  }

  // Changes this agent's scope in place — no new version. A no-op when the scope is unchanged, so it
  // is safe to call unconditionally and does not require permission for an unchanged value. A real
  // change requires scope-write permission (see `canChangeScope`) and, on `visible` -> `hidden`,
  // disables the triggers of non-editors.
  /**
   * @cc [owner:tdraier,label:security;product] scope-change-requires-edit-and-publish
   * Changing an active agent's scope requires `write` OR `admin` on the agent (resolved per-resource
   * via `auth.can`), plus the workspace-wide `publish` capability
   * (`auth.hasWorkspacePermission("publish", "agent")`). A draft or pending agent MUST remain hidden,
   * and an archived agent's scope MUST NOT be changed. This MUST be enforced wherever a scope is
   * written (`updateScopeInPlace`, and `bulkUpdate` per agent): the scope of an agent the caller does
   * not satisfy MUST NOT be written. `publish` is a workspace-wide capability (admins hold it by
   * default), never resolved per-resource or role-derived.
   */
  /**
   * @cc [owner:tdraier,label:security] hide-disables-non-editor-triggers
   * When an agent transitions `visible` -> `hidden`, every trigger whose editor is no longer an
   * editor of that agent MUST be disabled (non-editors lose access to a hidden agent); triggers of
   * current editors MUST remain untouched.
   */
  async updateScopeInPlace(
    auth: Authenticator,
    scope: Exclude<AgentConfigurationScope, "global">,
    { auditMetadata }: AgentAuditOptions = {}
  ): Promise<Result<undefined, Error>> {
    this.assertCurrentVersion();
    if (this.scope === scope) {
      return new Ok(undefined);
    }
    if (this.status !== "active") {
      return new Err(new Error("Only active agents can change scope."));
    }
    if (!this.canChangeScope(auth)) {
      return new Err(new Error("You don't have permission to publish agents."));
    }

    const previousScope = this.scope;
    const workspaceModelId = auth.getNonNullableWorkspace().id;
    await this.updateAgentIdentity(auth, { scope });
    // `scope` is a snapshot field, so the cached current version is now stale.
    await AgentResource.invalidateCache(workspaceModelId, this.sId);

    void emitAuditLogEvent({
      auth,
      action: "agent.scope_changed",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        buildAuditLogTarget("agent", this),
      ],
      context: getAuditLogContext(auth),
      metadata: {
        agent_name: this.name,
        previous_scope: previousScope,
        new_scope: scope,
        ...auditMetadata,
      },
    });

    // Hiding an agent removes non-editors' access to it, so their triggers must be disabled.
    if (scope === "hidden" && previousScope === "visible") {
      await AgentResource.disableTriggersForNonEditors(auth, [this]);
    }

    return new Ok(undefined);
  }

  // Writes a configuration version and the versioned data that belongs to it — tags, MCP actions and
  // skill associations (plus the initial editor grants of a brand-new agent) — in a single self-owned
  // managed transaction, so a failure anywhere rolls the whole save back before it is returned as
  // `Err`. This is the low-level version writer and ALWAYS creates a version; it does NOT change
  // scope or an existing agent's editor set (those are applied in place, see `agent-edit-in-place`).
  // The version-or-not decision lives in `updateConfiguration`; `makeNew` uses this to create an
  // agent's first version. (In `NODE_ENV=test` the ambient CLS transaction is reused with no
  // savepoint, so this rollback is not exercised by the suite — the test's own transaction rolls back
  // at teardown.)
  /**
   * @cc [owner:tdraier,label:backend] agent-save-atomic
   * The configuration row and the versioned data created with it — tags, MCP actions, skill
   * associations, and a brand-new agent's initial editor grants — MUST be committed in one
   * transaction owned by this method, so a failure in any part leaves no partial agent version behind
   * and needs no external rollback.
   */
  /**
   * @cc [owner:avervaet,label:security;product] credit-spend-alert-bypass-manager-only
   * Only workspace admins and managers MAY change whether an agent bypasses the credit spend
   * threshold alert; a save by anyone else MUST keep the previously stored value.
   */
  private static async _saveConfiguration(
    auth: Authenticator,
    {
      name,
      description,
      instructions,
      instructionsHtml,
      pictureUrl,
      status,
      scope,
      model,
      agentConfigurationId,
      templateId,
      requestedSpaceIds,
      tags,
      editors,
      authorId,
      reinforcement,
      ignoreCreditSpendThresholdAlert,
      actions = [],
      skills = [],
    }: {
      name: string;
      description: string;
      instructions: string | null;
      instructionsHtml: string | null;
      pictureUrl: string;
      status: AgentStatus;
      scope: Exclude<AgentConfigurationScope, "global">;
      model: AgentModelConfigurationType;
      agentConfigurationId?: string;
      templateId: string | null;
      requestedSpaceIds: number[];
      tags: TagType[];
      editors: UserType[];
      authorId: ModelId;
      reinforcement?: AgentReinforcementMode;
      ignoreCreditSpendThresholdAlert?: boolean;
      actions?: ServerSideMCPServerConfigurationType[];
      skills?: SkillResource[];
    },
    { auditMetadata }: AgentAuditOptions = {}
  ): Promise<Result<AgentResource, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }

    const persistedScope =
      status === "draft" || status === "pending" ? "hidden" : scope;

    const inputValidation = await validateAgentSaveInputs({
      pictureUrl,
      model,
    });
    if (inputValidation.isErr()) {
      return new Err(inputValidation.error);
    }

    const publishCheck = await assertPublishPermissionForScopeChange(auth, {
      agentConfigurationId,
      status,
      scope: persistedScope,
      owner,
    });
    if (publishCheck.isErr()) {
      return new Err(publishCheck.error);
    }

    try {
      let template: TemplateResource | null = null;
      let createdInitialEditorGrant = false;
      if (templateId) {
        template = await TemplateResource.fetchByExternalId(templateId, {
          includeUnpublished: true,
        });
      }
      const performCreation = async (
        t: Transaction
      ): Promise<AgentConfigurationModel> => {
        const { existingAgent, version } = await resolveExistingAgentAndVersion(
          auth,
          { agentConfigurationId, authorId, owner, transaction: t }
        );

        const sId = agentConfigurationId || generateRandomModelSId();
        // A brand-new agent needs its identity row before the configuration that references it, and
        // carries the head fields of the version 0 row written just below. `findOrCreate` covers an
        // identity left behind by an interrupted creation.
        let agentModelId = existingAgent?.agentId;
        let agentModel: AgentModel | null = null;
        if (!agentModelId) {
          const [agentIdentity] = await AgentModel.findOrCreate({
            where: { sId, workspaceId: owner.id },
            defaults: {
              sId,
              workspaceId: owner.id,
              name,
              status,
              scope: persistedScope,
              reinforcement: reinforcement ?? "auto",
              templateId: template?.id ?? null,
            },
            transaction: t,
          });
          agentModelId = agentIdentity.id;
          agentModel = agentIdentity;
        }

        const agentConfigurationInstance = await writeAgentConfigurationRow({
          existingAgent,
          sId,
          agentModelId,
          version,
          name,
          description,
          instructions,
          instructionsHtml,
          model,
          status,
          scope: persistedScope,
          pictureUrl,
          authorId,
          templateModelId: template?.id,
          requestedSpaceIds,
          reinforcement,
          ignoreCreditSpendThresholdAlert: auth.isManager()
            ? ignoreCreditSpendThresholdAlert
            : undefined,
          owner,
          transaction: t,
        });

        if (!agentModel) {
          agentModel = await AgentModel.findOne({
            where: { id: agentModelId, workspaceId: owner.id },
            transaction: t,
          });
        }
        assert(
          agentModel,
          `Unexpected: agent identity ${agentModelId} missing after save`
        );

        // A brand-new agent's identity was just created at version 0 with its head fields; an
        // upgrade or a pending activation moves the pointer and mirrors the new ones.
        if (existingAgent) {
          await AgentResource.fromModels(
            auth,
            agentModel,
            agentConfigurationInstance
          ).setCurrentConfiguration(auth, agentConfigurationInstance, {
            transaction: t,
          });
        }

        await syncAgentTags(auth, {
          existingAgent,
          agentConfigurationInstance,
          tags,
          status,
          owner,
          transaction: t,
        });

        // Editors are agent-level grants managed in place by `updateEditorsInPlace`, not a versioned
        // field: an existing agent's editors are already granted and carry across versions untouched,
        // so a new version re-grants nothing. Only a brand-new agent (active or the pending
        // placeholder) needs its initial editor grants.
        if ((status === "active" || status === "pending") && !existingAgent) {
          assert(
            editors.some((e) => e.id === authorId) || isAdmin(owner),
            "Unexpected: author must be an editor or admin"
          );
          await AgentResource.fromModels(
            auth,
            agentModel,
            agentConfigurationInstance
          ).grantEditors(auth, { editors, transaction: t });
          createdInitialEditorGrant = true;
        }

        // Create the MCP actions and skill associations in the same transaction as the
        // configuration row, so any failure rolls the whole save back and never leaves a partial
        // version behind (see `agent-save-atomic`).
        const savedResource = AgentResource.fromModels(
          auth,
          agentModel,
          agentConfigurationInstance
        );
        for (const action of actions) {
          const actionRes = await createAgentActionConfiguration(
            auth,
            action,
            savedResource,
            { transaction: t }
          );
          if (actionRes.isErr()) {
            throw actionRes.error;
          }
        }
        await AgentResource.createSkillLinks(auth, {
          agentConfigurationModelId: savedResource.agentConfigurationModelId,
          skills,
          transaction: t,
        });

        return agentConfigurationInstance;
      };

      // Self-owned managed transaction: a throw in `performCreation` auto-rolls-back the whole save
      // before it is converted to an `Err` (see `agent-save-atomic`).
      const agent = await withTransaction(performCreation);

      if (createdInitialEditorGrant) {
        // The initial grant was created after this authenticator's permission snapshot.
        await auth.refresh();
      }

      // The saved version becomes the agent's current version, so any cached resource is now stale
      // (a no-op for a brand-new agent from `makeNew`). The save above is a self-owned transaction,
      // already committed here, so invalidate immediately.
      await AgentResource.invalidateCache(owner.id, agent.sId);

      // Resolve the saved agent through the access-controlled resolver. In every real path the caller
      // is the author (or otherwise holds read), so they can view the content they just wrote.
      const resource = await AgentResource.fetchById(auth, agent.sId);
      if (resource === null) {
        return new Err(
          new Error("Unexpected: the saved agent could not be resolved.")
        );
      }

      // Recording the recent author reads the current version, so it needs `canViewContent`.
      if (resource.canViewContent) {
        await agentConfigurationWasUpdatedBy({ agent: resource, auth });
      }

      if (resource.status === "active") {
        const isCreate = !agentConfigurationId || agent.version === 0;
        void emitAuditLogEvent({
          auth,
          action: isCreate ? "agent.created" : "agent.updated",
          targets: [
            buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
            buildAuditLogTarget("agent", resource),
          ],
          context: getAuditLogContext(auth),
          metadata: {
            agent_name: resource.name,
            scope: persistedScope,
            model: `${model.providerId}/${model.modelId}`,
            ...auditMetadata,
          },
        });
      }

      if (!NON_INDEXABLE_AGENT_STATUSES.includes(resource.status)) {
        await AgentResource.launchSearchIndexation(auth, [resource.sId]);
      }

      return new Ok(resource);
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        return new Err(new Error("An agent with this name already exists."));
      }
      if (error instanceof ValidationError) {
        return new Err(new Error(error.message));
      }
      if (error instanceof SyntaxError) {
        return new Err(new Error(error.message));
      }
      if (error instanceof DustError) {
        return new Err(error);
      }
      if (error instanceof Error) {
        return new Err(error);
      }
      throw error;
    }
  }

  toLogJSON(): ResourceLogJSON {
    return {
      agentModelId: this.id,
      sId: this.sId,
      canViewContent: String(this.canViewContent),
    };
  }
}
