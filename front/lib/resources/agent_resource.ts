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
const AGENT_EDITOR_VERBS: GrantVerb[] = ["read", "write", "admin", "use"];

// Human workspace admins manage editors but must grant themselves editor access to change the agent.
// Admins do not receive `use` on hidden agents: a hidden agent is usable only by its editors, not by
// virtue of the workspace admin role.
const HIDDEN_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["read", "admin"] },
];

// Visible agents are readable by every workspace role and usable by every active role, including
// admins (who additionally keep the hidden-grant `admin` verb). The `none` role — a revoked /
// non-member caller — can read but not use.
const VISIBLE_AGENT_ROLE_GRANTS: RoleGrant[] = [
  { role: "admin", permissions: ["read", "admin", "use"] },
  { role: "manager", permissions: ["read", "use"] },
  { role: "builder", permissions: ["read", "use"] },
  { role: "user", permissions: ["read", "use"] },
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
  requestedSpaceIds: number[];
  createdAt: Date;
  updatedAt: Date;
};

type AgentResourceExtraBlob = {
  variant: "light" | "full";
  scope: AgentConfigurationScope;
  name: string;
  description: string;
  versionAuthorId: ModelId | null;
  content: AgentResourceContent | null;
};

// A `full` resource always exposes its `content`.
export interface FullAgentResource extends AgentResource {
  readonly variant: "full";
}

// The stable identity of an agent, backed by `AgentModel` (so `id` is the agent's `agentModelId`).
// It comes in two shapes, discriminated by `variant`:
// - `light`: identity + `scope`/`name`/`description`/`versionAuthorId`, built without a query from a
//   configuration already in hand. Sufficient for permission decisions.
// - `full`: additionally carries `content` (every remaining `AgentConfigurationModel` column of the
//   latest active version). Produced by the access-controlled `fetch*` resolvers.
/**
 * @cc [owner:tdraier,label:backend] agent-resource-identity
 * An `AgentResource`'s content (`scope`, author, and `full` `content`) MUST reflect the agent's
 * latest active configuration version, and two `AgentResource`s sharing an `id` MUST be consistent
 * at a given time. `fetchByModelIdWithAuth`/`fetchByModelIds`/`fetchById(s)` are the authoritative
 * resolvers.
 */
export class AgentResource
  extends BaseResource<AgentModel>
  implements WithAccessControl
{
  readonly sId: string;
  readonly workspaceId: ModelId;
  readonly variant: "light" | "full";
  readonly scope: AgentConfigurationScope;
  readonly name: string;
  readonly description: string;
  private readonly versionAuthorId: ModelId | null;
  private readonly _content: AgentResourceContent | null;

  private constructor(
    blob: Attributes<AgentModel>,
    extra: AgentResourceExtraBlob
  ) {
    super(AgentModel, blob);

    this.sId = blob.sId;
    this.workspaceId = blob.workspaceId;
    this.variant = extra.variant;
    this.scope = extra.scope;
    this.name = extra.name;
    this.description = extra.description;
    this.versionAuthorId = extra.versionAuthorId;
    this._content = extra.content;
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
    configuration: Pick<
      LightAgentConfigurationType,
      | "agentModelId"
      | "sId"
      | "scope"
      | "versionAuthorId"
      | "name"
      | "description"
    >
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
        variant: "light",
        scope: configuration.scope,
        name: configuration.name,
        description: configuration.description,
        versionAuthorId: configuration.versionAuthorId,
        content: null,
      }
    );
  }

  static fromAgentConfigurations(
    auth: Authenticator,
    configurations: Pick<
      LightAgentConfigurationType,
      | "agentModelId"
      | "sId"
      | "scope"
      | "versionAuthorId"
      | "name"
      | "description"
    >[]
  ): AgentResource[] {
    return configurations.map((configuration) =>
      this.fromAgentConfiguration(auth, configuration)
    );
  }

  // Global agents are code-defined and have no `agent`/configuration rows; their
  // `AgentConfigurationType` is built from synthetic values by `getGlobalAgent(s)`.
  static fromGlobalAgent(
    auth: Authenticator,
    configuration: Pick<AgentConfigurationType, "sId" | "name" | "description">
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
        variant: "light",
        scope: "global",
        name: configuration.name,
        description: configuration.description,
        versionAuthorId: null,
        content: null,
      }
    );
  }

  // -- Full/light factory --

  // Builds a resource from an already-loaded configuration row: `full` (with `content`) when the
  // caller can read the agent, `light` otherwise. `getAllowedVerbs` depends only on core fields, so
  // the read decision is the same regardless of the returned variant.
  static fromAgentConfigurationModel(
    auth: Authenticator,
    configuration: AgentConfigurationModel
  ): AgentResource {
    const blob: Attributes<AgentModel> = {
      id: configuration.agentId,
      workspaceId: configuration.workspaceId,
      sId: configuration.sId,
      createdAt: configuration.createdAt,
      updatedAt: configuration.updatedAt,
    };
    const core = {
      scope: configuration.scope,
      name: configuration.name,
      description: configuration.description,
      versionAuthorId: configuration.authorId,
    };

    const full = new AgentResource(blob, {
      ...core,
      variant: "full",
      content: {
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
        requestedSpaceIds: configuration.requestedSpaceIds,
        createdAt: configuration.createdAt,
        updatedAt: configuration.updatedAt,
      },
    });

    if (auth.can("read", full)) {
      return full;
    }

    return new AgentResource(blob, {
      ...core,
      variant: "light",
      content: null,
    });
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

  /**
   * @cc [owner:philipperolet,label:security] admin-key-agent-write
   * The admin role grants `write` on custom agents to regular API keys only; human and system-key
   * callers receive no agent write access from their role. Global agents remain read-only.
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

    const grants = auth.getGovernanceGrantVerbs("agent", this.id);
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

    return new Set([
      ...(isAuthor ? [...grants, ...AGENT_EDITOR_VERBS] : grants),
      ...verbsFromRoleGrants(auth, roleGrants, this.workspaceId),
    ]);
  }

  toLogJSON(): ResourceLogJSON {
    return {
      agentModelId: this.id,
      sId: this.sId,
      variant: this.variant,
    };
  }
}
