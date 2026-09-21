import { fetchMCPServerActionConfigurations } from "@app/lib/actions/configuration/mcp";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import { globalAgentReaderRoles } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { agentConfigurationWasUpdatedBy } from "@app/lib/api/assistant/recent_authors";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { getEffectiveReasoningEffort } from "@app/lib/llms/model_configurations";
import {
  AgentConfigurationModel,
  AgentModel,
  AgentUserRelationModel,
} from "@app/lib/models/agent/agent";
import {
  assertPublishPermissionForScopeChange,
  resolveAgentIdentity,
  resolveExistingAgentAndVersion,
  syncAgentTags,
  validateAgentSaveInputs,
  writeAgentConfigurationRow,
} from "@app/lib/resources/agent_configuration_save";
import type { AgentResourceCacheKey } from "@app/lib/resources/agent_resource_cache";
import {
  AGENT_RESOURCE_CACHE_ID,
  AGENT_RESOURCE_CACHE_VERSION,
  agentResourceCacheKey,
  invalidateAgentResourceCache,
  invalidateAgentResourceCaches,
} from "@app/lib/resources/agent_resource_cache";
import type { ResourceLogJSON } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { defineCachedResourceValue } from "@app/lib/resources/cached_resource_store";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { SkillFetchContext } from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TagResource } from "@app/lib/resources/tags_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { launchIndexAgentSearchWorkflow } from "@app/temporal/es_indexation/client";
import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";
import type {
  AgentConfigurationBaseType,
  AgentConfigurationScope,
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentModelConfigurationType,
  AgentReinforcementMode,
  AgentStatus,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { isAgentStatus } from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
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
import { removeNulls } from "@app/types/shared/utils/general";
import type { TagType } from "@app/types/tag";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import assert from "assert";
import uniq from "lodash/uniq";
import type { Attributes, Transaction } from "sequelize";
import { Op, UniqueConstraintError, ValidationError } from "sequelize";

const AGENT_SEARCH_INDEXATION_CONCURRENCY = 8;

// Legacy `canEdit` also allows changing the editor set, so the author fallback mirrors the full
// editor role rather than granting write alone.
const AGENT_EDITOR_VERBS: GrantVerb[] = ["read", "write", "admin"];

// Each agent in a bulk model update goes through a full save (new version + tools/skills recreated),
// so keep the parallelism low: enough to keep a large selection responsive, not enough to flood the
// connection pool.
const BULK_UPDATE_MODEL_CONCURRENCY = 4;

// Human workspace admins manage editors but must grant themselves editor access to change the agent.
// The admin role alone does not read a hidden agent (see the `hidden-agent-content` contract).
const HIDDEN_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["admin"] },
];

// Visible agents are readable by every workspace role. Kept explicit (not spread from
// `HIDDEN_AGENT_ROLE_GRANTS`) so the admin role keeps `read` here even though it does not on hidden.
const VISIBLE_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["read", "admin"] },
  { role: "manager", permissions: ["read"] },
  { role: "builder", permissions: ["read"] },
  { role: "user", permissions: ["read"] },
  { role: "none", permissions: ["read"] },
];

// Full-only payload: every `AgentConfigurationModel` column that is not part of the identity/core
// carried by both shapes. Present only on `full` resources (see `AgentResource` variants).
export type AgentResourceContent = {
  version: number;
  instructions: string | null;
  instructionsHtml: string | null;
  maxStepsPerRun: number;
  templateId: ModelId | null;
  reinforcement: AgentReinforcementMode;
  lastReinforcementAnalysisAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AgentResourceExtraBlob = {
  agentConfigurationModelId: ModelId;
  scope: AgentConfigurationScope;
  name: string;
  description: string;
  status: AgentConfigurationStatus;
  pictureUrl: string;
  versionAuthorId: ModelId | null;
  requestedSpaceIds: ModelId[];
  modelConfiguration: AgentModelConfigurationType;
  codeDefinedSkillIds: string[];
  content: AgentResourceContent | null;
};

// The outcome of a bulk mutation (`bulkUpdateScope` writes the scope in place; `bulkUpdateModel`
// saves a new version): the agents that were written, and the requested ids that were skipped (not
// resolvable, not editable by the caller, archived, or failed to save). Reported back so callers
// can tell the UI what was applied.
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
  // MCP action configurations to create atomically with the agent version. Created inside the same
  // transaction as the configuration row (see `agent-save-atomic`), so a failure rolls the whole
  // save back and no partial version is ever committed. Defaults to none.
  actions?: ServerSideMCPServerConfigurationType[];
  // Skill associations to attach atomically with the agent version, in the same transaction.
  // Defaults to none.
  skills?: SkillResource[];
};

// A `full` resource always exposes its `content`.
export interface FullAgentResource extends AgentResource {
  readonly variant: "full";
}

// JSON-serializable model configuration: the optional `reasoningEffort`/`responseFormat` become
// `null` (JSON drops `undefined`), everything else is JSON-native.
type SerializedModelConfiguration = {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  temperature: number;
  reasoningEffort: ReasoningEffort | null;
  responseFormat: string | null;
};

// JSON-serializable form of `AgentResourceContent`: Date columns become epoch millis.
type SerializedAgentResourceContent = Omit<
  AgentResourceContent,
  "lastReinforcementAnalysisAt" | "createdAt" | "updatedAt"
> & {
  lastReinforcementAnalysisAt: number | null;
  createdAt: number;
  updatedAt: number;
};

// Cached shape of a `full` custom `AgentResource`. Hand-written (the resource spans two tables and
// reshapes columns), so `AGENT_RESOURCE_CACHE_VERSION` MUST be bumped on any change; a test asserts
// its `content` stays in sync with `AgentResourceContent`.
export type AgentResourceSnapshot = {
  agentModelId: ModelId;
  agentConfigurationModelId: ModelId;
  workspaceId: ModelId;
  sId: string;
  // The agent row's `createdAt` (epoch millis). Distinct from `content.createdAt`, which is the
  // configuration version's timestamp — `agents.createdAt` is independent since it is backfilled.
  createdAt: number;
  scope: AgentConfigurationScope;
  name: string;
  description: string;
  status: AgentConfigurationStatus;
  pictureUrl: string;
  versionAuthorId: ModelId | null;
  requestedSpaceIds: ModelId[];
  modelConfiguration: SerializedModelConfiguration;
  content: SerializedAgentResourceContent;
};

// Ship the cache dark: wired end to end but touching no Redis. Flip to `false` to turn it on.
const AGENT_RESOURCE_CACHE_DRY_RUN = true;

// The stable identity of an agent, backed by `AgentModel` (so `id` is the agent's `agentModelId`).
// It comes in two shapes, discriminated by `variant`:
// - `light`: identity + `agentConfigurationModelId`/`scope`/`name`/`description`/`status`/
//   `pictureUrl`/`versionAuthorId`/`requestedSpaceIds`/`modelConfiguration`, built without a query
//   from a configuration already in hand. These core fields are not read-gated — they are carried
//   by every resource — and are sufficient for permission decisions.
// - `full`: additionally carries `content` (every remaining `AgentConfigurationModel` column of the
//   resolved version). Produced by the access-controlled `fetch*` resolvers.
/**
 * @cc [owner:tdraier,label:backend] agent-resource-identity
 * The authoritative resolvers `fetchByModelIdWithAuth`/`fetchByModelIds`/`fetchById(s)` MUST resolve
 * a custom agent to its current configuration version — the row its `currentVersion` pointer
 * designates (see `fetch-current-version`) — so two fetched resources sharing an `id`
 * (= `agentModelId`) are consistent at a given time. The `from*` factories are an unchecked fast
 * path: they build a resource from whatever configuration the caller supplies, and do NOT yet
 * guarantee it is the current version — a caller deciding about the agent's current state must pass
 * that version, or use `fetch*`. (`from*` are intended to become private and enforce this.) Global
 * agents are exempt from the `id`-consistency clause: they have no `agent` row, are identified by
 * `sId`, and all share the `id: -1` sentinel.
 */
/**
 * @cc [owner:sfriquet,label:security] unreadable-agent-is-light
 * A resource built for a caller who does not hold `read` on the agent (per `getAllowedVerbs`) MUST
 * be `light`: `content` — instructions, `instructionsHtml`, template, reinforcement and the
 * version dates — is never materialized for that caller, whatever their role, key type, or
 * superuser status. This holds for every `fetch*` resolver and for `fromAgentConfigurationModel`,
 * so a caller allowed to enumerate agents they cannot read (an admin listing hidden agents, a
 * superuser) sees identity and core fields only. Callers MUST NOT re-attach private fields to a
 * `light` resource from another read path.
 */
/**
 * @cc [owner:philipperolet,label:security;product] agent-verbs
 * The verbs a caller holds on an agent mean:
 * - `read`: seeing the agent's full configuration and using it. Mentioning or running an agent
 *   MUST require `read`. A custom agent grants it only when the agent is workspace-visible or the
 *   caller has editor access, and when the caller can read every space in `requestedSpaceIds` (see
 *   `agent-read-requires-space-read`).
 * - `write`: editing the agent's definition: configuration versions, tags, model, skills, linked
 *   Slack channels, archiving and restoring.
 * - `admin`: managing the agent's editors. `admin` alone MUST NOT allow changing the definition,
 *   and `write` alone MUST NOT allow changing the editors.
 * Holding any verb makes the agent fetchable, but without `read` only its light core fields may be
 * exposed (see `unreadable-agent-is-light`). The explicit `admin_can_see_private_entities` admin
 * override is the only exception and may expose the full configuration.
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
 * workspace. Moving an active agent to scope `visible`, or an active visible agent to `hidden`,
 * MUST require `hasWorkspacePermission("publish", "agent")`, even for its editors. Editing an
 * agent without changing that, or changing the scope of a draft, pending or archived agent, MUST
 * NOT require it. Protected tags and linking Slack channels to an agent are gated by it too.
 */
/**
 * @cc [owner:tdraier,label:security] agent-edit-requires-write
 * Saving a new configuration version of an existing agent (`updateConfiguration`) MUST require
 * `write` on that agent (`auth.can("write", this)`), enforced inside the resource — callers may
 * double-check, but MUST NOT be the sole gate. `read` alone (any member can read a visible agent)
 * MUST NOT allow editing. For human and system-key callers the workspace `admin` role alone (which
 * grants `admin`, not `write`, on agents they do not edit) MUST NOT allow editing either. Regular
 * API keys are the sole exception: the admin role grants them `write` (see `admin-key-agent-write`),
 * so an admin key may edit an agent it holds no editor grant on. This requirement is scoped to
 * `updateConfiguration`: the self-gated governance path `bulkUpdateModel` saves a new version through
 * `_saveConfiguration` directly, admitting `write` OR `admin` (see `model-change-requires-edit`), so a
 * workspace admin MAY re-model an agent they do not edit; that path MUST remain a model-only re-save
 * of the agent as-is and MUST NOT change any other part of its definition.
 */
export class AgentResource
  extends BaseResource<AgentModel>
  implements WithAccessControl
{
  readonly sId: string;
  readonly workspaceId: ModelId;
  // The agent's creation date (its `agents` row, not the current version's). A core field, so it is
  // carried by `light` resources too. Only `fetch*`-built resources carry the real date: the `from*`
  // factories have no `agents` row in hand and stamp a placeholder (see `fromAgentConfiguration`).
  readonly createdAt: Date;
  // Bumped whenever the agent's `currentVersion` pointer moves, so it tracks the last edit.
  readonly updatedAt: Date;
  readonly agentConfigurationModelId: ModelId;
  readonly scope: AgentConfigurationScope;
  readonly name: string;
  readonly description: string;
  readonly status: AgentConfigurationStatus;
  readonly pictureUrl: string;
  readonly versionAuthorId: ModelId | null;
  private readonly requestedSpaceIds: ModelId[];
  readonly modelConfiguration: AgentModelConfigurationType;
  private readonly codeDefinedSkillIds: string[];
  // Mutable so a light resource can be enriched to full in place once read access is confirmed
  // (see `fromAgentConfigurationModel`). `variant` is derived from its presence.
  private _content: AgentResourceContent | null;

  // The loading caller's permission context, stamped by `materializeResource` at the per-call read
  // boundary — NOT on the caller-independent, cacheable `content`.
  private _verbs: Set<GrantVerb> = new Set();
  private _isRegularApiKey = false;

  private constructor(
    blob: Attributes<AgentModel>,
    extra: AgentResourceExtraBlob
  ) {
    super(AgentModel, blob);

    this.sId = blob.sId;
    this.workspaceId = blob.workspaceId;
    this.createdAt = blob.createdAt;
    this.updatedAt = blob.updatedAt;
    this.agentConfigurationModelId = extra.agentConfigurationModelId;
    this.scope = extra.scope;
    this.name = extra.name;
    this.description = extra.description;
    this.status = extra.status;
    this.pictureUrl = extra.pictureUrl;
    this.versionAuthorId = extra.versionAuthorId;
    this.requestedSpaceIds = extra.requestedSpaceIds;
    this.modelConfiguration = extra.modelConfiguration;
    this.codeDefinedSkillIds = extra.codeDefinedSkillIds;
    this._content = extra.content;
  }

  get variant(): "light" | "full" {
    return this._content === null ? "light" : "full";
  }

  isFull(): this is FullAgentResource {
    return this._content !== null;
  }

  get content(): AgentResourceContent {
    assert(
      this._content !== null,
      "Unexpected: `content` accessed on a light AgentResource"
    );

    return this._content;
  }

  // -- Light factories (no query; identity + core only) --
  // Built without the `agents` row, so `createdAt` is a placeholder (`new Date()`): a caller
  // reasoning about the agent's age must use a `fetch*` resolver.

  static fromAgentConfiguration(
    auth: Authenticator,
    configuration: LightAgentConfigurationType
  ): AgentResource {
    assert(configuration.scope !== "global");
    assert(
      configuration.agentModelId !== null,
      "Unexpected: custom agent identity is missing"
    );
    assert(
      configuration.versionAuthorId !== null,
      "Unexpected: custom agent author is missing"
    );

    return new AgentResource(
      {
        id: configuration.agentModelId,
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: configuration.sId,
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersion: configuration.version,
      },
      {
        agentConfigurationModelId: configuration.id,
        scope: configuration.scope,
        name: configuration.name,
        description: configuration.description,
        status: configuration.status,
        pictureUrl: configuration.pictureUrl,
        versionAuthorId: configuration.versionAuthorId,
        // `LightAgentConfigurationType.requestedSpaceIds` are space sIds; the resource holds model ids.
        requestedSpaceIds: removeNulls(
          configuration.requestedSpaceIds.map(getResourceIdFromSId)
        ),
        modelConfiguration: configuration.model,
        codeDefinedSkillIds: [],
        content: null,
      }
    );
  }

  static fromAgentConfigurations(
    auth: Authenticator,
    configurations: LightAgentConfigurationType[]
  ): AgentResource[] {
    return configurations.map((configuration) =>
      this.fromAgentConfiguration(auth, configuration)
    );
  }

  // Global agents are code-defined and have no `agent`/configuration rows; their
  // `AgentConfigurationType` is built from synthetic values by `getGlobalAgent(s)`.
  static fromGlobalAgent(
    auth: Authenticator,
    configuration: AgentConfigurationType
  ): AgentResource {
    assert(isGlobalAgentId(configuration.sId));

    return new AgentResource(
      {
        // No `agent` identity row; `-1` mirrors their synthetic configuration id.
        id: -1,
        workspaceId: auth.getNonNullableWorkspace().id,
        sId: configuration.sId,
        createdAt: new Date(),
        updatedAt: new Date(),
        currentVersion: configuration.version,
      },
      {
        agentConfigurationModelId: configuration.id,
        scope: "global",
        name: configuration.name,
        description: configuration.description,
        status: configuration.status,
        pictureUrl: configuration.pictureUrl,
        versionAuthorId: null,
        requestedSpaceIds: [],
        modelConfiguration: configuration.model,
        codeDefinedSkillIds: configuration.codeDefinedSkillIds ?? [],
        content: null,
      }
    );
  }

  // -- Full/light factory --

  // Caller-independent: builds the `full` resource (identity + core + `content`) from a configuration
  // row and, when available, its agent row, with no read-access decision folded in. This is the shape
  // the cache stores; the downgrade is applied separately at the read boundary (`materializeResource`).
  // `agent` is null on the `fromAgentConfigurationModel` path, where only a configuration is in hand;
  // the identity is then derived from the configuration (its `agentId`/`version` match the agent).
  private static buildResource(
    agent: AgentModel | null,
    configuration: AgentConfigurationModel
  ): FullAgentResource {
    const resource = new AgentResource(
      agent
        ? {
            id: agent.id,
            workspaceId: agent.workspaceId,
            sId: agent.sId,
            createdAt: agent.createdAt,
            updatedAt: agent.updatedAt,
            currentVersion: agent.currentVersion,
          }
        : {
            id: configuration.agentId,
            workspaceId: configuration.workspaceId,
            sId: configuration.sId,
            createdAt: configuration.createdAt,
            updatedAt: configuration.updatedAt,
            currentVersion: configuration.version,
          },
      {
        agentConfigurationModelId: configuration.id,
        scope: configuration.scope,
        name: configuration.name,
        description: configuration.description,
        status: configuration.status,
        pictureUrl: configuration.pictureUrl,
        versionAuthorId: configuration.authorId,
        requestedSpaceIds: configuration.requestedSpaceIds,
        modelConfiguration: {
          providerId: configuration.providerId,
          modelId: configuration.modelId,
          temperature: configuration.temperature,
          reasoningEffort: configuration.reasoningEffort ?? undefined,
          responseFormat: configuration.responseFormat ?? undefined,
        },
        codeDefinedSkillIds: [],
        content: {
          version: configuration.version,
          instructions: configuration.instructions,
          instructionsHtml: configuration.instructionsHtml,
          maxStepsPerRun: configuration.maxStepsPerRun,
          templateId: configuration.templateId,
          reinforcement: configuration.reinforcement,
          lastReinforcementAnalysisAt:
            configuration.lastReinforcementAnalysisAt,
          createdAt: configuration.createdAt,
          updatedAt: configuration.updatedAt,
        },
      }
    );

    return resource as FullAgentResource;
  }

  // Materializes the caller-dependent state onto a full resource (`_verbs`, `_isRegularApiKey`, and
  // the read-access downgrade to `light`). The resource is a fresh per-call instance, so mutating it
  // here never affects a cached value.
  private static materializeResource(
    auth: Authenticator,
    cachedResource: FullAgentResource
  ): AgentResource {
    const verbs = cachedResource.getAllowedVerbs(auth);
    cachedResource._verbs = verbs;
    cachedResource._isRegularApiKey = auth.isKey() && !auth.isSystemKey();

    if (!verbs.has("read")) {
      cachedResource._content = null;
    }

    return cachedResource;
  }

  // Builds a resource from an already-loaded configuration row: `full` (with `content`) when the
  // caller can read the agent, `light` otherwise.
  static fromAgentConfigurationModel(
    auth: Authenticator,
    configuration: AgentConfigurationModel
  ): AgentResource {
    return this.materializeResource(
      auth,
      this.buildResource(null, configuration)
    );
  }

  // -- Resolvers: current version, full when readable, light otherwise --

  /**
   * @cc [owner:tdraier,label:backend] fetch-current-version
   * Resolves each requested custom agent to its current configuration version — the row whose
   * `version` equals the agent's `currentVersion` pointer (see `agent-current-version-pointer`) —
   * scoped to the authed workspace. Each is returned as a `full` resource when the caller can read
   * it, otherwise a `light` resource; a resource the caller cannot fetch at all (holds no verb on,
   * per `canFetch`) is dropped. An agent with no configuration yields no resource, and at most one
   * resource is returned per `agentModelId`. `fetchById(s)` additionally resolve global agents by
   * `sId` (they have no configuration rows) via `getGlobalAgents`, gated by the same `canFetch`
   * check; `fetchByModelId(s)` cannot, since global agents have no `agentModelId`.
   */
  static async fetchByModelIds(
    auth: Authenticator,
    agentModelIds: ModelId[]
  ): Promise<AgentResource[]> {
    if (agentModelIds.length === 0) {
      return [];
    }

    return this.fetchCurrentVersions(auth, { id: agentModelIds });
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

  static async fetchByIds(
    auth: Authenticator,
    agentIds: string[]
  ): Promise<AgentResource[]> {
    if (agentIds.length === 0) {
      return [];
    }

    const globalAgentIds = agentIds.filter(isGlobalAgentId);
    const customAgentIds = agentIds.filter((id) => !isGlobalAgentId(id));

    const [customResources, globalResources] = await Promise.all([
      customAgentIds.length > 0
        ? this.fetchCurrentVersions(auth, { sId: customAgentIds })
        : [],
      this.fetchGlobalAgents(auth, globalAgentIds),
    ]);

    return [...customResources, ...globalResources];
  }

  // Global agents are code-defined and have no `agent`/configuration rows, so they cannot be
  // resolved by the version query; they are built from `getGlobalAgents` (which enforces workspace
  // plan/availability) and gated by the same `canFetch` check as custom agents.
  private static async fetchGlobalAgents(
    auth: Authenticator,
    globalAgentIds: string[]
  ): Promise<AgentResource[]> {
    if (globalAgentIds.length === 0) {
      return [];
    }

    const configurations = await getGlobalAgents(auth, globalAgentIds, "light");
    return configurations
      .map((configuration) => this.fromGlobalAgent(auth, configuration))
      .filter((resource) => resource.canFetch(auth));
  }

  static async fetchById(
    auth: Authenticator,
    agentId: string
  ): Promise<AgentResource | null> {
    // Global agents have no configuration rows and are never cached; resolve them through the
    // uncached global path (`fetchByIds` -> `fetchGlobalAgents`).
    if (isGlobalAgentId(agentId)) {
      const [resource] = await this.fetchByIds(auth, [agentId]);
      return resource ?? null;
    }

    const cachedResource = await this.cache.fetch({
      workspaceModelId: auth.getNonNullableWorkspace().id,
      id: agentId,
    });
    if (!cachedResource) {
      return null;
    }

    // `canFetch` and the read-access downgrade are caller-dependent, so they run here on a fresh
    // instance, never cached. A caller holding no verb on the agent gets nothing.
    const resource = this.materializeResource(auth, cachedResource);
    return resource.canFetch(auth) ? resource : null;
  }

  // Caller-independent query: the current `full` resource of each identified agent — the row whose
  // `version` equals the agent's `currentVersion` pointer, joined via the unique `(agentId, version)`
  // index — one per agent, scoped to the workspace. No read-access decision is folded in; that is the
  // caller's job (see `fetchCurrentVersions`/`fetchById`). Takes a bare `workspaceId` so both the
  // access-controlled resolvers and the cache seam can share it.
  private static async loadResource(
    workspaceId: ModelId,
    identityWhere: { id: ModelId[] } | { sId: string[] }
  ): Promise<FullAgentResource[]> {
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
          where: { version: { [Op.col]: "agent.currentVersion" } },
        },
      ],
    });

    return agents.flatMap((agent) => {
      // `required: true` + `version = currentVersion` yields exactly one configuration per agent.
      const configurations = agent.get(
        "agent_configurations"
      ) as AgentConfigurationModel[];
      return configurations.map((configuration) =>
        this.buildResource(agent, configuration)
      );
    });
  }

  // The access-controlled resolver: each current-version resource, downgraded to `light` when the
  // caller cannot read it and dropped when the caller holds no verb on it (`canFetch`).
  private static async fetchCurrentVersions(
    auth: Authenticator,
    identityWhere: { id: ModelId[] } | { sId: string[] }
  ): Promise<AgentResource[]> {
    const cachedResources = await this.loadResource(
      auth.getNonNullableWorkspace().id,
      identityWhere
    );

    return cachedResources
      .map((cachedResource) => this.materializeResource(auth, cachedResource))
      .filter((resource) => resource.canFetch(auth));
  }

  /**
   * @cc [owner:tdraier,label:backend;performance] agent-resource-cache
   * The cache holds the caller-independent full resource; the caller-dependent `canFetch` and
   * `materializeResource` gates MUST run on every read and MUST NOT be cached. Entries have no TTL, so
   * every write that changes or deletes an agent's cached version MUST invalidate its entry — via
   * `AgentResource.invalidateCache` here, or the leaf `invalidateAgentResourceCache`/
   * `invalidateAgentResourceCaches` helpers that lower-level write and deletion paths can import
   * without forming a cycle back to this resource.
   */
  private static readonly cache = defineCachedResourceValue<
    AgentResourceCacheKey,
    AgentResourceSnapshot,
    FullAgentResource
  >({
    id: AGENT_RESOURCE_CACHE_ID,
    version: AGENT_RESOURCE_CACHE_VERSION,
    key: agentResourceCacheKey,
    dryRun: AGENT_RESOURCE_CACHE_DRY_RUN,
    loadFromDatabase: async ({ workspaceModelId, id }) => {
      const [cachedResource] = await AgentResource.loadResource(
        workspaceModelId,
        {
          sId: [id],
        }
      );
      return cachedResource ?? null;
    },
    toSnapshot: (cachedResource) => cachedResource.toSnapshot(),
    fromSnapshot: (snapshot) => AgentResource.fromSnapshot(snapshot),
  });

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
    const { content, modelConfiguration } = this;

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
      versionAuthorId: this.versionAuthorId,
      requestedSpaceIds: this.requestedSpaceIds,
      modelConfiguration: {
        providerId: modelConfiguration.providerId,
        modelId: modelConfiguration.modelId,
        temperature: modelConfiguration.temperature,
        reasoningEffort: modelConfiguration.reasoningEffort ?? null,
        responseFormat: modelConfiguration.responseFormat ?? null,
      },
      content: {
        ...content,
        lastReinforcementAnalysisAt:
          content.lastReinforcementAnalysisAt?.getTime() ?? null,
        createdAt: content.createdAt.getTime(),
        updatedAt: content.updatedAt.getTime(),
      },
    };
  }

  // Rebuilds a `full` resource from a cached snapshot. Inverse of `toSnapshot`.
  static fromSnapshot(snapshot: AgentResourceSnapshot): FullAgentResource {
    const { content, modelConfiguration } = snapshot;

    const resource = new AgentResource(
      {
        id: snapshot.agentModelId,
        workspaceId: snapshot.workspaceId,
        sId: snapshot.sId,
        // The agent row's own timestamp — NOT the version's (`content.createdAt`).
        createdAt: new Date(snapshot.createdAt),
        // `updatedAt` is not surfaced on the resource; the version's stands in harmlessly.
        updatedAt: new Date(content.updatedAt),
        // The cached row is the current version, so its version is the agent's `currentVersion`.
        currentVersion: content.version,
      },
      {
        agentConfigurationModelId: snapshot.agentConfigurationModelId,
        scope: snapshot.scope,
        name: snapshot.name,
        description: snapshot.description,
        status: snapshot.status,
        pictureUrl: snapshot.pictureUrl,
        versionAuthorId: snapshot.versionAuthorId,
        requestedSpaceIds: snapshot.requestedSpaceIds,
        modelConfiguration: {
          providerId: modelConfiguration.providerId,
          modelId: modelConfiguration.modelId,
          temperature: modelConfiguration.temperature,
          reasoningEffort: modelConfiguration.reasoningEffort ?? undefined,
          responseFormat: modelConfiguration.responseFormat ?? undefined,
        },
        codeDefinedSkillIds: [],
        content: {
          ...content,
          lastReinforcementAnalysisAt:
            content.lastReinforcementAnalysisAt !== null
              ? new Date(content.lastReinforcementAnalysisAt)
              : null,
          createdAt: new Date(content.createdAt),
          updatedAt: new Date(content.updatedAt),
        },
      }
    );

    return resource as FullAgentResource;
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
    const editors = editorsByAgentId.get(this.sId);
    assert(editors !== undefined);

    return editors;
  }

  /**
   * @cc [owner:philipperolet,label:backend] editor-results-by-agent
   * Each input agent has a map entry: `null` for globals and active workspace members
   * of its editor grant for custom agents, or `[]` when there are none.
   */
  static async batchListEditors(
    auth: Authenticator,
    agents: AgentResource[],
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Map<string, UserResource[] | null>> {
    const result = new Map<string, UserResource[] | null>(
      agents.map((agent) => [agent.sId, null])
    );
    const customAgents = agents.filter((agent) => agent.scope !== "global");
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
    const { memberships } = await MembershipResource.getActiveMemberships({
      users,
      workspace: auth.getNonNullableWorkspace(),
      transaction,
    });
    const activeUserModelIds = new Set(
      memberships.map((membership) => membership.userId)
    );
    const userByModelId = new Map(
      users
        .filter((user) => activeUserModelIds.has(user.id))
        .map((user) => [user.id, user])
    );

    for (const agent of customAgents) {
      const group = groupByAgentModelId.get(agent.id);
      const memberModelIds = group
        ? (membershipsByGroupId[group.id] ?? [])
        : [];
      result.set(
        agent.sId,
        removeNulls(
          memberModelIds.map((userModelId) => userByModelId.get(userModelId))
        )
      );
    }

    return result;
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

    return new Ok(undefined);
  }

  /**
   * @cc [owner:sfriquet,label:backend;concurrency] agent-search-after-commit
   * Agent mutations enqueue workspace-scoped agent sIds after their existing writes.
   * Failed workflow launch results are logged without failing the mutation.
   */
  static async launchSearchIndexation(
    auth: Authenticator,
    agentIds: string[]
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();
    if (agentIds.length === 0) {
      return;
    }
    const results = await concurrentExecutor(
      uniq(agentIds),
      (agentId) =>
        launchIndexAgentSearchWorkflow({ workspaceId: workspace.sId, agentId }),
      { concurrency: AGENT_SEARCH_INDEXATION_CONCURRENCY }
    );
    const failedResult = results.find((result) => result.isErr());
    if (failedResult?.isErr()) {
      logger.error(
        { error: failedResult.error, workspaceId: workspace.sId, agentIds },
        "Failed to launch agent search indexation"
      );
    }
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

  // Rescopes the agents the caller is allowed to (un)publish, emits the `agent.scope_changed` audit
  // event, and on hide disables the triggers of non-editors. `loadResource` resolves rows
  // caller-independently so an editor/admin is not blocked on agents backed by spaces they cannot
  // read ("Show hidden agents").
  /**
   * @cc [owner:tdraier,label:security;product] scope-change-requires-edit-and-publish
   * (Un)publishing an agent — changing its scope — requires BOTH the `publish` agent capability AND
   * `write` or `admin` on the agent. Both MUST be enforced here, on the resource, and are the sole
   * authorization for a scope write: the loaded rows MUST be filtered by
   * `auth.can("publish", r) && (auth.can("write", r) || auth.can("admin", r))`, and the scope of an
   * agent the caller does not fully satisfy MUST NOT be written. `publish` is a workspace-wide
   * capability that `getGovernanceGrantVerbs` folds into every instance's verbs, so it resolves
   * per-resource via `auth.can("publish", r)` (it is grant-backed, never role-derived).
   */
  /**
   * @cc [owner:tdraier,label:security] hide-disables-non-editor-triggers
   * When an agent transitions `visible` -> `hidden`, every trigger whose editor is no longer an
   * editor of that agent MUST be disabled (non-editors lose access to a hidden agent); triggers of
   * current editors MUST remain untouched.
   */
  static async bulkUpdateScope(
    auth: Authenticator,
    agentIds: string[],
    scope: Exclude<AgentConfigurationScope, "global">,
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<BulkAgentUpdateResult> {
    if (agentIds.length === 0) {
      return { updatedAgentIds: [], skippedAgentIds: [] };
    }

    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const resources = (
      await this.loadResource(workspaceModelId, { sId: agentIds })
    ).filter(
      (r) =>
        r.status !== "archived" &&
        auth.can("publish", r) &&
        (auth.can("write", r) || auth.can("admin", r))
    );
    const updatedAgentIds = resources.map((r) => r.sId);
    const updatedIdSet = new Set(updatedAgentIds);
    const skippedAgentIds = agentIds.filter((id) => !updatedIdSet.has(id));
    if (resources.length === 0) {
      return { updatedAgentIds, skippedAgentIds };
    }

    // Snapshot previous scopes before the bulk UPDATE: the static Sequelize update does not touch the
    // in-memory resources, but the trigger step below depends on which agents transitioned.
    const previousScopeByAgentId = new Map(
      resources.map((r) => [r.sId, r.scope])
    );

    await AgentConfigurationModel.update(
      { scope },
      {
        where: {
          id: {
            [Op.in]: resources.map((r) => r.agentConfigurationModelId),
          },
          workspaceId: workspaceModelId,
        },
        transaction,
      }
    );

    // `scope` is a snapshot field, so each updated agent's cached current version changed.
    await invalidateAgentResourceCaches(
      workspaceModelId,
      updatedAgentIds,
      transaction
    );

    // Audit and trigger-disable are post-mutation side effects: they must reflect a durable scope
    // change, so defer them until a supplied transaction commits (run inline when there is none).
    const applySideEffects = async () => {
      for (const resource of resources) {
        void emitAuditLogEvent({
          auth,
          action: "agent.scope_changed",
          targets: [
            buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
            buildAuditLogTarget("agent", resource),
          ],
          context: getAuditLogContext(auth),
          metadata: {
            agent_name: resource.name,
            previous_scope:
              previousScopeByAgentId.get(resource.sId) ?? resource.scope,
            new_scope: scope,
          },
        });
      }

      // Hiding an agent removes non-editors' access to it, so their triggers must be disabled.
      if (scope === "hidden") {
        const transitioningAgents = resources.filter(
          (r) => previousScopeByAgentId.get(r.sId) === "visible"
        );
        if (transitioningAgents.length > 0) {
          await this.disableTriggersForNonEditors(auth, transitioningAgents);
        }
      }
    };

    if (transaction) {
      transaction.afterCommit(applySideEffects);
    } else {
      await applySideEffects();
    }

    return { updatedAgentIds, skippedAgentIds };
  }

  // Builds the save params that recreate this agent's current version as-is — its full configuration,
  // including tags, editors, tools and skills. Override a field on the result to save a new version
  // that changes only that (e.g. the model in `bulkUpdateModel`). `this` must be `full`.
  async buildResaveParams(
    auth: Authenticator
  ): Promise<SaveAgentConfigurationParams> {
    // Loaded custom agents are never global, and their stored status is always an `AgentStatus`
    // (the `disabled_*` values are global-only); narrow both from the resource's wider types.
    assert(this.scope !== "global");
    if (!isAgentStatus(this.status)) {
      throw new Error(
        `Unexpected: non-global agent ${this.sId} has status "${this.status}".`
      );
    }

    const [tags, editors, skills] = await Promise.all([
      TagResource.listForAgent(auth, this.agentConfigurationModelId),
      this.listEditors(auth),
      // No space filtering: tools and skills are carried over as-is, so re-saving an agent behind a
      // space the caller cannot read keeps them rather than dropping them.
      this.listSkills(auth, { permissionFiltering: "dangerously_skip" }),
    ]);
    const actionsByConfigId = await fetchMCPServerActionConfigurations(auth, {
      configurationModelIds: [this.agentConfigurationModelId],
      variant: "full",
    });
    const actions = (
      actionsByConfigId.get(this.agentConfigurationModelId) ?? []
    ).filter(isServerSideMCPServerConfiguration);

    return {
      name: this.name,
      description: this.description,
      instructions: this.content.instructions,
      instructionsHtml: this.content.instructionsHtml,
      pictureUrl: this.pictureUrl,
      status: this.status,
      scope: this.scope,
      model: this.modelConfiguration,
      templateId: this.content.templateId
        ? TemplateResource.modelIdToSId({ id: this.content.templateId })
        : null,
      requestedSpaceIds: this.requestedSpaceIds,
      tags: tags.map((tag) => tag.toJSON()),
      editors: (editors ?? []).map((editor) => editor.toJSON()),
      // Preserve the version's author rather than re-attributing it to the caller.
      authorId: this.versionAuthorId ?? auth.getNonNullableUser().id,
      reinforcement: this.content.reinforcement,
      actions,
      skills,
    };
  }

  // Saves a new version of each editable agent with the model swapped and everything else carried
  // over unchanged. Self-gated (`write || admin`) then saved via the ungated `_saveConfiguration`,
  // so an admin can re-model agents they do not edit (see `agent-edit-requires-write`).
  /**
   * @cc [owner:tdraier,label:security] model-change-requires-edit
   * Only callers who hold `write` or `admin` on an agent (per `getAllowedVerbs`) may change its
   * model: the loaded rows MUST be filtered by `auth.can("write", r) || auth.can("admin", r)` and
   * the model of any agent the caller cannot edit MUST NOT be written.
   */
  static async bulkUpdateModel(
    auth: Authenticator,
    agentIds: string[],
    model: {
      providerId: ModelProviderIdType;
      modelId: ModelIdType;
      reasoningEffort: ReasoningEffort;
      responseFormat?: string;
    }
  ): Promise<BulkAgentUpdateResult> {
    if (agentIds.length === 0) {
      return { updatedAgentIds: [], skippedAgentIds: [] };
    }

    const workspaceModelId = auth.getNonNullableWorkspace().id;
    const resources = (
      await this.loadResource(workspaceModelId, { sId: agentIds })
    ).filter(
      (r) =>
        r.status !== "archived" &&
        (auth.can("write", r) || auth.can("admin", r))
    );
    const editableIdSet = new Set(resources.map((r) => r.sId));
    const skippedAgentIds = agentIds.filter((id) => !editableIdSet.has(id));
    if (resources.length === 0) {
      return { updatedAgentIds: [], skippedAgentIds };
    }

    const saveResults = await concurrentExecutor(
      resources,
      async (r): Promise<{ sId: string; isUpdated: boolean }> => {
        const params = await r.buildResaveParams(auth);
        const res = await AgentResource._saveConfiguration(auth, {
          ...params,
          agentConfigurationId: r.sId,
          model: {
            ...params.model,
            providerId: model.providerId,
            modelId: model.modelId,
            reasoningEffort: model.reasoningEffort,
            ...(model.responseFormat !== undefined
              ? { responseFormat: model.responseFormat }
              : {}),
          },
        });

        if (res.isErr()) {
          logger.warn(
            {
              workspaceId: auth.getNonNullableWorkspace().sId,
              agentConfigurationId: r.sId,
              modelId: model.modelId,
              error: res.error,
            },
            "Skipped agent while setting the model on a batch of agents"
          );
        }

        return { sId: r.sId, isUpdated: res.isOk() };
      },
      { concurrency: BULK_UPDATE_MODEL_CONCURRENCY }
    );

    const updatedAgentIds = saveResults
      .filter((result) => result.isUpdated)
      .map((result) => result.sId);
    for (const result of saveResults) {
      if (!result.isUpdated) {
        skippedAgentIds.push(result.sId);
      }
    }

    return { updatedAgentIds, skippedAgentIds };
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

    const editorsByAgentId = await this.batchListEditors(auth, agents);
    const editorModelIdsByAgentId = new Map(
      [...editorsByAgentId].map(([agentId, editors]) => [
        agentId,
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
   * Makes `configuration`, one of the agent's own rows, the current one. Called by every path
   * that inserts a configuration row or deletes the current one (see
   * `agent-current-version-pointer` on `AgentModel`).
   */
  async setCurrentConfiguration(
    auth: Authenticator,
    configuration: Pick<AgentConfigurationModel, "agentId" | "version">,
    { transaction }: { transaction: Transaction }
  ): Promise<void> {
    assert(this.scope !== "global");
    assert(auth.getNonNullableWorkspace().id === this.workspaceId);
    assert(
      configuration.agentId === this.id,
      "Unexpected: configuration belongs to another agent"
    );

    await AgentModel.update(
      { currentVersion: configuration.version },
      { where: { id: this.id, workspaceId: this.workspaceId }, transaction }
    );
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

    const grantGroups =
      await GroupPermissionResource.listRegularAutoGroupsForResource(auth, {
        resourceType: "agent",
        resourceId: this.id,
        transaction,
      });
    await GroupPermissionResource.deleteAllForResource(auth, {
      resourceType: "agent",
      resourceId: this.id,
      transaction,
    });

    for (const grantGroup of grantGroups) {
      const deleteResult = await grantGroup.delete(auth, { transaction });
      if (deleteResult.isErr()) {
        throw deleteResult.error;
      }
    }
  }

  // Agent deletion goes through the configuration layer (archive/hard-delete). The resource-level
  // teardown lives in `destroyPermissionsAndGroups`, called after the last configuration is removed.
  async delete(): Promise<Result<undefined, Error>> {
    return new Err(
      new Error(
        "AgentResource.delete is not supported; archive the agent via " +
          "archiveAgentConfiguration and clean up with destroyPermissionsAndGroups."
      )
    );
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
   * `requestedSpaceIds` is a core field carried by every variant, so the gate applies regardless of
   * `light`/`full`. Global agents have no requested spaces and are unaffected.
   */
  getAllowedVerbs(auth: Authenticator): Set<GrantVerb> {
    if (this.scope === "global") {
      assert(isGlobalAgentId(this.sId));

      const roleGrants: RoleGrant[] = globalAgentReaderRoles(this.sId).map(
        (role) => ({ role, permissions: ["read"] })
      );

      return new Set(verbsFromRoleGrants(auth, roleGrants, this.workspaceId));
    }

    assert(this.versionAuthorId !== null);

    const grants = auth.getGovernanceGrantVerbs(
      "agent",
      this.id,
      this.workspaceId
    );
    const isAuthor =
      auth.workspace()?.id === this.workspaceId &&
      auth.user()?.id === this.versionAuthorId;
    const roles =
      this.scope === "visible"
        ? VISIBLE_AGENT_ROLE_GRANTS
        : HIDDEN_AGENT_ROLE_GRANTS;
    const roleGrants: RoleGrant[] =
      auth.isKey() && !auth.isSystemKey()
        ? [...roles, { role: "admin", permissions: ["write"] }]
        : roles;

    const verbs = new Set([
      ...(isAuthor ? [...grants, ...AGENT_EDITOR_VERBS] : grants),
      ...verbsFromRoleGrants(auth, roleGrants, this.workspaceId),
    ]);

    // `read` additionally requires read access to every space backing the agent (see
    // `requestedSpacesReadable`): a caller who cannot read one of them cannot read the agent.
    if (!this.requestedSpacesReadable(auth)) {
      verbs.delete("read");
      verbs.delete("write");
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
    if (this.scope === "global") {
      return SkillResource.fetchByIds(
        auth,
        this.codeDefinedSkillIds,
        fetchContext
      );
    }

    return SkillResource.listByAgentConfigurationModelId(
      auth,
      this.agentConfigurationModelId,
      fetchContext
    );
  }

  /**
   * @cc [owner:sfriquet,label:backend;security] agent-search-serialization
   * Serialize a custom agent from its core fields, deriving user sIds from supplied editor
   * resources; perform no I/O and never include private agent content. `model.reasoning_effort`
   * MUST always carry the effort the agent runs at, never null: an agent that configures none
   * runs at its model's default.
   */
  toSearchDocument(
    workspace: LightWorkspaceType,
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
    assert(
      this.scope !== "global" && this.workspaceId === workspace.id,
      "Search documents require a custom agent in the workspace."
    );
    return {
      workspace_id: workspace.sId,
      agent_id: this.sId,
      status: this.status,
      scope: this.scope,
      model: {
        provider_id: this.modelConfiguration.providerId,
        model_id: this.modelConfiguration.modelId,
        reasoning_effort: getEffectiveReasoningEffort(this.modelConfiguration),
      },
      name: this.name,
      picture_url: this.pictureUrl,
      last_edited_by_user_id: lastEditedByUser?.sId ?? null,
      editor_ids: uniq(editors.map((editor) => editor.sId)).sort(),
      requested_space_ids: this.requestedSpaceIds.map((id) =>
        SpaceResource.modelIdToSId({ id, workspaceId: workspace.id })
      ),
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
      description: this.description,
      skill_ids: uniq(skillIds).sort(),
      mcp_server_view_ids: uniq(mcpServerViewIds).sort(),
      tag_ids: uniq(tagIds).sort(),
      feedback_positive_count: feedbackPositiveCount,
      feedback_negative_count: feedbackNegativeCount,
      active_users_count: activeUsersCount,
      favorite_count: favoriteCount,
    };
  }

  toJSON(): AgentConfigurationBaseType {
    assert(
      this.scope !== "global",
      "Unexpected: `toJSON` called on a global AgentResource"
    );
    const content = this.content;

    return {
      id: this.agentConfigurationModelId,
      agentModelId: this.id,
      versionCreatedAt: content.createdAt.toISOString(),
      sId: this.sId,
      version: content.version,
      versionAuthorId: this.versionAuthorId,
      instructions: content.instructions,
      model: this.modelConfiguration,
      status: this.status,
      scope: this.scope,
      name: this.name,
      description: this.description,
      pictureUrl: this.pictureUrl,
      maxStepsPerRun: content.maxStepsPerRun,
      templateId: content.templateId
        ? TemplateResource.modelIdToSId({ id: content.templateId })
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
      reinforcement: content.reinforcement,
      lastReinforcementAnalysisAt:
        content.lastReinforcementAnalysisAt?.toISOString() ?? null,
      canRead: this._verbs.has("read"),
      // Regular API keys hold `write` from the admin role but may only edit an active version
      // (see the `regular-key-agent-editability` contract on `enrichAgentConfigurations`).
      canEdit:
        this._verbs.has("write") &&
        (!this._isRegularApiKey || this.status === "active"),
    };
  }

  // Creates a brand-new custom agent atomically: its `AgentModel` identity, first
  // `AgentConfigurationModel` version, editor grants, tags, MCP actions and skill associations.
  // Bringing a new agent into the workspace requires the type-wide `create` capability, enforced
  // here (see the `agent-create-capability` contract).
  static async makeNew(
    auth: Authenticator,
    params: SaveAgentConfigurationParams
  ): Promise<Result<AgentResource, Error>> {
    if (!(await auth.hasWorkspacePermission("create", "agent"))) {
      return new Err(new Error("Creating agents is restricted."));
    }

    return this._saveConfiguration(auth, {
      ...params,
      agentConfigurationId: undefined,
    });
  }

  // Creates a new configuration version on `this` agent: archives the prior version and moves the
  // `currentVersion` pointer (or updates a pending agent in place). Editing an agent requires
  // `write` on it, enforced here on `this` (see the `agent-edit-requires-write` contract): the
  // caller resolves the agent first (e.g. `fetchById`), and only an editor may save a new version.
  /**
   * @cc [owner:philipperolet,label:security;product] complete-editor-set-replaces-grants
   * Saving an existing agent with its complete editor set MUST revoke every current editor grant
   * omitted from that set.
   */
  async updateConfiguration(
    auth: Authenticator,
    params: SaveAgentConfigurationParams
  ): Promise<Result<AgentResource, Error>> {
    if (!auth.can("write", this)) {
      return new Err(
        new Error("You don't have permission to edit this agent.")
      );
    }

    return AgentResource._saveConfiguration(auth, {
      ...params,
      agentConfigurationId: this.sId,
    });
  }

  // Persists an agent configuration version and everything that belongs to it (editors, tags, MCP
  // actions, and skill associations) in a single self-owned managed transaction, so a failure
  // anywhere rolls the whole save back before it is returned as `Err`. (In `NODE_ENV=test` the
  // ambient CLS transaction is reused with no savepoint, so this rollback is not exercised by the
  // suite — the test's own transaction rolls back at teardown.)
  /**
   * @cc [owner:tdraier,label:backend] agent-save-atomic
   * The configuration row and everything created with it — editors, tags, MCP actions, and skill
   * associations — MUST be committed in one transaction owned by this method, so a failure in any
   * part leaves no partial agent version behind and needs no external rollback.
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
      actions?: ServerSideMCPServerConfigurationType[];
      skills?: SkillResource[];
    }
  ): Promise<Result<AgentResource, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected `auth` without `workspace`.");
    }

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
      scope,
      owner,
    });
    if (publishCheck.isErr()) {
      return new Err(publishCheck.error);
    }

    // Track removed editors so their triggers can be disabled if this save leaves the agent hidden.
    let removedEditors: UserType[] = [];

    try {
      let template: TemplateResource | null = null;
      if (templateId) {
        template = await TemplateResource.fetchByExternalId(templateId);
      }
      const performCreation = async (
        t: Transaction
      ): Promise<AgentConfigurationModel> => {
        const { existingAgent, version } = await resolveExistingAgentAndVersion(
          auth,
          { agentConfigurationId, authorId, owner, transaction: t }
        );

        const { sId, agentModelId } = await resolveAgentIdentity({
          agentConfigurationId,
          existingAgent,
          owner,
          transaction: t,
        });

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
          scope,
          pictureUrl,
          authorId,
          templateModelId: template?.id,
          requestedSpaceIds,
          reinforcement,
          owner,
          transaction: t,
        });

        // A brand-new agent already starts at version 0; an upgrade moves the pointer.
        if (agentConfigurationInstance.version !== 0) {
          await AgentResource.fromAgentConfigurationModel(
            auth,
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

        if (status === "active") {
          assert(
            editors.some((e) => e.id === authorId) || isAdmin(owner),
            "Unexpected: author must be an editor or admin"
          );
          const agentResource = AgentResource.fromAgentConfigurationModel(
            auth,
            agentConfigurationInstance
          );
          await agentResource.grantEditors(auth, { editors, transaction: t });
          const currentEditors = await agentResource.listEditors(auth, {
            transaction: t,
          });
          assert(currentEditors !== null);
          const editorModelIds = new Set(editors.map((editor) => editor.id));
          removedEditors = currentEditors
            .filter((editor) => !editorModelIds.has(editor.id))
            .map((editor) => editor.toJSON());
          await agentResource.revokeEditors(auth, {
            editors: removedEditors,
            transaction: t,
          });
        }

        // Create the MCP actions and skill associations in the same transaction as the
        // configuration row, so any failure rolls the whole save back and never leaves a partial
        // version behind (see `agent-save-atomic`).
        const savedResource = AgentResource.fromAgentConfigurationModel(
          auth,
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
        if (skills.length > 0) {
          await SkillResource.addManyToAgent(
            auth,
            { agentResource: savedResource, skills },
            { transaction: t }
          );
        }

        return agentConfigurationInstance;
      };

      // Self-owned managed transaction: a throw in `performCreation` auto-rolls-back the whole save
      // before it is converted to an `Err` (see `agent-save-atomic`).
      const agent = await withTransaction(performCreation);

      // The saved version becomes the agent's current version, so any cached resource is now stale
      // (a no-op for a brand-new agent from `makeNew`). The save above is a self-owned transaction,
      // already committed here, so invalidate immediately.
      await AgentResource.invalidateCache(owner.id, agent.sId);

      // Resolve the saved agent through the access-controlled resolver. In every real path the caller
      // is the author (or otherwise holds read), so this is the `full` agent they just wrote.
      const resource = await AgentResource.fetchById(auth, agent.sId);
      if (resource === null) {
        return new Err(
          new Error("Unexpected: the saved agent could not be resolved.")
        );
      }

      // Recording the recent author reads the current version, so it needs the full resource.
      if (resource.isFull()) {
        await agentConfigurationWasUpdatedBy({ agent: resource, auth });
      }

      // Disable triggers for editors who were removed from a hidden agent.
      if (removedEditors.length > 0 && scope === "hidden") {
        const triggersToDisableRes =
          await TriggerResource.listByAgentConfigurationIdAndEditors(auth, {
            agentConfigurationId: resource.sId,
            editorIds: removedEditors.map((editor) => editor.id),
          });
        if (triggersToDisableRes.isOk()) {
          for (const trigger of triggersToDisableRes.value) {
            const disableResult = await trigger.disable(auth);
            if (disableResult.isErr()) {
              logger.error(
                {
                  workspaceId: owner.sId,
                  agentConfigurationId: resource.sId,
                  triggerId: trigger.sId,
                  error: disableResult.error,
                },
                `Failed to disable trigger ${trigger.sId} when removing editor from agent ${resource.sId}`
              );
            }
          }
        }
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
            scope: scope,
            model: `${model.providerId}/${model.modelId}`,
          },
        });
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
      variant: this.variant,
    };
  }
}
