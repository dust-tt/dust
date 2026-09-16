import { globalAgentReaderRoles } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentConfigurationModel,
  AgentModel,
} from "@app/lib/models/agent/agent";
import type { ResourceLogJSON } from "@app/lib/resources/base_resource";
import { BaseResource } from "@app/lib/resources/base_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  AgentReinforcementMode,
  AgentStatus,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
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
import { Err } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType } from "@app/types/user";
import assert from "assert";
import type { Attributes, Transaction } from "sequelize";

// Legacy `canEdit` also allows changing the editor set, so the author fallback mirrors the full
// editor role rather than granting write alone.
const AGENT_EDITOR_VERBS: GrantVerb[] = ["read", "write", "admin"];

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
  agentConfigurationModelId: ModelId;
  version: number;
  status: AgentStatus;
  instructions: string | null;
  instructionsHtml: string | null;
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  temperature: number;
  reasoningEffort: ReasoningEffort | null;
  responseFormat: string | undefined;
  pictureUrl: string;
  maxStepsPerRun: number;
  templateId: ModelId | null;
  reinforcement: AgentReinforcementMode;
  lastReinforcementAnalysisAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AgentResourceExtraBlob = {
  scope: AgentConfigurationScope;
  name: string;
  description: string;
  versionAuthorId: ModelId | null;
  requestedSpaceIds: ModelId[];
  content: AgentResourceContent | null;
};

// A `full` resource always exposes its `content`.
export interface FullAgentResource extends AgentResource {
  readonly variant: "full";
}

// The stable identity of an agent, backed by `AgentModel` (so `id` is the agent's `agentModelId`).
// It comes in two shapes, discriminated by `variant`:
// - `light`: identity + `scope`/`name`/`description`/`versionAuthorId`/`requestedSpaceIds`, built
//   without a query from a configuration already in hand. Sufficient for permission decisions.
// - `full`: additionally carries `content` (every remaining `AgentConfigurationModel` column of the
//   latest active version). Produced by the access-controlled `fetch*` resolvers.
/**
 * @cc [owner:tdraier,label:backend] agent-resource-identity
 * The authoritative resolvers `fetchByModelIdWithAuth`/`fetchByModelIds`/`fetchById(s)` MUST return
 * a custom agent's latest active configuration version, so two fetched resources sharing an `id`
 * (= `agentModelId`) are consistent at a given time. The `from*` factories are an unchecked fast
 * path: they build a resource from whatever configuration the caller supplies, and do NOT yet
 * guarantee it is the latest active version — a caller deciding about the agent's current state must
 * pass that version, or use `fetch*`. (`from*` are intended to become private and enforce this.)
 * Global agents are exempt from the `id`-consistency clause: they have no `agent` row, are
 * identified by `sId`, and all share the `id: -1` sentinel.
 */
export class AgentResource
  extends BaseResource<AgentModel>
  implements WithAccessControl
{
  readonly sId: string;
  readonly workspaceId: ModelId;
  readonly scope: AgentConfigurationScope;
  readonly name: string;
  readonly description: string;
  private readonly versionAuthorId: ModelId | null;
  private readonly requestedSpaceIds: ModelId[];
  // Mutable so a light resource can be enriched to full in place once read access is confirmed
  // (see `fromAgentConfigurationModel`). `variant` is derived from its presence.
  private _content: AgentResourceContent | null;

  private constructor(
    blob: Attributes<AgentModel>,
    extra: AgentResourceExtraBlob
  ) {
    super(AgentModel, blob);

    this.sId = blob.sId;
    this.workspaceId = blob.workspaceId;
    this.scope = extra.scope;
    this.name = extra.name;
    this.description = extra.description;
    this.versionAuthorId = extra.versionAuthorId;
    this.requestedSpaceIds = extra.requestedSpaceIds;
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
      },
      {
        scope: configuration.scope,
        name: configuration.name,
        description: configuration.description,
        versionAuthorId: configuration.versionAuthorId,
        // `LightAgentConfigurationType.requestedSpaceIds` are space sIds; the resource holds model ids.
        requestedSpaceIds: removeNulls(
          configuration.requestedSpaceIds.map(getResourceIdFromSId)
        ),
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
      },
      {
        scope: "global",
        name: configuration.name,
        description: configuration.description,
        versionAuthorId: null,
        requestedSpaceIds: [],
        content: null,
      }
    );
  }

  // -- Full/light factory --

  // Builds a resource from an already-loaded configuration row: `full` (with `content`) when the
  // caller can read the agent, `light` otherwise. Read access depends only on core fields, so it is
  // decided on the light resource and the (larger) content payload is materialized only when needed.
  static fromAgentConfigurationModel(
    auth: Authenticator,
    configuration: AgentConfigurationModel
  ): AgentResource {
    const resource = new AgentResource(
      {
        id: configuration.agentId,
        workspaceId: configuration.workspaceId,
        sId: configuration.sId,
        createdAt: configuration.createdAt,
        updatedAt: configuration.updatedAt,
      },
      {
        scope: configuration.scope,
        name: configuration.name,
        description: configuration.description,
        versionAuthorId: configuration.authorId,
        requestedSpaceIds: configuration.requestedSpaceIds,
        content: null,
      }
    );

    if (auth.can("read", resource)) {
      resource._content = {
        agentConfigurationModelId: configuration.id,
        version: configuration.version,
        status: configuration.status,
        instructions: configuration.instructions,
        instructionsHtml: configuration.instructionsHtml,
        providerId: configuration.providerId,
        modelId: configuration.modelId,
        temperature: configuration.temperature,
        reasoningEffort: configuration.reasoningEffort,
        responseFormat: configuration.responseFormat,
        pictureUrl: configuration.pictureUrl,
        maxStepsPerRun: configuration.maxStepsPerRun,
        templateId: configuration.templateId,
        reinforcement: configuration.reinforcement,
        lastReinforcementAnalysisAt: configuration.lastReinforcementAnalysisAt,
        createdAt: configuration.createdAt,
        updatedAt: configuration.updatedAt,
      };
    }

    return resource;
  }

  // -- Resolvers: latest active version, full when readable, light otherwise --

  /**
   * @cc [owner:tdraier,label:backend] fetch-latest-active-version
   * Resolves each requested agent to its single latest active configuration version, scoped to the
   * authed workspace. Each is returned as a `full` resource when the caller can read it, otherwise a
   * `light` resource. An agent with no active version (archived or never activated) yields no
   * resource, and at most one resource is returned per `agentModelId`.
   */
  static async fetchByModelIds(
    auth: Authenticator,
    agentModelIds: ModelId[]
  ): Promise<AgentResource[]> {
    if (agentModelIds.length === 0) {
      return [];
    }

    const configurations = await AgentConfigurationModel.findAll({
      where: {
        agentId: agentModelIds,
        status: "active",
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      order: [["version", "DESC"]],
    });

    return this.buildLatestActive(auth, configurations);
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

    const configurations = await AgentConfigurationModel.findAll({
      where: {
        sId: agentIds,
        status: "active",
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      order: [["version", "DESC"]],
    });

    return this.buildLatestActive(auth, configurations);
  }

  static async fetchById(
    auth: Authenticator,
    agentId: string
  ): Promise<AgentResource | null> {
    const [resource] = await this.fetchByIds(auth, [agentId]);
    return resource ?? null;
  }

  // Keeps a single resource per agent — the highest active version, thanks to the version-DESC
  // order. Each is full or light per the caller's read access (see `fromAgentConfigurationModel`).
  private static buildLatestActive(
    auth: Authenticator,
    configurations: AgentConfigurationModel[]
  ): AgentResource[] {
    const seenAgentModelIds = new Set<ModelId>();
    const resources: AgentResource[] = [];
    for (const configuration of configurations) {
      if (seenAgentModelIds.has(configuration.agentId)) {
        continue;
      }
      seenAgentModelIds.add(configuration.agentId);

      resources.push(this.fromAgentConfigurationModel(auth, configuration));
    }
    return resources;
  }

  async listEditors(auth: Authenticator): Promise<UserResource[] | null> {
    const editorsByAgentId = await AgentResource.batchListEditors(auth, [this]);
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
    agents: AgentResource[]
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
      await GroupResource.getActiveMembershipsForGroups(auth, [
        ...groupByAgentModelId.values(),
      ]);
    const userModelIds = [
      ...new Set(Object.values(membershipsByGroupId).flat()),
    ];
    const users = await UserResource.fetchByModelIds(userModelIds);
    const { memberships } = await MembershipResource.getActiveMemberships({
      users,
      workspace: auth.getNonNullableWorkspace(),
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
  private requestedSpacesReadable(auth: Authenticator): boolean {
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

  toLogJSON(): ResourceLogJSON {
    return {
      agentModelId: this.id,
      sId: this.sId,
      variant: this.variant,
    };
  }
}
